// ============================================================================
// Handwriting recognition for answers written with the draw tool.
// Pipeline: student "drawing" objects (point lists) -> rasterized to a PNG
// server-side (pure JS, no canvas dependency) -> Gemini vision transcribes
// the ink into text, preserving broken grammar and misspellings -> the
// transcription is folded into the student's attempt so evaluation and
// hints can read scribbled answers.
// ============================================================================
import zlib from "zlib";
import crypto from "crypto";
// Relative import (not @/) so this module also runs under plain Node tests.
import { geminiTranscribeHandwriting } from "./ai/gemini";

export interface DrawableObject {
  type: string;
  x: number;
  y: number;
  content: string;
  owner?: string;
}

interface Stroke {
  pts: Array<{ x: number; y: number }>; // absolute board coordinates
  width: number;
  light: boolean; // highlighter-like strokes render as mid-gray
}

// Marker style widths mirrored from components/board/drawOptions.ts (kept
// local so this module stays server-safe with zero component imports).
const STYLE_WIDTH: Record<string, number> = {
  fine: 1.5,
  pen: 2.5,
  marker: 6,
  highlighter: 14,
  chalk: 3.5,
  neon: 3
};

const MAX_W = 1600;
const MAX_H = 1200;
const PAD = 20;

function parseStrokes(objects: DrawableObject[]): Stroke[] {
  const strokes: Stroke[] = [];
  for (const o of objects) {
    if (o.type !== "drawing") continue;
    let points: Array<{ x?: unknown; y?: unknown }> = [];
    let style = "pen";
    try {
      const parsed = JSON.parse(o.content) as {
        points?: Array<{ x?: unknown; y?: unknown }>;
        style?: unknown;
      };
      points = Array.isArray(parsed.points) ? parsed.points : [];
      style = typeof parsed.style === "string" ? parsed.style : "pen";
    } catch {
      continue;
    }
    if (points.length < 2) continue;
    strokes.push({
      pts: points.map((p) => ({
        x: o.x + (Number(p.x) || 0),
        y: o.y + (Number(p.y) || 0)
      })),
      width: STYLE_WIDTH[style] ?? 2.5,
      light: style === "highlighter"
    });
  }
  return strokes;
}

/* ------------------------------ rasterizer ------------------------------- */

function stampDot(
  rgb: Buffer,
  W: number,
  H: number,
  cx: number,
  cy: number,
  r: number,
  ink: [number, number, number]
) {
  const ri = Math.ceil(r);
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  for (let dy = -ri; dy <= ri; dy++) {
    const py = y0 + dy;
    if (py < 0 || py >= H) continue;
    for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = x0 + dx;
      if (px < 0 || px >= W) continue;
      const idx = (py * W + px) * 3;
      rgb[idx] = ink[0];
      rgb[idx + 1] = ink[1];
      rgb[idx + 2] = ink[2];
    }
  }
}

function stampSegment(
  rgb: Buffer,
  W: number,
  H: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  ink: [number, number, number]
) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / Math.max(0.5, r * 0.4)));
  for (let i = 0; i <= steps; i++) {
    stampDot(rgb, W, H, x0 + (dx * i) / steps, y0 + (dy * i) / steps, r, ink);
  }
}

/* --------------------------- minimal PNG encoder -------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------ public API ------------------------------- */

/**
 * Render every draw-tool stroke on the board into one PNG (dark ink on
 * white, best for handwriting OCR). Returns null when there is no ink.
 */
export function renderDrawingsToPng(objects: DrawableObject[]): Buffer | null {
  const strokes = parseStrokes(objects);
  if (strokes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX) || !isFinite(maxX)) return null;

  const bw = maxX - minX + PAD * 2;
  const bh = maxY - minY + PAD * 2;
  const scale = Math.min(1, MAX_W / bw, MAX_H / bh);
  const W = Math.max(64, Math.round(bw * scale));
  const H = Math.max(64, Math.round(bh * scale));
  const rgb = Buffer.alloc(W * H * 3, 255); // white canvas
  const ox = minX - PAD;
  const oy = minY - PAD;

  for (const s of strokes) {
    const r = Math.max(1, (s.width * scale) / 2);
    const ink: [number, number, number] = s.light ? [150, 150, 150] : [31, 41, 55];
    for (let i = 0; i < s.pts.length - 1; i++) {
      stampSegment(
        rgb,
        W,
        H,
        (s.pts[i].x - ox) * scale,
        (s.pts[i].y - oy) * scale,
        (s.pts[i + 1].x - ox) * scale,
        (s.pts[i + 1].y - oy) * scale,
        r,
        ink
      );
    }
  }
  return encodePng(W, H, rgb);
}

/**
 * Full handwriting pipeline: board objects -> PNG -> AI transcription.
 * Returns "" when there is no ink, the AI can't read it, or anything fails —
 * callers simply fall back to the text-only attempt.
 */
export async function transcribeBoardHandwriting(objects: DrawableObject[]): Promise<string> {
  try {
    const png = renderDrawingsToPng(objects);
    if (!png) return "";
    const base64 = png.toString("base64");
    if (base64.length > 6_000_000) return ""; // safety cap (~4.5 MB image)
    return await geminiTranscribeHandwriting(base64);
  } catch {
    return "";
  }
}

// Same strokes get transcribed once per server process — Check This and
// Hint on an unchanged board must not pay for two vision calls.
const transcriptCache = new Map<string, string>();

/**
 * Fold the student's handwritten answers into the attempt text. Draw-tool
 * strokes are transcribed (messy writing, wrong grammar and broken
 * sentences included — exactly as written) and replace the client-side
 * "[drawing on the board]" placeholders. Returns attemptText unchanged
 * when there is no student ink or nothing readable.
 */
export async function attemptWithHandwriting(
  objects: DrawableObject[],
  attemptText: string
): Promise<string> {
  const drawings = objects.filter(
    (o) => o.type === "drawing" && (o.owner ?? "student") === "student"
  );
  if (drawings.length === 0) return attemptText;
  const key = crypto
    .createHash("sha1")
    .update(drawings.map((o) => `${o.x},${o.y}:${o.content}`).join("|"))
    .digest("hex");
  let transcription = transcriptCache.get(key);
  if (transcription === undefined) {
    transcription = await transcribeBoardHandwriting(drawings);
    if (transcriptCache.size >= 40) transcriptCache.clear();
    transcriptCache.set(key, transcription);
  }
  if (!transcription) return attemptText;
  const base = attemptText
    .replace(/\[drawing on the board\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return (
    `${base ? base + "\n\n" : ""}` +
    `[Handwritten on the board with the draw tool — transcribed by AI exactly as written, spelling and grammar kept]:\n${transcription}`
  );
}
