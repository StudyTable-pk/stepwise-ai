// ============================================================================
// Gemini client — multimodal brain for files and handwriting.
// Powers understanding of student uploads — images and PDFs sent inline so
// the AI can evaluate work against the student's own material — and reads
// handwritten draw-tool ink from rendered board PNGs.
// Every call is best-effort: quota errors, timeouts and missing keys resolve
// to "" so callers fall back gracefully. Key stays server-side.
// ============================================================================
const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.5-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

async function callGemini(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; json: any }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": process.env.GEMINI_API_KEY ?? ""
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function textOf(json: any): string {
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("\n")
    .trim();
}

/**
 * Describe an uploaded image or PDF for the teaching loop. The file is sent
 * inline (Gemini reads images and PDFs natively). Returns "" on any failure.
 */
export async function geminiDescribeFile(
  kind: "image" | "pdf",
  base64: string,
  mime: string,
  fileName: string,
  topic: string
): Promise<string> {
  if (!process.env.GEMINI_API_KEY || !base64) return "";
  const instruction =
    kind === "pdf"
      ? `The student attached the document "${fileName}" to their learning session about "${topic}". ` +
        "Read the ENTIRE document carefully, then reply in plain text with exactly three sections:\n" +
        "1) SUMMARY: 2-4 sentences on what the document is about and its main ideas.\n" +
        "2) KEY CONTENT: the most important definitions, facts, formulas, procedures and worked examples from the document (bullet points).\n" +
        "3) QUIZ QUESTIONS: 5-8 specific questions drawn directly from the document's content (mix of recall, understanding and application), numbered.\n" +
        "Max 4000 characters, no preamble."
      : `The student attached the image "${fileName}" to their learning session about "${topic}". ` +
        "Describe what the image shows in educational terms (labels, diagrams, equations, notes), " +
        "then list 3-5 questions a teacher could ask the student based directly on the image. " +
        "Plain text, max 1200 characters, no preamble.";
  try {
    const { ok, json } = await callGemini(
      TEXT_MODEL,
      {
        contents: [
          { parts: [{ text: instruction }, { inlineData: { mimeType: mime, data: base64 } }] }
        ]
      },
      90000
    );
    return ok ? textOf(json).slice(0, 6000) : "";
  } catch {
    return "";
  }
}

/**
 * Transcribe handwriting rendered from board draw strokes (PNG, dark ink on
 * white). Deliberately lenient: messy letters, misspellings and broken
 * grammar are preserved exactly as written — the teaching loop wants what
 * the student actually wrote, not a corrected version. Returns "" when
 * there is no readable text, no key, quota errors or any failure.
 */
export async function geminiTranscribeHandwriting(base64Png: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY || !base64Png) return "";
  const instruction =
    "This image shows handwriting a student drew on a digital whiteboard with a pen tool. " +
    "Transcribe EVERYTHING you can read, exactly as written — keep misspellings, broken grammar, " +
    "messy letters and partial words; never correct or interpret them. Read even the worst " +
    "handwriting you can make out; for a word that is only partly readable, write your best guess. " +
    "Output ONLY the transcribed text, nothing else. " +
    "If the image contains no readable handwriting at all (only scribbles, shapes, lines or diagrams), " +
    "reply with exactly: NO_TEXT";
  try {
    const { ok, json } = await callGemini(
      TEXT_MODEL,
      {
        contents: [
          { parts: [{ text: instruction }, { inlineData: { mimeType: "image/png", data: base64Png } }] }
        ]
      },
      60000
    );
    if (!ok) return "";
    const text = textOf(json);
    if (!text || text.toUpperCase().startsWith("NO_TEXT")) return "";
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}
