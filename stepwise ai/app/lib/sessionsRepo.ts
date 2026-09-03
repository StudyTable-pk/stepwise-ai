// ============================================================================
// Session & Board repository — server-side data access.
// Every lookup re-verifies ownership from the authenticated user (spec
// part 9: never trust IDs supplied by the client).
// ============================================================================
import { db, nowIso, type Row } from "@/lib/db";
import type { BoardObject, QuestionAnalysis, SessionState, StarterObject } from "@/lib/types";

export interface SessionRecord {
  id: number;
  user_id: number;
  question_id: number;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  status: string;
  current_step: number;
  state: SessionState;
  state_json: string;
  question_text: string;
  analysis: QuestionAnalysis;
  board_id: number;
  board_title: string;
}

export function createLearningSession(
  userId: number,
  questionText: string,
  analysis: QuestionAnalysis,
  starterObjects: StarterObject[] = []
): SessionRecord {
  return db.transaction(() => {
    const q = db.insert("questions", {
      user_id: userId,
      original_text: questionText.slice(0, 4000),
      input_type: "text",
      subject: analysis.subject,
      topic: analysis.topic,
      difficulty: analysis.difficulty,
      normalized_question: analysis.intent,
      analysis_json: JSON.stringify(analysis),
      created_at: nowIso()
    });
    const questionId = q.lastInsertRowid;

    const s = db.insert("sessions", {
      user_id: userId,
      question_id: questionId,
      started_at: nowIso(),
      ended_at: null,
      active_seconds: 0,
      status: "active",
      current_step: 0,
      state: "INTRODUCTION",
      state_json: JSON.stringify({ stepsCompleted: [], failedChecks: 0 }),
      created_at: nowIso(),
      updated_at: nowIso()
    });
    const sessionId = s.lastInsertRowid;

    const b = db.insert("boards", {
      session_id: sessionId,
      user_id: userId,
      title: analysis.topic,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    });
    const boardId = b.lastInsertRowid;

    // Seed the board: question card (system) + AI introduction (ai-owned).
    db.insert("board_objects", {
      id: `obj-q-${sessionId}`,
      board_id: boardId,
      type: "note",
      x: 60,
      y: 40,
      width: 420,
      height: 110,
      rotation: 0,
      z_index: 1,
      content: questionText.slice(0, 4000),
      style_json: JSON.stringify({ variant: "question" }),
      meta_json: JSON.stringify({ role: "question" }),
      owner: "system",
      created_at: nowIso(),
      updated_at: nowIso()
    });
    db.insert("board_objects", {
      id: `obj-intro-${sessionId}`,
      board_id: boardId,
      type: "note",
      x: 60,
      y: 190,
      width: 420,
      height: 140,
      rotation: 0,
      z_index: 2,
      content: analysis.introduction,
      style_json: JSON.stringify({ variant: "ai" }),
      meta_json: JSON.stringify({ role: "introduction" }),
      owner: "ai",
      created_at: nowIso(),
      updated_at: nowIso()
    });

    // Seed the AI-drawn starter diagram/flowchart (structure only — the
    // student supplies the meaning).
    starterObjects.slice(0, 24).forEach((o, i) => {
      db.insert("board_objects", {
        id: `obj-starter-${sessionId}-${i}`,
        board_id: boardId,
        type: o.type,
        x: Math.round(Number(o.x) || 0),
        y: Math.round(Number(o.y) || 0),
        width: Math.round(Number(o.width) || 200),
        height: Math.round(Number(o.height) || 80),
        rotation: 0,
        z_index: 3 + i,
        content: String(o.content ?? "").slice(0, 2000),
        style_json: JSON.stringify({ variant: "ai" }),
        meta_json: JSON.stringify({ role: "starter-diagram" }),
        owner: "ai",
        created_at: nowIso(),
        updated_at: nowIso()
      });
    });

    db.insert("learning_events", {
      user_id: userId,
      session_id: sessionId,
      event_type: "question_started",
      detail_json: JSON.stringify({ topic: analysis.topic }),
      created_at: nowIso()
    });

    return getSession(userId, sessionId)!;
  });
}
export function getSession(userId: number, sessionId: number): SessionRecord | null {
  const s = db.get("sessions", { id: sessionId, user_id: userId });
  if (!s) return null;
  const q = db.get("questions", { id: Number(s.question_id) });
  const b = db.get("boards", { session_id: sessionId });
  if (!q || !b) return null;
  let analysis: QuestionAnalysis;
  try {
    analysis = JSON.parse(String(q.analysis_json ?? "{}")) as QuestionAnalysis;
  } catch {
    return null;
  }
  return {
    id: Number(s.id),
    user_id: Number(s.user_id),
    question_id: Number(s.question_id),
    started_at: String(s.started_at),
    ended_at: (s.ended_at as string | null) ?? null,
    active_seconds: Number(s.active_seconds ?? 0),
    status: String(s.status),
    current_step: Number(s.current_step ?? 0),
    state: s.state as SessionState,
    state_json: String(s.state_json ?? "{}"),
    question_text: String(q.original_text ?? ""),
    analysis,
    board_id: Number(b.id),
    board_title: String(b.title ?? "Learning Board")
  };
}

export function listSessions(
  userId: number,
  limit = 20
): Array<{
  id: number;
  question_text: string;
  topic: string;
  status: string;
  state: string;
  started_at: string;
  has_report: boolean;
}> {
  const sessions = db.all("sessions", { user_id: userId }, { key: "id", dir: "desc" }).slice(0, limit);
  return sessions.map((s) => {
    const q = db.get("questions", { id: Number(s.question_id) });
    const hasReport = !!db.get("reports", { session_id: Number(s.id) });
    return {
      id: Number(s.id),
      question_text: String(q?.original_text ?? ""),
      topic: String(q?.topic ?? ""),
      status: String(s.status),
      state: String(s.state),
      started_at: String(s.started_at),
      has_report: hasReport
    };
  });
}

export function updateSessionState(
  userId: number,
  sessionId: number,
  patch: Partial<{
    state: SessionState;
    current_step: number;
    status: string;
    state_json: string;
    active_seconds: number;
  }>
): void {
  const update: Row = { updated_at: nowIso() };
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.current_step !== undefined) update.current_step = patch.current_step;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.state_json !== undefined) update.state_json = patch.state_json;
  if (patch.active_seconds !== undefined) update.active_seconds = patch.active_seconds;
  if (patch.status === "completed") update.ended_at = nowIso();
  db.update("sessions", { id: sessionId, user_id: userId }, update);
}

// --- Board objects -------------------------------------------------------------
export function getBoardObjects(userId: number, boardId: number): BoardObject[] {
  const board = db.get("boards", { id: boardId, user_id: userId });
  if (!board) return [];
  return db
    .all("board_objects", { board_id: boardId }, { key: "z_index" })
    .map(rowToObject);
}

function rowToObject(row: Row): BoardObject {
  return {
    id: String(row.id),
    board_id: String(row.board_id),
    type: row.type as BoardObject["type"],
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    rotation: Number(row.rotation),
    z_index: Number(row.z_index),
    content: String(row.content ?? ""),
    style: safeParse(String(row.style_json ?? "{}")),
    meta: safeParse(String(row.meta_json ?? "{}")),
    owner: (row.owner as BoardObject["owner"]) ?? "student",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? "")
  };
}

function safeParse(text: string): Record<string, unknown> {
  try {
    const v = JSON.parse(text);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Persist a full board snapshot (optimistic client state -> server).
 * Replaces object rows for this board atomically.
 */
export function saveBoardObjects(userId: number, boardId: number, objects: BoardObject[]): void {
  db.transaction(() => {
    const owned = db.get("boards", { id: boardId, user_id: userId });
    if (!owned) throw new Error("NOT_FOUND");
    db.remove("board_objects", { board_id: boardId });
    for (const o of objects.slice(0, 500)) {
      db.insert("board_objects", {
        id: String(o.id).slice(0, 64),
        board_id: boardId,
        type: o.type,
        x: o.x,
        y: o.y,
        width: Math.max(20, Math.min(4000, o.width)),
        height: Math.max(20, Math.min(4000, o.height)),
        rotation: o.rotation || 0,
        z_index: o.z_index || 0,
        content: String(o.content ?? "").slice(0, 20000),
        style_json: JSON.stringify(o.style ?? {}).slice(0, 4000),
        meta_json: JSON.stringify(o.meta ?? {}).slice(0, 4000),
        owner: o.owner,
        created_at: nowIso(),
        updated_at: nowIso()
      });
    }
    db.update("boards", { id: boardId }, { updated_at: nowIso() });
  });
}

/**
 * Append AI-generated visual-aid objects (diagram/table) to an existing
 * board. Ownership is validated; returns the inserted objects.
 */
export function insertAiObjects(
  userId: number,
  boardId: number,
  objects: StarterObject[]
): BoardObject[] {
  const board = db.get("boards", { id: boardId, user_id: userId });
  if (!board || objects.length === 0) return [];
  const stamp = Date.now().toString(36);
  const prefix = `obj-aid-${boardId}-${stamp}`;
  db.transaction(() => {
    objects.slice(0, 16).forEach((o, i) => {
      db.insert("board_objects", {
        id: `${prefix}-${i}`,
        board_id: boardId,
        type: o.type,
        x: Math.round(Number(o.x) || 0),
        y: Math.round(Number(o.y) || 0),
        width: Math.max(20, Math.min(4000, Math.round(Number(o.width) || 200))),
        height: Math.max(20, Math.min(4000, Math.round(Number(o.height) || 100))),
        rotation: 0,
        z_index: 50 + i,
        content: String(o.content ?? "").slice(0, 8000),
        style_json: JSON.stringify({ variant: "ai" }),
        meta_json: JSON.stringify({ role: "visual-aid" }),
        owner: "ai",
        created_at: nowIso(),
        updated_at: nowIso()
      });
    });
    db.update("boards", { id: boardId }, { updated_at: nowIso() });
  });
  return getBoardObjects(userId, boardId).filter((o) => o.id.startsWith(prefix));
}

export function recordBoardEvent(
  userId: number,
  boardId: number,
  eventType: string,
  payload: Record<string, unknown>
): void {
  const board = db.get("boards", { id: boardId, user_id: userId });
  if (!board) return;
  db.insert("board_events", {
    board_id: boardId,
    session_id: Number(board.session_id),
    event_type: eventType.slice(0, 60),
    payload_json: JSON.stringify(payload).slice(0, 8000),
    created_at: nowIso()
  });
}

export function addAiMessage(
  userId: number,
  sessionId: number,
  kind: string,
  content: Record<string, unknown>
): void {
  const owned = db.get("sessions", { id: sessionId, user_id: userId });
  if (!owned) return;
  db.insert("ai_messages", {
    session_id: sessionId,
    kind: kind.slice(0, 40),
    content_json: JSON.stringify(content).slice(0, 40000),
    created_at: nowIso()
  });
}

export function getAiMessages(
  userId: number,
  sessionId: number
): Array<{ id: number; kind: string; content_json: string; created_at: string }> {
  const owned = db.get("sessions", { id: sessionId, user_id: userId });
  if (!owned) return [];
  return db.all("ai_messages", { session_id: sessionId }, { key: "id" }).map((m) => ({
    id: Number(m.id),
    kind: String(m.kind),
    content_json: String(m.content_json),
    created_at: String(m.created_at)
  }));
}

export function recordHint(userId: number, sessionId: number, level: number, content: string): void {
  const owned = db.get("sessions", { id: sessionId, user_id: userId });
  if (!owned) return;
  db.insert("hints", {
    session_id: sessionId,
    level,
    content: content.slice(0, 4000),
    created_at: nowIso()
  });
  db.insert("learning_events", {
    user_id: userId,
    session_id: sessionId,
    event_type: "hint_requested",
    detail_json: JSON.stringify({ level }),
    created_at: nowIso()
  });
}

export function recordErrors(
  userId: number,
  sessionId: number,
  errors: Array<{ category: string; severity: string; description: string }>
): void {
  for (const e of errors.slice(0, 20)) {
    db.insert("errors", {
      session_id: sessionId,
      user_id: userId,
      category: e.category.slice(0, 30),
      severity: e.severity.slice(0, 20),
      description: e.description.slice(0, 1000),
      corrected: 0,
      self_corrected: 0,
      created_at: nowIso()
    });
  }
}

export function markErrorsCorrected(userId: number, sessionId: number, selfCorrected: boolean): void {
  for (const err of db.all("errors", { session_id: sessionId, user_id: userId })) {
    if (!Number(err.corrected)) {
      db.update(
        "errors",
        { id: Number(err.id) },
        { corrected: 1, self_corrected: selfCorrected ? 1 : 0 }
      );
    }
  }
}

export interface SessionStats {
  totalSeconds: number;
  activeSeconds: number;
  hintsUsed: number[];
  errors: Array<{
    category: string;
    severity: string;
    description: string;
    corrected: boolean;
    selfCorrected: boolean;
  }>;
  stepsCompleted: number;
  stepsTotal: number;
}

export function getSessionStats(userId: number, session: SessionRecord): SessionStats {
  const hints = db.all("hints", { session_id: session.id }, { key: "id" });
  const errors = db.all("errors", { session_id: session.id, user_id: userId });
  const totalSeconds = session.started_at
    ? Math.max(0, Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000))
    : 0;
  return {
    totalSeconds,
    activeSeconds: session.active_seconds || Math.round(totalSeconds * 0.8),
    hintsUsed: hints.map((h) => Number(h.level)),
    errors: errors.map((e) => ({
      category: String(e.category),
      severity: String(e.severity),
      description: String(e.description),
      corrected: !!Number(e.corrected),
      selfCorrected: !!Number(e.self_corrected)
    })),
    stepsCompleted: session.current_step,
    stepsTotal: session.analysis.steps.length
  };
}

// --- Attachments (images & PDFs the student gives the AI to read) ------------
export interface AttachmentRow {
  id: number;
  session_id: number;
  kind: "image" | "pdf";
  name: string;
  mime: string;
  url: string;
  summary: string;
  created_at: string;
}

export function insertAttachment(
  userId: number,
  sessionId: number,
  att: { kind: "image" | "pdf"; name: string; mime: string; url: string; summary: string }
): AttachmentRow | null {
  const owned = db.get("sessions", { id: sessionId, user_id: userId });
  if (!owned) return null;
  const res = db.insert("attachments", {
    user_id: userId,
    session_id: sessionId,
    kind: att.kind,
    name: att.name.slice(0, 200),
    mime: att.mime.slice(0, 80),
    url: att.url.slice(0, 300),
    summary: att.summary.slice(0, 6000),
    created_at: nowIso()
  });
  db.insert("learning_events", {
    user_id: userId,
    session_id: sessionId,
    event_type: "attachment_uploaded",
    detail_json: JSON.stringify({ kind: att.kind, name: att.name.slice(0, 200) }),
    created_at: nowIso()
  });
  return {
    id: res.lastInsertRowid,
    session_id: sessionId,
    kind: att.kind,
    name: att.name.slice(0, 200),
    mime: att.mime.slice(0, 80),
    url: att.url,
    summary: att.summary.slice(0, 6000),
    created_at: nowIso()
  };
}

export function listAttachments(userId: number, sessionId: number): AttachmentRow[] {
  const owned = db.get("sessions", { id: sessionId, user_id: userId });
  if (!owned) return [];
  return db.all("attachments", { session_id: sessionId }, { key: "id" }).map((a) => ({
    id: Number(a.id),
    session_id: sessionId,
    kind: a.kind === "pdf" ? "pdf" : "image",
    name: String(a.name ?? ""),
    mime: String(a.mime ?? ""),
    url: String(a.url ?? ""),
    summary: String(a.summary ?? ""),
    created_at: String(a.created_at ?? "")
  }));
}

/**
 * What the AI gets to "see" from attached materials: each file's stored
 * summary (produced at upload time). "" when nothing is attached.
 */
export function attachmentContext(userId: number, sessionId: number): string {
  const items = listAttachments(userId, sessionId).filter((a) => a.summary.trim().length > 0);
  if (items.length === 0) return "";
  return items
    .map((a) => `[${a.kind}] ${a.name}: ${a.summary}`)
    .join("\n\n")
    .slice(0, 6000);
}

// --- Staged attachments (read by the AI on the home page, before a session
// exists). They live in the attachments table with session_id 0 and are
// claimed by a real session when the student starts one. ---------------------

function rowToAttachment(a: Record<string, any>, sessionId: number): AttachmentRow {
  return {
    id: Number(a.id),
    session_id: sessionId,
    kind: a.kind === "pdf" ? "pdf" : "image",
    name: String(a.name ?? ""),
    mime: String(a.mime ?? ""),
    url: String(a.url ?? ""),
    summary: String(a.summary ?? ""),
    created_at: String(a.created_at ?? "")
  };
}

export function insertStagedAttachment(
  userId: number,
  att: { kind: "image" | "pdf"; name: string; mime: string; url: string; summary: string }
): AttachmentRow | null {
  const res = db.insert("attachments", {
    user_id: userId,
    session_id: 0,
    kind: att.kind,
    name: att.name.slice(0, 200),
    mime: att.mime.slice(0, 80),
    url: att.url.slice(0, 300),
    summary: att.summary.slice(0, 6000),
    created_at: nowIso()
  });
  return rowToAttachment({ id: res.lastInsertRowid, ...att }, 0);
}

export function getStagedAttachments(userId: number, ids: number[]): AttachmentRow[] {
  const rows: AttachmentRow[] = [];
  for (const id of ids) {
    const a = db.get("attachments", { id, user_id: userId, session_id: 0 });
    if (a) rows.push(rowToAttachment(a, 0));
  }
  return rows;
}

export function claimStagedAttachments(
  userId: number,
  sessionId: number,
  ids: number[]
): AttachmentRow[] {
  const claimed: AttachmentRow[] = [];
  for (const id of ids) {
    const a = db.get("attachments", { id, user_id: userId, session_id: 0 });
    if (!a) continue;
    db.update("attachments", { id, user_id: userId, session_id: 0 }, { session_id: sessionId });
    db.insert("learning_events", {
      user_id: userId,
      session_id: sessionId,
      event_type: "attachment_uploaded",
      detail_json: JSON.stringify({ kind: a.kind, name: String(a.name ?? "").slice(0, 200), via: "question-bar" }),
      created_at: nowIso()
    });
    claimed.push(rowToAttachment({ ...a, session_id: sessionId }, sessionId));
  }
  return claimed;
}

/**
 * Place an uploaded image on the board as a student-owned object, next to
 * the existing content. Returns the inserted object (or null).
 */
export function insertStudentImageObject(
  userId: number,
  boardId: number,
  img: { url: string; title: string }
): BoardObject | null {
  const board = db.get("boards", { id: boardId, user_id: userId });
  if (!board) return null;
  const objects = getBoardObjects(userId, boardId);
  // Free space: past the right edge of everything on the board (+ gap), so
  // the upload never lands on top of the question or other objects.
  const maxX = objects.length ? Math.max(...objects.map((o) => o.x + o.width)) : 0;
  const minY = objects.length ? Math.min(...objects.map((o) => o.y)) : 40;
  const maxZ = objects.reduce((m, o) => Math.max(m, o.z_index), 0);
  const id = `obj-up-${boardId}-${Date.now().toString(36)}`;
  db.insert("board_objects", {
    id,
    board_id: boardId,
    type: "image",
    x: Math.round(maxX + 120),
    y: Math.round(minY),
    width: 420,
    height: 340,
    rotation: 0,
    z_index: maxZ + 1,
    content: JSON.stringify({
      url: img.url,
      title: img.title,
      source: "upload",
      width: 800,
      height: 600
    }).slice(0, 20000),
    style_json: JSON.stringify({ variant: "student" }),
    meta_json: JSON.stringify({ role: "attachment" }),
    owner: "student",
    created_at: nowIso(),
    updated_at: nowIso()
  });
  db.update("boards", { id: boardId }, { updated_at: nowIso() });
  return getBoardObjects(userId, boardId).find((o) => o.id === id) ?? null;
}
