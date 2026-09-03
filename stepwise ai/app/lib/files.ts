// ============================================================================
// Uploaded / generated file storage.
// Files live on disk under ./data/uploads next to the JSON database and are
// served through /api/files/:name (random unguessable names act as tokens).
// ============================================================================
import fs from "fs";
import path from "path";
import crypto from "crypto";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf"
};

export function uploadsDir(): string {
  const dbFile = process.env.DATABASE_FILE || "./data/stepwise.db";
  const resolved = path.isAbsolute(dbFile) ? dbFile : path.join(process.cwd(), dbFile);
  return path.join(path.dirname(resolved), "uploads");
}

export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Persist a buffer with a random safe name; returns the public URL. */
export function saveUploadFile(buffer: Uint8Array, ext: string): { fileName: string; url: string } {
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const safeExt = (ext || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const fileName = `f-${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}.${safeExt}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);
  return { fileName, url: `/api/files/${fileName}` };
}

/** Resolve a served file name to an absolute path, or null when invalid. */
export function resolveUploadPath(name: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) return null;
  const dir = uploadsDir();
  const full = path.join(dir, name);
  if (!full.startsWith(dir + path.sep)) return null;
  return full;
}

/** Local fallback for PDFs when Gemini is unavailable: raw text extraction. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const mod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
      default?: (d: Buffer) => Promise<{ text?: string }>;
    };
    const pdfParse = mod.default;
    if (!pdfParse) return "";
    const result = await pdfParse(buffer);
    const text = String(result?.text ?? "").replace(/\s+/g, " ").trim();
    return text.slice(0, 6000);
  } catch {
    return "";
  }
}
