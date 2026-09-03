// ============================================================================
// Session attachments — the student gives the AI material to work with.
//   POST /api/sessions/:id/attachments   multipart upload (image or PDF)
//   GET  /api/sessions/:id/attachments   list what the AI can currently see
// Images are also placed on the board; every file gets an AI summary (Gemini,
// falling back to local PDF text extraction) that joins the evaluation context.
// ============================================================================
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, fail, int, serverError } from "@/lib/apiHelpers";
import {
  getSession,
  insertAttachment,
  listAttachments,
  insertStudentImageObject
} from "@/lib/sessionsRepo";
import { saveUploadFile, extractPdfText } from "@/lib/files";
import { geminiDescribeFile } from "@/lib/ai/gemini";

export const runtime = "nodejs";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const sessionId = int(params.id, -1);
    const session = getSession(user.id, sessionId);
    if (!session) return notFound();
    return ok({ attachments: listAttachments(user.id, sessionId) });
  } catch {
    return serverError();
  }
}

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

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return fail("NO_FILE", "Choose a picture or a PDF to attach.");
    }
    if (file.size <= 0) return fail("EMPTY_FILE", "That file is empty.");
    if (file.size > MAX_SIZE) return fail("FILE_TOO_LARGE", "Files must be under 8 MB.");

    const mime = (file.type || "").toLowerCase();
    const isPdf = mime === "application/pdf";
    const isImage = IMAGE_TYPES.has(mime);
    if (!isPdf && !isImage) {
      return fail("UNSUPPORTED_TYPE", "Attach a picture (PNG/JPEG/WebP/GIF) or a PDF.");
    }
    const kind = isPdf ? "pdf" : "image";

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const name = (file.name || (kind === "pdf" ? "document.pdf" : "picture.png")).slice(0, 200);

    // Ask Gemini to read the file (images and PDFs are understood natively).
    // Without a key or on quota errors: PDFs fall back to local text extraction.
    let summary = await geminiDescribeFile(kind, base64, mime, name, session.analysis.topic);
    if (!summary && isPdf) {
      summary = await extractPdfText(buffer);
    }

    const ext = kind === "pdf" ? "pdf" : (mime.split("/")[1] ?? "png").split("+")[0];
    const saved = saveUploadFile(buffer, ext);
    const attachment = insertAttachment(user.id, sessionId, {
      kind,
      name,
      mime,
      url: saved.url,
      summary
    });
    if (!attachment) return serverError();

    // Pictures land on the board too, as the student's own movable object.
    const object = isImage
      ? insertStudentImageObject(user.id, session.board_id, { url: saved.url, title: name })
      : null;

    return ok({ attachment, object });
  } catch {
    return serverError();
  }
}
