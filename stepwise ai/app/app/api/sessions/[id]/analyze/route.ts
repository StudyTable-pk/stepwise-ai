import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, fail, int, str, serverError } from "@/lib/apiHelpers";
import {
  getSession,
  getBoardObjects,
  updateSessionState,
  addAiMessage,
  recordErrors,
  markErrorsCorrected,
  attachmentContext
} from "@/lib/sessionsRepo";
import { getAIProvider } from "@/lib/ai";
import { attemptWithHandwriting } from "@/lib/handwriting";
import { decideIntervention, stateAfterEvaluation } from "@/lib/teaching";
import { db, nowIso } from "@/lib/db";
import type { AgeBand, EvaluationContext, ExplanationDepth, HintLevel } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/sessions/:id/analyze — AI observes and evaluates the current
// step. Called only on meaningful submissions (spec part 39: never per
// keystroke or object move).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const sessionId = int(params.id, -1);
    const session = getSession(user.id, sessionId);
    if (!session) return notFound();
    if (session.status === "completed") {
      return fail("SESSION_COMPLETED", "This session is already finished.");
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const stepIndex = int(body.stepIndex, session.current_step);
    let attemptText = str(body.attemptText, "", 20000);
    const activeSeconds = int(body.activeSeconds, session.active_seconds);

    const steps = session.analysis.steps;
    if (stepIndex < 0 || stepIndex >= steps.length) {
      return fail("INVALID_STEP", "That step doesn't exist.");
    }
    const step = steps[stepIndex];

    // Context: only what's necessary (spec part 23).
    const objects = getBoardObjects(user.id, session.board_id);
    // Handwritten answers: draw-tool ink is transcribed by AI vision and
    // folded into the attempt so evaluation can read scribbled answers.
    attemptText = await attemptWithHandwriting(objects, attemptText);
    const profile = db.get("profiles", { user_id: user.id }) as
      | { age_band: AgeBand; explanation_depth: ExplanationDepth }
      | null;

    const hintLevels = db
      .all("hints", { session_id: sessionId }, { key: "id" })
      .map((h) => Number(h.level) as HintLevel);

    let stateData: Record<string, unknown> = {};
    try {
      stateData = JSON.parse(session.state_json) as Record<string, unknown>;
    } catch {
      stateData = {};
    }
    const hintsSinceLastError = int(stateData.hintsSinceLastError, 0);

    const ctx: EvaluationContext = {
      question: session.analysis,
      step,
      attemptText,
      board: {
        objects: objects.map((o) => ({
          id: o.id,
          type: o.type,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          content: o.content,
          owner: o.owner
        }))
      },
      previousHints: hintLevels,
      studentLevel: profile?.age_band ?? "ADULT",
      depth: profile?.explanation_depth ?? "STANDARD",
      attachments: attachmentContext(user.id, sessionId)
    };

    const ai = getAIProvider();
    const evaluation = await ai.evaluateStudentWork(ctx);
    evaluation.interventionLevel = decideIntervention(
      evaluation.status,
      evaluation.interventionLevel
    );

    // Persist evidence.
    const wasErrorState = ["ERROR", "PARTIAL"].includes(session.state);
    if (evaluation.errors.length > 0) {
      recordErrors(
        user.id,
        sessionId,
        evaluation.errors.map((e) => ({
          category: e.category,
          severity: e.severity,
          description: e.description
        }))
      );
    } else if (wasErrorState && (evaluation.status === "correct" || evaluation.status === "partial")) {
      // Student fixed the flagged issues. Self-correction only when no hint
      // was consumed between the error and the fix (evidence of independence).
      markErrorsCorrected(user.id, sessionId, hintsSinceLastError === 0);
      if (hintsSinceLastError === 0) {
        const fixed =
          (Array.isArray(stateData.selfCorrections) ? (stateData.selfCorrections as string[]) : []);
        fixed.push(`Independently reconsidered: ${step.title}`);
        stateData.selfCorrections = fixed;
      }
    }

    // State machine transition.
    const newState = stateAfterEvaluation(evaluation.status);
    let nextStepIndex = session.current_step;
    let stepJustCompleted = false;
    if (evaluation.status === "correct") {
      stepJustCompleted = true;
      nextStepIndex = Math.min(stepIndex + 1, steps.length - 1);
      const completed: number[] = Array.isArray(stateData.stepsCompleted)
        ? [...new Set([...(stateData.stepsCompleted as number[]), stepIndex])]
        : [stepIndex];
      stateData.stepsCompleted = completed;
      stateData.hintsSinceLastError = 0;
      stateData.lastAttempt = attemptText.slice(0, 4000);
      if (!stateData.initialAttempt) stateData.initialAttempt = attemptText.slice(0, 4000);
      if (completed.length >= steps.length) {
        stateData.finalAttempt = attemptText.slice(0, 4000);
      }
    } else if (evaluation.status === "error") {
      stateData.hintsSinceLastError = 0;
    }
    stateData.lastEvaluation = evaluation.status;
    stateData.failedChecks =
      evaluation.status === "correct" ? 0 : int(stateData.failedChecks, 0) + 1;

    const allDone =
      Array.isArray(stateData.stepsCompleted) &&
      (stateData.stepsCompleted as number[]).length >= steps.length;

    updateSessionState(user.id, sessionId, {
      state: allDone ? "INTEGRATION" : newState,
      current_step: evaluation.status === "correct" && allDone ? stepIndex : nextStepIndex,
      state_json: JSON.stringify(stateData),
      active_seconds: Math.max(activeSeconds, session.active_seconds)
    });

    addAiMessage(user.id, sessionId, "evaluation", {
      stepIndex,
      evaluation: {
        status: evaluation.status,
        summary: evaluation.summary,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        missingElements: evaluation.missingElements,
        nextAction: evaluation.nextAction
      }
    });
    db.insert("learning_events", {
      user_id: user.id,
      session_id: sessionId,
      event_type: evaluation.status === "error" ? "mistake_detected" : "answer_submitted",
      detail_json: JSON.stringify({ stepIndex, status: evaluation.status }),
      created_at: nowIso()
    });

    return ok({
      evaluation,
      stepJustCompleted,
      stepCompleted: stepIndex,
      nextStepIndex: allDone ? stepIndex : evaluation.status === "correct" ? nextStepIndex : stepIndex,
      allStepsDone: allDone,
      sessionState: allDone ? "INTEGRATION" : newState
    });
  } catch {
    return serverError();
  }
}
