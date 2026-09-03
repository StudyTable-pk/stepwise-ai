import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, fail, int, str, serverError } from "@/lib/apiHelpers";
import {
  getSession,
  getBoardObjects,
  insertAiObjects,
  addAiMessage
} from "@/lib/sessionsRepo";
import { getAIProvider } from "@/lib/ai";
import { offsetObjects } from "@/lib/ai/starter";
import { db, nowIso } from "@/lib/db";
import type { AgeBand, EvaluationContext, ExplanationDepth, HintLevel } from "@/lib/types";

export const runtime = "nodejs";

// POST /api/sessions/:id/visual-aid — the AI draws a supporting flowchart
// or table onto the board for the current step (owner "ai", read-only).
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
    const rawKind = str(body.kind, "flowchart");
    const kind: "table" | "flowchart" = rawKind === "table" ? "table" : "flowchart";

    // Minimal context for the provider (spec part 23).
    const objects = getBoardObjects(user.id, session.board_id);
    const profile = db.get("profiles", { user_id: user.id }) as
      | { age_band: AgeBand; explanation_depth: ExplanationDepth }
      | null;
    const hintLevels = db
      .all("hints", { session_id: sessionId }, { key: "id" })
      .map((h) => Number(h.level) as HintLevel);
    const steps = session.analysis.steps;
    const step = steps[Math.min(session.current_step, steps.length - 1)];

    const ctx: EvaluationContext = {
      question: session.analysis,
      step,
      attemptText: "",
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
      depth: profile?.explanation_depth ?? "STANDARD"
    };

    const ai = getAIProvider();
    const aid = await ai.generateVisualAid(ctx, kind);
    if (aid.length === 0) {
      return fail("NO_VISUAL_AID", "The AI couldn't produce a visual aid for this step.");
    }

    // Place the aid in free space, to the right of everything on the board.
    const maxX = objects.reduce((m, o) => Math.max(m, o.x + o.width), 0);
    const minX = Math.min(...aid.map((o) => o.x));
    const placed = offsetObjects(aid, maxX + 120 - minX, 0).slice(0, 16);

    const inserted = insertAiObjects(user.id, session.board_id, placed);
    if (inserted.length === 0) return serverError();

    addAiMessage(user.id, sessionId, "visual_aid", { kind, count: inserted.length });
    db.insert("learning_events", {
      user_id: user.id,
      session_id: sessionId,
      event_type: "visual_aid_generated",
      detail_json: JSON.stringify({ kind, stepIndex: session.current_step }),
      created_at: nowIso()
    });

    return ok({ kind, objects: inserted });
  } catch {
    return serverError();
  }
}
