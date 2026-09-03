// ============================================================================
// Serves uploaded / AI-generated files from data/uploads.
// File names are random unguessable tokens (created server-side), so the
// route simply validates the name shape and streams the file.
// ============================================================================
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { resolveUploadPath, mimeForExt } from "@/lib/files";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const full = resolveUploadPath(String(params.name ?? ""));
  if (!full || !fs.existsSync(full)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ext = path.extname(full).slice(1);
  const buf = fs.readFileSync(full);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeForExt(ext),
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
