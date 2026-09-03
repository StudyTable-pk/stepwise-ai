import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, fail, int, str, serverError } from "@/lib/apiHelpers";
import { getSession, getSessionStats, updateSessionState } from "@/lib/sessionsRepo";
import { getAIProvider } from "@/lib/ai";
import { updateLearningJourney } from "@/lib/journey";
import { db, nowIso } from "@/lib/db";
import type { DetectedError, FinalReport } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/sessions/:id/complete — finalize: generate Final Report,
// validate it, save it, and update the Learning Journey atomically
// (spec parts 28, 71, 73, 74 — idempotent, no partial state).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const sessionId = int(params.id, -1);
    const session = getSession(user.id, sessionId);
    if (!session) return notFound();

    // Idempotency: never generate a duplicate report (part 74).
    const existing = db.get("reports", { session_id: sessionId, user_id: user.id });
    if (existing) {
      return ok({ report: JSON.parse(String(existing.report_json)) as FinalReport, alreadyExisted: true });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const activeSeconds = int(body.activeSeconds, session.active_seconds);

    const stats = getSessionStats(user.id, session);
    stats.activeSeconds = Math.max(activeSeconds, stats.activeSeconds);

    let stateData: Record<string, unknown> = {};
    try {
      stateData = JSON.parse(session.state_json) as Record<string, unknown>;
    } catch {
      stateData = {};
    }

    const errors: DetectedError[] = stats.errors.map((e) => ({
      category: e.category as DetectedError["category"],
      severity: e.severity as DetectedError["severity"],
      description: e.description,
      objectIds: [],
      corrected: e.corrected,
      selfCorrected: e.selfCorrected
    }));

    const misconceptionDescriptions = errors
      .filter((e) => e.category === "CONCEPTUAL")
      .map((e) => ({ description: e.description, concept: session.analysis.topic }));

    const ai = getAIProvider();
    const report = await ai.generateFinalReport({
      question: session.analysis,
      sessionStats: {
        activeSeconds: stats.activeSeconds,
        totalSeconds: stats.totalSeconds,
        hintsUsed: stats.hintsUsed as never[],
        errors,
        selfCorrections: Array.isArray(stateData.selfCorrections)
          ? (stateData.selfCorrections as string[])
          : [],
        stepsCompleted: Array.isArray(stateData.stepsCompleted)
          ? (stateData.stepsCompleted as number[]).length
          : 0,
        stepsTotal: stats.stepsTotal,
        initialAttempt: str(stateData.initialAttempt, "", 4000),
        finalAttempt: str(stateData.finalAttempt, str(stateData.lastAttempt, "", 4000), 4000)
      }
    });
    report.sessionId = String(sessionId);

    // Atomic: report + session finalization together (part 73).
    db.transaction(() => {
      db.insert("reports", {
        session_id: sessionId,
        user_id: user.id,
        report_json: JSON.stringify(report),
        created_at: nowIso()
      });

      updateSessionState(user.id, sessionId, {
        state: "SESSION_COMPLETE",
        status: "completed",
        active_seconds: stats.activeSeconds
      });

      db.insert("learning_events", {
        user_id: user.id,
        session_id: sessionId,
        event_type: "session_completed",
        detail_json: JSON.stringify({ topic: session.analysis.topic }),
        created_at: nowIso()
      });
    });

    const journeyResult = updateLearningJourney({
      userId: user.id,
      sessionId,
      subject: session.analysis.subject,
      topic: session.analysis.topic,
      concepts: session.analysis.requiredConcepts,
      stepsCompleted: Array.isArray(stateData.stepsCompleted)
        ? (stateData.stepsCompleted as number[]).length
        : 0,
      stepsTotal: stats.stepsTotal,
      errors,
      selfCorrections: Array.isArray(stateData.selfCorrections)
        ? (stateData.selfCorrections as string[])
        : [],
      hintsUsedCount: stats.hintsUsed.length,
      misconceptionDescriptions
    });

    return ok({ report, journey: journeyResult });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return notFound();
    return serverError();
  }
}
