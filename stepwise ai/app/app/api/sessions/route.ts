import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, fail, str, serverError } from "@/lib/apiHelpers";
import { getAIProvider } from "@/lib/ai";
import {
  createLearningSession,
  getStagedAttachments,
  claimStagedAttachments,
  insertStudentImageObject
} from "@/lib/sessionsRepo";

export const runtime = "nodejs";

// POST /api/sessions — student submits a question; AI understands it,
// then the Board opens (spec part 65: never send the student to a chat).
export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const question = str(body.question, "", 4000);
    const attachmentIds = (Array.isArray(body.attachmentIds) ? body.attachmentIds : [])
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0)
      .slice(0, 6);

    // Files attached on the question bar were already read by the AI at
    // upload time; their summaries become the teaching material so the
    // lesson steps are drawn from the document itself.
    const staged = attachmentIds.length > 0 ? getStagedAttachments(user.id, attachmentIds) : [];
    const materials = staged
      .map((a) => `[${a.kind}] ${a.name}: ${a.summary.trim() || "(the file could not be read)"}`)
      .join("\n\n")
      .slice(0, 8000);

    if (question.length < 2 && materials.length === 0) {
      return fail("EMPTY_QUESTION", "Tell StepWise what you want to learn.");
    }

    const ai = getAIProvider();
    const analysis = await ai.analyzeQuestion(question.length >= 2 ? question : `Teach me the attached material and quiz me on it.`, materials || undefined);
    if (analysis.clarifyQuestion) {
      return ok({ needsClarification: true, clarifyQuestion: analysis.clarifyQuestion });
    }

    // AI draws a starter diagram/flowchart onto the board (structure only).
    const starter = await ai.generateStarterBoard(analysis).catch(() => []);

    const session = createLearningSession(user.id, question.length >= 2 ? question : `Teach me the attached material (${staged.map((a) => a.name).join(", ")}) and quiz me on it.`, analysis, starter);

    // Claim the staged rows for this session; images also land on the board.
    if (staged.length > 0) {
      claimStagedAttachments(user.id, session.id, staged.map((a) => a.id));
      for (const a of staged) {
        if (a.kind === "image") {
          insertStudentImageObject(user.id, session.board_id, { url: a.url, title: a.name });
        }
      }
    }

    return ok(
      {
        sessionId: session.id,
        boardId: session.board_id,
        state: session.state,
        topic: analysis.topic,
        introduction: analysis.introduction,
        steps: analysis.steps,
        provider: { displayName: ai.info.displayName, isDemo: ai.info.isDemo }
      },
      201
    );
  } catch {
    return serverError();
  }
}

export async function GET() {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const { listSessions } = await import("@/lib/sessionsRepo");
    return ok({ sessions: listSessions(user.id, 30) });
  } catch {
    return serverError();
  }
}
