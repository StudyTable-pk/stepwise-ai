import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, int, serverError } from "@/lib/apiHelpers";
import { getBoardObjects, saveBoardObjects, recordBoardEvent } from "@/lib/sessionsRepo";
import { db } from "@/lib/db";
import type { BoardObject, BoardObjectType, Ownership } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TYPES = new Set([
  "text",
  "handwriting",
  "drawing",
  "shape",
  "connector",
  "image",
  "note",
  "formula",
  "annotation",
  "visual",
  "graph"
]);
const VALID_OWNERS = new Set(["student", "ai", "system", "imported"]);

function ownsBoard(userId: number, boardId: number): boolean {
  return !!db.get("boards", { id: boardId, user_id: userId });
}

// GET /api/boards/:id
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const boardId = int(params.id, -1);
    if (!ownsBoard(user.id, boardId)) return notFound();
    return ok({ objects: getBoardObjects(user.id, boardId) });
  } catch {
    return serverError();
  }
}

// PUT /api/boards/:id — persist the full optimistic snapshot (debounced
// client-side; server stores meaningful state, part 21).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const boardId = int(params.id, -1);
    if (!ownsBoard(user.id, boardId)) return notFound();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const raw = Array.isArray(body.objects) ? body.objects : [];

    const objects: BoardObject[] = [];
    for (const item of raw.slice(0, 500)) {
      const o = (item ?? {}) as Record<string, unknown>;
      const id = String(o.id ?? "").slice(0, 64);
      if (!id) continue;
      const type = VALID_TYPES.has(String(o.type)) ? (String(o.type) as BoardObjectType) : "text";
      const owner = VALID_OWNERS.has(String(o.owner)) ? (String(o.owner) as Ownership) : "student";
      objects.push({
        id,
        board_id: String(boardId),
        type,
        x: Number(o.x) || 0,
        y: Number(o.y) || 0,
        width: Number(o.width) || 200,
        height: Number(o.height) || 80,
        rotation: Number(o.rotation) || 0,
        z_index: Number(o.z_index) || 0,
        content: String(o.content ?? "").slice(0, 20000),
        style: typeof o.style === "object" && o.style !== null ? (o.style as Record<string, unknown>) : {},
        meta: typeof o.meta === "object" && o.meta !== null ? (o.meta as Record<string, unknown>) : {},
        owner,
        created_at: "",
        updated_at: ""
      });
    }

    saveBoardObjects(user.id, boardId, objects);
    return ok({ saved: true, count: objects.length });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_FOUND") return notFound();
    return serverError();
  }
}

// POST /api/boards/:id/event — meaningful board events only (part 19).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const boardId = int(params.id, -1);
    if (!ownsBoard(user.id, boardId)) return notFound();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = String(body.eventType ?? "board_event").slice(0, 60);
    const payload =
      typeof body.payload === "object" && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : {};
    recordBoardEvent(user.id, boardId, eventType, payload);
    return ok({ recorded: true });
  } catch {
    return serverError();
  }
}
