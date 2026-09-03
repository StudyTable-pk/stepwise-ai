import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, int, serverError } from "@/lib/apiHelpers";
import { getSession, getBoardObjects, getAiMessages } from "@/lib/sessionsRepo";
import { isDemoMode, getAIProvider } from "@/lib/ai";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// GET /api/sessions/:id — full session recovery payload (spec part 66:
// question, board, AI state, steps, errors, hints must survive refresh).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const sessionId = int(params.id, -1);
    const session = getSession(user.id, sessionId);
    if (!session) return notFound();

    const objects = getBoardObjects(user.id, session.board_id);
    const messages = getAiMessages(user.id, sessionId);

    let stateData: Record<string, unknown> = {};
    try {
      stateData = JSON.parse(session.state_json) as Record<string, unknown>;
    } catch {
      stateData = {};
    }

    return ok({
      session: {
        id: session.id,
        status: session.status,
        state: session.state,
        currentStep: session.current_step,
        activeSeconds: session.active_seconds,
        startedAt: session.started_at,
        question: session.question_text,
        analysis: session.analysis,
        stateData,
        boardId: session.board_id,
        boardTitle: session.board_title
      },
      objects,
      messages,
      provider: { displayName: getAIProvider().info.displayName, isDemo: isDemoMode() }
    });
  } catch {
    return serverError();
  }
}
