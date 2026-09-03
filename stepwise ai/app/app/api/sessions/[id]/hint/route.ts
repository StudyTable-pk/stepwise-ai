import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, fail, int, str, serverError } from "@/lib/apiHelpers";
import {
  getSession,
  getBoardObjects,
  updateSessionState,
  addAiMessage,
  recordHint,
  attachmentContext
} from "@/lib/sessionsRepo";
import { getAIProvider } from "@/lib/ai";
import { attemptWithHandwriting } from "@/lib/handwriting";
import { nextHintLevel } from "@/lib/teaching";
import { db } from "@/lib/db";
import type { AgeBand, EvaluationContext, ExplanationDepth, HintLevel } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/sessions/:id/hint — escalating hints, never the raw answer
// (spec part 32 + doc 05 hint ladder).
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
    let attemptText = str(body.attemptText, "", 20000);

    const stepIndex = Math.min(session.current_step, session.analysis.steps.length - 1);
    const step = session.analysis.steps[stepIndex];

    const profile = db.get("profiles", { user_id: user.id }) as
      | { age_band: AgeBand; explanation_depth: ExplanationDepth }
      | null;

    const previous = db
      .all("hints", { session_id: sessionId }, { key: "id" })
      .map((h) => Number(h.level) as HintLevel);

    const level = nextHintLevel(previous);

    const objects = getBoardObjects(user.id, session.board_id);
    // Handwritten answers: draw-tool ink is transcribed by AI vision and
    // folded into the attempt so hints can read scribbled answers too.
    attemptText = await attemptWithHandwriting(objects, attemptText);
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
      previousHints: previous,
      studentLevel: profile?.age_band ?? "ADULT",
      depth: profile?.explanation_depth ?? "STANDARD",
      attachments: attachmentContext(user.id, sessionId)
    };

    const ai = getAIProvider();
    const hint = await ai.generateHint(ctx, level);

    recordHint(user.id, sessionId, level, hint.message);
    addAiMessage(user.id, sessionId, "hint", { stepIndex, hint });

    // A hint consumed after an error means a later fix is not independent.
    let stateData: Record<string, unknown> = {};
    try {
      stateData = JSON.parse(session.state_json) as Record<string, unknown>;
    } catch {
      stateData = {};
    }
    stateData.hintsSinceLastError = int(stateData.hintsSinceLastError, 0) + 1;
    updateSessionState(user.id, sessionId, {
      state: "GUIDANCE",
      state_json: JSON.stringify(stateData)
    });

    return ok({ hint, level });
  } catch {
    return serverError();
  }
}
