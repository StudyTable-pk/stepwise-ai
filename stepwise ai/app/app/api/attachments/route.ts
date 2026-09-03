// ============================================================================
// Staged attachments — the student attaches files on the home question bar
// BEFORE a session exists. The AI reads each file right away (Gemini, with a
// local PDF text fallback) so the home page can show the summary immediately
// and the session-creation request can teach from the real content.
// Rows are stored with session_id 0 and claimed by POST /api/sessions.
// ============================================================================
import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, fail, serverError } from "@/lib/apiHelpers";
import { insertStagedAttachment } from "@/lib/sessionsRepo";
import { saveUploadFile, extractPdfText } from "@/lib/files";
import { geminiDescribeFile } from "@/lib/ai/gemini";

export const runtime = "nodejs";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();

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

    // The AI reads the whole file now — summary + key content + quiz
    // questions for PDFs, description + questions for images. Without a key
    // or on quota errors, PDFs fall back to local text extraction.
    let summary = await geminiDescribeFile(kind, base64, mime, name, "the attached material");
    if (!summary && isPdf) {
      summary = await extractPdfText(buffer);
    }

    const ext = kind === "pdf" ? "pdf" : (mime.split("/")[1] ?? "png").split("+")[0];
    const saved = saveUploadFile(buffer, ext);
    const attachment = insertStagedAttachment(user.id, {
      kind,
      name,
      mime,
      url: saved.url,
      summary
    });
    if (!attachment) return serverError();

    return ok({ attachment });
  } catch {
    return serverError();
  }
}
