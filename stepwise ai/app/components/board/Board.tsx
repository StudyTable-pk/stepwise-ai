"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { BoardObject, FeedbackLabel } from "@/lib/types";
import { FEEDBACK_META } from "@/components/ui";
import { DEFAULT_DRAW_OPTIONS, markerById, resolveStroke, type DrawOptions } from "./drawOptions";
import { parseGraphSpec } from "@/lib/graphMath";

// ============================================================================
// The Board (doc 02): a spatial canvas where the student thinks. Objects are
// draggable, resizable and editable; the AI's objects are read-only. Pan and
// zoom keep everything in view. All persistence goes through onCommit.
// ============================================================================

export type Tool = "select" | "text" | "draw" | "erase" | "pan";

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

type DragState =
  | { mode: "pan"; startX: number; startY: number; origin: Viewport }
  | {
      mode: "move";
      ids: string[];
      origins: Record<string, { x: number; y: number }>;
      startBX: number;
      startBY: number;
    }
  | { mode: "resize"; id: string; startBX: number; startBY: number; w: number; h: number }
  | { mode: "draw"; points: Array<{ x: number; y: number }> }
  | null;

const HIGHLIGHT_RING: Record<string, string> = {
  CORRECT_UNDERSTANDING: "ring-4 ring-emerald-400",
  PARTIALLY_CORRECT: "ring-4 ring-amber-400",
  MISSING_IDEA: "ring-4 ring-sky-400",
  CONCEPT_ERROR: "ring-4 ring-red-500",
  THINK_ABOUT_THIS: "ring-4 ring-violet-400",
  CHECK_THIS_STEP: "ring-4 ring-orange-400",
  AI_UNCERTAIN: "ring-4 ring-slate-400"
};

let localId = 0;
function newId() {
  localId += 1;
  return `obj-${Date.now().toString(36)}-${localId}-${Math.random().toString(36).slice(2, 7)}`;
}

// AI objects inserted as one batch share an id prefix (obj-starter-…-i /
// obj-aid-…-i): strip the trailing index to get the group key, so a whole
// flowchart / table aid selects and moves as a single item.
function groupKey(id: string): string {
  return id.replace(/-\d+$/, "");
}
function groupIds(obj: BoardObject, all: BoardObject[]): string[] {
  if (obj.owner !== "ai") return [obj.id];
  const key = groupKey(obj.id);
  const ids = all.filter((o) => o.owner === "ai" && groupKey(o.id) === key).map((o) => o.id);
  return ids.length > 1 ? ids : [obj.id];
}

export default function Board({
  objects,
  tool,
  readOnly,
  highlights,
  drawOptions,
  onCommit,
  onEraseFeedback
}: {
  objects: BoardObject[];
  tool: Tool;
  readOnly: boolean;
  highlights: Record<string, FeedbackLabel>;
  drawOptions?: DrawOptions;
  onCommit: (next: BoardObject[]) => void;
  onEraseFeedback?: () => void;
}) {
  const draw = drawOptions ?? DEFAULT_DRAW_OPTIONS;
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ x: 40, y: 20, scale: 1 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const dragRef = useRef<DragState>(null);
  dragRef.current = drag;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Keyboard: space = temporary pan, Delete removes selection, Esc deselects.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable;
      if (e.code === "Space" && !typing) {
        setSpaceDown(true);
        e.preventDefault();
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !readOnly) {
        const obj = objectsRef.current.find((o) => o.id === selectedId);
        if (obj && obj.owner === "student") {
          onCommit(objectsRef.current.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setEditingId(null);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [selectedId, readOnly, onCommit]);

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.scale,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.scale
    };
  }, []);

  // Wheel zoom centered on the cursor.
  function handleWheel(e: React.WheelEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => {
      const scale = Math.min(2.5, Math.max(0.4, v.scale * factor));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const k = scale / v.scale;
      return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
    });
  }

  function eraseAt(bx: number, by: number) {
    const hit = objectsRef.current.find(
      (o) =>
        o.owner === "student" &&
        bx >= o.x &&
        bx <= o.x + o.width &&
        by >= o.y &&
        by <= o.y + o.height
    );
    if (hit) {
      onCommit(objectsRef.current.filter((o) => o.id !== hit.id));
      onEraseFeedback?.();
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (editingId) return; // let the textarea handle its own events
    const panMode = tool === "pan" || spaceDown || e.button === 1;
    if (panMode) {
      setDrag({ mode: "pan", startX: e.clientX, startY: e.clientY, origin: viewRef.current });
      return;
    }
    const { x: bx, y: by } = toBoard(e.clientX, e.clientY);

    if (tool === "text" && !readOnly) {
      // Clicking on an existing empty text box opens it for editing instead
      // of stacking a new box on top (the "box behind the box" obstacle).
      const hit = (e.target as HTMLElement).closest("[data-object-id]") as HTMLElement | null;
      if (hit) {
        const hitObj = objectsRef.current.find((o) => o.id === hit.getAttribute("data-object-id"));
        if (hitObj && hitObj.owner === "student" && !hitObj.content) {
          setSelectedId(hitObj.id);
          setEditingId(hitObj.id);
          setDrag(null);
          return;
        }
      }
      const id = newId();
      const now = new Date().toISOString();
      // Annotations always land above AI aids (which sit at z 50+).
      const maxZ = objectsRef.current.reduce((m, o) => Math.max(m, o.z_index), 0);
      const obj: BoardObject = {
        id,
        board_id: "",
        type: "text",
        x: Math.round(bx),
        y: Math.round(by),
        width: 260,
        height: 90,
        rotation: 0,
        z_index: maxZ + 1,
        content: "",
        style: {},
        meta: {},
        owner: "student",
        created_at: now,
        updated_at: now
      };
      onCommit([...objectsRef.current, obj]);
      setSelectedId(id);
      setEditingId(id);
      setDrag(null);
      return;
    }
    if (tool === "draw" && !readOnly) {
      setDrag({ mode: "draw", points: [{ x: bx, y: by }] });
      return;
    }
    if (tool === "erase") {
      eraseAt(bx, by);
      setDrag({ mode: "draw", points: [] }); // reuse as "erasing" drag flag
      return;
    }
    // select tool: object hit?
    const target = (e.target as HTMLElement).closest("[data-object-id]") as HTMLElement | null;
    if (target) {
      const id = target.getAttribute("data-object-id") as string;
      const obj = objectsRef.current.find((o) => o.id === id);
      if (!obj) return;
      setSelectedId(id);
      if (obj.owner === "student" && !readOnly) {
        // Empty text boxes open straight into the editor on a single click.
        if (!obj.content && (obj.type === "text" || obj.type === "note")) {
          setEditingId(id);
          return;
        }
        setDrag({
          mode: "move",
          ids: [id],
          origins: { [id]: { x: obj.x, y: obj.y } },
          startBX: bx,
          startBY: by
        });
        return;
      }
      // AI visual aids (starter flowchart, generated table/flowchart/
      // diagram/image): dragging moves the whole batch together as one item.
      const role = obj.meta?.role;
      if (obj.owner === "ai" && !readOnly && (role === "visual-aid" || role === "starter-diagram")) {
        const ids = groupIds(obj, objectsRef.current);
        const origins: Record<string, { x: number; y: number }> = {};
        for (const gid of ids) {
          const o = objectsRef.current.find((oo) => oo.id === gid);
          if (o) origins[gid] = { x: o.x, y: o.y };
        }
        setDrag({ mode: "move", ids, origins, startBX: bx, startBY: by });
      }
      return;
    }
    setSelectedId(null);
    // Dragging empty canvas with select tool pans the view.
    setDrag({ mode: "pan", startX: e.clientX, startY: e.clientY, origin: viewRef.current });
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "pan") {
      setView({
        x: d.origin.x + (e.clientX - d.startX),
        y: d.origin.y + (e.clientY - d.startY),
        scale: d.origin.scale
      });
      return;
    }
    const { x: bx, y: by } = toBoard(e.clientX, e.clientY);
    if (d.mode === "move") {
      const dx = bx - d.startBX;
      const dy = by - d.startBY;
      const next = objectsRef.current.map((o) =>
        d.origins[o.id]
          ? { ...o, x: Math.round(d.origins[o.id].x + dx), y: Math.round(d.origins[o.id].y + dy) }
          : o
      );
      onCommit(next);
      return;
    }
    if (d.mode === "resize") {
      const next = objectsRef.current.map((o) =>
        o.id === d.id
          ? {
              ...o,
              width: Math.max(80, Math.round(d.w + bx - d.startBX)),
              height: Math.max(48, Math.round(d.h + by - d.startBY))
            }
          : o
      );
      onCommit(next);
      return;
    }
    if (d.mode === "draw") {
      if (tool === "erase") {
        eraseAt(bx, by);
        return;
      }
      setDrag({ mode: "draw", points: [...d.points, { x: bx, y: by }] });
    }
  }

  function handlePointerUp() {
    const d = dragRef.current;
    if (d?.mode === "draw" && tool === "draw" && d.points.length > 1) {
      const xs = d.points.map((p) => p.x);
      const ys = d.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const width = Math.max(20, Math.round(Math.max(...xs) - minX));
      const height = Math.max(20, Math.round(Math.max(...ys) - minY));
      const now = new Date().toISOString();
      const maxZ = objectsRef.current.reduce((m, o) => Math.max(m, o.z_index), 0);
      const obj: BoardObject = {
        id: newId(),
        board_id: "",
        type: "drawing",
        x: Math.round(minX),
        y: Math.round(minY),
        width,
        height,
        rotation: 0,
        z_index: maxZ + 1,
        content: JSON.stringify({
          points: d.points.map((p) => ({ x: Math.round(p.x - minX), y: Math.round(p.y - minY) })),
          color: draw.color,
          style: draw.style
        }),
        style: {},
        meta: {},
        owner: "student",
        created_at: now,
        updated_at: now
      };
      onCommit([...objectsRef.current, obj]);
    }
    setDrag(null);
  }

  function startResize(e: React.PointerEvent, obj: BoardObject) {
    e.stopPropagation();
    const { x: bx, y: by } = toBoard(e.clientX, e.clientY);
    setDrag({ mode: "resize", id: obj.id, startBX: bx, startBY: by, w: obj.width, h: obj.height });
  }

  function updateText(id: string, content: string) {
    onCommit(
      objectsRef.current.map((o) =>
        o.id === id ? { ...o, content, updated_at: new Date().toISOString() } : o
      )
    );
  }

  function zoomBy(factor: number) {
    setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.4, v.scale * factor)) }));
  }

  const cursor =
    tool === "pan" || spaceDown
      ? "cursor-grab"
      : tool === "text"
        ? "cursor-text"
        : tool === "draw"
          ? "cursor-crosshair"
          : tool === "erase"
            ? "cursor-cell"
            : "cursor-default";

  const sorted = [...objects].sort((a, b) => a.z_index - b.z_index);

  // Selecting one piece of an AI aid highlights the whole group.
  const selectedIds = new Set<string>();
  if (selectedId) {
    const sel = objects.find((o) => o.id === selectedId);
    if (sel) for (const gid of groupIds(sel, objects)) selectedIds.add(gid);
  }

  return (
    <div
      ref={containerRef}
      data-board-root
      className={`relative h-full w-full overflow-hidden board-surface select-none touch-none ${cursor}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onClick={(e) => {
        // The click that creates a text box must not steal focus from the
        // freshly auto-focused editor (this was the "text never shows" bug).
        if (editingId) e.preventDefault();
      }}
      role="application"
      aria-label="Learning board canvas"
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          transformOrigin: "0 0"
        }}
      >
        {sorted.map((obj) => (
          <ObjectView
            key={obj.id}
            obj={obj}
            selected={selectedIds.has(obj.id)}
            editing={editingId === obj.id}
            highlight={highlights[obj.id]}
            readOnly={readOnly || (obj.owner !== "student" && obj.type !== "image")}
            onTextChange={(content) => updateText(obj.id, content)}
            onDoneEditing={() => setEditingId(null)}
            onStartEdit={() => {
              if (!readOnly && obj.owner === "student") setEditingId(obj.id);
            }}
            onStartResize={(e) => startResize(e, obj)}
          />
        ))}
        {drag?.mode === "draw" && tool === "draw" ? <LiveStroke points={drag.points} color={draw.color} markerId={draw.style} /> : null}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded-lg shadow-card p-1">
        <button
          className="w-8 h-8 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-600 dark:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(1.2);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Zoom in"
        >
          +
        </button>
        <div className="text-center text-[10px] text-ink-400">{Math.round(view.scale * 100)}%</div>
        <button
          className="w-8 h-8 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-600 dark:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(1 / 1.2);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          className="w-8 h-8 rounded hover:bg-ink-100 dark:hover:bg-ink-800 text-[10px] text-ink-600 dark:text-ink-300"
          onClick={(e) => {
            e.stopPropagation();
            setView({ x: 40, y: 20, scale: 1 });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Reset view"
          title="Reset view"
        >
          ⌂
        </button>
      </div>
    </div>
  );
}

function ObjectView({
  obj,
  selected,
  editing,
  highlight,
  readOnly,
  onTextChange,
  onDoneEditing,
  onStartEdit,
  onStartResize
}: {
  obj: BoardObject;
  selected: boolean;
  editing: boolean;
  highlight?: FeedbackLabel;
  readOnly: boolean;
  onTextChange: (content: string) => void;
  onDoneEditing: () => void;
  onStartEdit: () => void;
  onStartResize: (e: React.PointerEvent) => void;
}) {
  const isAi = obj.owner === "ai" || obj.owner === "system";
  const ring = highlight ? HIGHLIGHT_RING[highlight] ?? "" : "";
  const editRef = useRef<HTMLTextAreaElement | null>(null);

  // autoFocus can lose the race to the pointer/click events that created the
  // box — force focus (twice) so clicking opens a directly-writable editor.
  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    const t = setTimeout(() => el.focus(), 60);
    return () => clearTimeout(t);
  }, [editing]);

  const isEditableText = !readOnly && (obj.type === "text" || obj.type === "note");
  // Set by ✕ before blur fires, so the blur-save doesn't commit text the
  // user asked to discard (blur runs before the button's click handler).
  const cancelRef = useRef(false);
  // ✓ commits the textarea content; ✕ discards it (textarea is uncontrolled).
  function saveEdit() {
    cancelRef.current = false;
    if (editRef.current) onTextChange(editRef.current.value);
    onDoneEditing();
  }
  function cancelEdit() {
    cancelRef.current = true;
    onDoneEditing();
  }

  let body: React.ReactNode;
  if (obj.type === "drawing") {
    let points: Array<{ x: number; y: number }> = [];
    let color = "#166534";
    let styleId = "pen";
    try {
      const parsed = JSON.parse(obj.content);
      points = parsed.points ?? [];
      color = parsed.color ?? color;
      styleId = parsed.style ?? "pen";
    } catch {
      points = [];
    }
    const m = markerById(styleId);
    const { stroke, gradient } = resolveStroke(color, `grad-${obj.id}`);
    const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
    body = (
      <svg width={obj.width} height={obj.height} className="overflow-visible">
        {gradient ? (
          <defs>
            <linearGradient id={`grad-${obj.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradient.from} />
              <stop offset="100%" stopColor={gradient.to} />
            </linearGradient>
          </defs>
        ) : null}
        {m.glow ? (
          <polyline
            points={pts}
            fill="none"
            stroke={stroke}
            strokeWidth={m.width * 3}
            opacity={0.3}
            style={{ filter: "blur(3px)" }}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <polyline
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={m.width}
          opacity={m.opacity}
          strokeDasharray={m.dash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  } else if (obj.type === "diagram") {
    // AI visual aid: content JSON is { title, layout, nodes (positioned), edges }.
    let title = "";
    let nodes: Array<{ id: string; label: string; color: string; x: number; y: number }> = [];
    let edges: Array<{ from: string; to: string; label?: string }> = [];
    try {
      const parsed = JSON.parse(obj.content);
      title = String(parsed.title ?? "");
      nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      edges = Array.isArray(parsed.edges) ? parsed.edges : [];
    } catch {
      // keep empty
    }
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    body = (
      <div className="h-full w-full bg-white dark:bg-ink-900">
        <svg width={obj.width} height={obj.height} viewBox={`0 0 ${obj.width} ${obj.height}`}>
          <defs>
            <marker
              id={`darr-${obj.id}`}
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="#166534" />
            </marker>
          </defs>
          {title ? (
            <text x={16} y={28} fontSize={14} fontWeight={700} fill="#166534">
              🎨 {title}
            </text>
          ) : null}
          {edges.map((e, i) => {
            const a = byId.get(String(e.from));
            const b = byId.get(String(e.to));
            if (!a || !b) return null;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / dist;
            const uy = dy / dist;
            const x1 = a.x + ux * 86;
            const y1 = a.y + uy * 46;
            const x2 = b.x - ux * 86;
            const y2 = b.y - uy * 46;
            return (
              <g key={i}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#166534"
                  strokeWidth={2}
                  markerEnd={`url(#darr-${obj.id})`}
                />
                {e.label ? (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 6}
                    fontSize={10}
                    fontWeight={600}
                    textAnchor="middle"
                    fill="#14532d"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {nodes.map((n) => {
            const lines = wrapLabel(String(n.label ?? ""));
            return (
              <g key={String(n.id)}>
                <ellipse
                  cx={n.x}
                  cy={n.y}
                  rx={82}
                  ry={40}
                  fill={n.color}
                  opacity={0.92}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
                {lines.map((ln, li) => (
                  <text
                    key={li}
                    x={n.x}
                    y={n.y + 4 + (li - (lines.length - 1) / 2) * 13}
                    fontSize={11}
                    fontWeight={600}
                    textAnchor="middle"
                    fill="#ffffff"
                  >
                    {ln}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    );
  } else if (obj.type === "table") {
    // AI visual aid: content JSON is { title, columns, rows }.
    let title = "";
    let columns: string[] = [];
    let rows: string[][] = [];
    try {
      const parsed = JSON.parse(obj.content);
      title = String(parsed.title ?? "");
      columns = Array.isArray(parsed.columns) ? parsed.columns.map((c: unknown) => String(c)) : [];
      rows = Array.isArray(parsed.rows)
        ? parsed.rows.map((r: unknown) =>
            Array.isArray(r) ? r.map((cell: unknown) => String(cell)) : []
          )
        : [];
    } catch {
      // keep empty
    }
    body = (
      <div className="h-full w-full overflow-auto bg-emerald-50 dark:bg-emerald-950/60 p-2">
        {title ? (
          <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-1.5">
            📊 {title}
          </div>
        ) : null}
        <table className="w-full border-collapse text-xs text-emerald-950 dark:text-emerald-100">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  className="border border-emerald-300 dark:border-emerald-800 bg-emerald-100 dark:bg-emerald-900 px-2 py-1 text-left font-semibold"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => (
                  <td
                    key={ci}
                    className="border border-emerald-200 dark:border-emerald-800 px-2 py-1 align-top"
                  >
                    {r[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (editing) {
    body = (
      <textarea
        ref={editRef}
        autoFocus
        placeholder="Type your idea…"
        className="w-full h-full resize-none bg-transparent p-3 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
        defaultValue={obj.content}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => {
          if (!cancelRef.current) onTextChange(e.target.value);
          cancelRef.current = false;
          onDoneEditing();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            saveEdit();
          } else if (e.key === "Escape") {
            cancelEdit();
          }
        }}
        aria-label="Object text"
      />
    );
  } else if (obj.type === "image") {
    // AI visual aid: content JSON is { url, title, source, license, author, sourceUrl }.
    let img: {
      url?: string;
      title?: string;
      source?: string;
      license?: string;
      author?: string;
      sourceUrl?: string;
    } = {};
    try {
      img = JSON.parse(obj.content) ?? {};
    } catch {
      // keep empty
    }
    body = (
      <div className="flex h-full w-full flex-col bg-white dark:bg-ink-900">
        <div className="min-h-0 flex-1">
          {img.url ? (
            <img
              src={img.url}
              alt={img.title ?? "Diagram"}
              className="h-full w-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-400">
              Image unavailable
            </div>
          )}
        </div>
        <div className="border-t border-ink-100 px-2 py-1 text-[10px] leading-tight text-ink-500 dark:border-ink-700 dark:text-ink-400">
          <span className="font-medium">🖼️ “{img.title || "Diagram"}”</span>
          {img.source === "commons" ? (
            <>
              {img.author ? ` by ${img.author}` : ""}
              {img.license ? ` is licensed under ${img.license}` : " · Wikimedia Commons"}
              {img.sourceUrl ? (
                <>
                  {" · "}
                  <a
                    href={img.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    source
                  </a>
                </>
              ) : null}
            </>
          ) : img.source === "ai" ? (
            <> · AI-generated image</>
          ) : img.source === "upload" ? (
            <> · your upload</>
          ) : null}
        </div>
      </div>
    );
  } else if (obj.type === "graph") {
    // Equation graph: content JSON is { expr }. parseGraphSpec understands
    // several cartesian curves, polar r = f(θ) and parametric x = f(t), y = g(t),
    // with unicode math symbols and implicit multiplication (safe local
    // compiler — no eval).
    let raw = "";
    try {
      raw = String((JSON.parse(obj.content) as { expr?: string }).expr ?? "");
    } catch {
      raw = "";
    }
    const spec = raw ? parseGraphSpec(raw) : null;
    const W = obj.width;
    const H = Math.max(60, obj.height - 26);
    const PALETTE = ["#4f46e5", "#dc2626", "#16a34a", "#d97706", "#0891b2", "#9333ea"];
    let plot: React.ReactNode = (
      <div className="flex h-full items-center justify-center px-3 text-center text-xs text-ink-400">
        {raw ? "Can't plot that equation" : "No equation"}
      </div>
    );
    if (spec) {
      // Sample every curve into shared coordinate space.
      type Series = { label: string; pts: Array<{ x: number; y: number } | null> };
      const seriesList: Series[] = [];
      const safeEval = (fn: (v: number) => number | null, v: number): number => {
        try {
          const y = fn(v);
          return typeof y === "number" && Number.isFinite(y) ? y : NaN;
        } catch {
          return NaN;
        }
      };
      if (spec.kind === "cartesian") {
        const xmin = -10;
        const xmax = 10;
        const N = 160;
        for (const c of spec.curves) {
          const pts: Array<{ x: number; y: number } | null> = [];
          for (let i = 0; i <= N; i++) {
            const x = xmin + ((xmax - xmin) * i) / N;
            const y = safeEval(c.fn, x);
            pts.push(Number.isFinite(y) ? { x, y } : null);
          }
          seriesList.push({ label: `y = ${c.expr}`, pts });
        }
      } else if (spec.kind === "polar") {
        const N = 360;
        const pts: Array<{ x: number; y: number } | null> = [];
        for (let i = 0; i <= N; i++) {
          const t = spec.tMin + ((spec.tMax - spec.tMin) * i) / N;
          const r = safeEval(spec.fn, t);
          pts.push(Number.isFinite(r) ? { x: r * Math.cos(t), y: r * Math.sin(t) } : null);
        }
        seriesList.push({ label: `r = ${spec.expr}`, pts });
      } else {
        const N = 300;
        const pts: Array<{ x: number; y: number } | null> = [];
        for (let i = 0; i <= N; i++) {
          const t = spec.tMin + ((spec.tMax - spec.tMin) * i) / N;
          const x = safeEval(spec.fx, t);
          const y = safeEval(spec.fy, t);
          pts.push(Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null);
        }
        seriesList.push({ label: `x = ${spec.xExpr}, y = ${spec.yExpr}`, pts });
      }
      // Shared viewport from the bounding box of all sampled points.
      const allVals: Array<{ x: number; y: number }> = [];
      for (const s of seriesList) for (const p of s.pts) if (p) allVals.push(p);
      if (allVals.length > 1) {
        const xs = allVals.map((p) => p.x).sort((a, b) => a - b);
        const ysArr = allVals.map((p) => p.y).sort((a, b) => a - b);
        // Percentile clamp keeps asymptotes (e.g. tan, 1/x) from flattening the curve.
        let xmin = xs[Math.floor(xs.length * 0.02)];
        let xmax = xs[Math.min(xs.length - 1, Math.ceil(xs.length * 0.98))];
        let ymin = ysArr[Math.floor(ysArr.length * 0.06)];
        let ymax = ysArr[Math.min(ysArr.length - 1, Math.ceil(ysArr.length * 0.94))];
        if (spec.kind === "cartesian") {
          xmin = Math.min(xmin, 0);
          xmax = Math.max(xmax, 0);
        }
        ymin = Math.min(ymin, 0);
        ymax = Math.max(ymax, 0);
        if (xmax - xmin < 1e-9) {
          xmin -= 1;
          xmax += 1;
        }
        if (ymax - ymin < 1e-9) {
          ymin -= 1;
          ymax += 1;
        }
        const padX = (xmax - xmin) * 0.04;
        const padY = (ymax - ymin) * 0.08;
        xmin -= padX;
        xmax += padX;
        ymin -= padY;
        ymax += padY;
        const sx = (x: number) => ((x - xmin) / (xmax - xmin)) * W;
        const sy = (y: number) => H - ((y - ymin) / (ymax - ymin)) * H;
        const fmt = (v: number) => (Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
        const gxStep = Math.max(1, Math.round((xmax - xmin) / 8));
        const gyStep = Math.max(1, Math.round((ymax - ymin) / 6));
        const gridV: number[] = [];
        for (let g = Math.ceil(xmin / gxStep) * gxStep; g <= xmax; g += gxStep) gridV.push(g);
        const gridH: number[] = [];
        for (let g = Math.ceil(ymin / gyStep) * gyStep; g <= ymax; g += gyStep) gridH.push(g);
        const paths = seriesList.map((s, idx) => {
          let d = "";
          let pen = false;
          for (const p of s.pts) {
            if (!p || p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) {
              pen = false;
              continue;
            }
            d += `${pen ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
            pen = true;
          }
          return <path key={idx} d={d} fill="none" stroke={PALETTE[idx % PALETTE.length]} strokeWidth={2} vectorEffect="non-scaling-stroke" />;
        });
        plot = (
          <div className="flex h-full w-full flex-col">
            <svg viewBox={`0 0 ${W} ${H}`} className="min-h-0 w-full flex-1" preserveAspectRatio="none">
              {gridV.map((g) => (
                <line key={`gv${g}`} x1={sx(g)} y1={0} x2={sx(g)} y2={H} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {gridH.map((g) => (
                <line key={`gh${g}`} x1={0} y1={sy(g)} x2={W} y2={sy(g)} stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {ymin < 0 && ymax > 0 ? (
                <line x1={0} y1={sy(0)} x2={W} y2={sy(0)} stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : null}
              {xmin < 0 && xmax > 0 ? (
                <line x1={sx(0)} y1={0} x2={sx(0)} y2={H} stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ) : null}
              {spec.kind === "cartesian" && xmin < 0 && xmax > 0
                ? gridV
                    .filter((g) => g !== 0)
                    .map((g) => (
                      <text key={`tx${g}`} x={sx(g)} y={Math.min(H - 3, Math.max(10, sy(0) + 11))} fontSize={9} fill="#94a3b8" textAnchor="middle">
                        {fmt(g)}
                      </text>
                    ))
                : null}
              <text x={W - 12} y={Math.min(H - 4, Math.max(10, (ymin < 0 && ymax > 0 ? sy(0) : H / 2) - 4))} fontSize={10} fill="#94a3b8">
                x
              </text>
              <text x={(xmin < 0 && xmax > 0 ? sx(0) : 4) + 3} y={10} fontSize={10} fill="#94a3b8">
                y
              </text>
              {paths}
              <text x={4} y={12} fontSize={10} fill="#64748b">
                x ∈ [{fmt(xmin)}, {fmt(xmax)}] · y ∈ [{fmt(ymin)}, {fmt(ymax)}]
              </text>
            </svg>
            {seriesList.length > 1 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1 text-[10px] text-ink-500">
                {seriesList.map((s, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                    {s.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      }
    }
    // Assign to body (not a bare return) so the card lands inside the
    // positioned, draggable data-object-id wrapper like every other type.
    body = (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-lg bg-white dark:bg-ink-900">
        <div className="truncate px-2 pt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300" title={raw}>
          📈 {raw}
        </div>
        <div className="min-h-0 flex-1">{plot}</div>
      </div>
    );
  } else if (obj.type === "connector") {
    let dx = 0;
    let dy = 80;
    try {
      const parsed = JSON.parse(obj.content);
      dx = Number(parsed.dx) || 0;
      dy = Number(parsed.dy) || 80;
    } catch {
      // keep defaults
    }
    const w = Math.abs(dx) + 24;
    const h = Math.abs(dy) + 24;
    const x1 = dx < 0 ? w - 12 : 12;
    const y1 = dy < 0 ? h - 12 : 12;
    const x2 = 12 + dx;
    const y2 = 12 + dy;
    body = (
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#166534" />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#166534"
          strokeWidth={2.5}
          markerEnd="url(#arrowhead)"
        />
      </svg>
    );
  } else {
    const isText = obj.type === "text" || obj.type === "formula";
    body = (
      <div
        className={`h-full w-full overflow-hidden p-3 text-sm whitespace-pre-wrap ${
          isAi
            ? obj.owner === "ai"
              ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100"
              : "bg-ink-50 text-ink-800 dark:bg-ink-800 dark:text-ink-100"
            : isText
              ? "bg-white text-ink-900 dark:bg-ink-900 dark:text-ink-50"
              : "bg-sun-50 text-ink-900 dark:bg-ink-800 dark:text-ink-50"
        }`}
      >
        {obj.content ? (
          obj.content
        ) : !isAi && (obj.type === "text" || obj.type === "note") ? (
          <span className="text-ink-300 dark:text-ink-600 italic">Click to write…</span>
        ) : null}
      </div>
    );
  }

  // While editing the box becomes a transparent editor — no opaque card
  // sitting in front of the textarea.
  const boxChrome = editing
    ? "border-2 border-dashed border-brand-400 bg-white/40 dark:bg-ink-900/40"
    : obj.type !== "drawing" && obj.type !== "connector"
      ? "border shadow-card " +
        (obj.owner === "ai"
          ? "border-emerald-300 dark:border-emerald-700"
          : obj.owner === "system"
            ? "border-sun-300 dark:border-ink-600"
            : "border-ink-200 dark:border-ink-700")
      : "";

  return (
    <div
      data-object-id={obj.id}
      className={`absolute rounded-lg ${boxChrome} ${selected ? "ring-2 ring-brand-500" : ""} ${ring}`}
      style={{
        left: obj.x,
        top: obj.y,
        width: obj.width,
        height: obj.height,
        zIndex: obj.z_index
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {obj.owner === "ai" && obj.type !== "drawing" && obj.type !== "connector" ? (
        <span className="absolute -top-2.5 left-2 z-10 bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
          ✦ StepWise
        </span>
      ) : null}
      {isEditableText && !editing ? (
        <button
          className="absolute -top-3 left-2 z-20 h-6 w-6 rounded-full bg-sun-400 hover:bg-sun-300 text-ink-900 text-xs leading-none shadow-card"
          title="Edit text"
          aria-label="Edit text"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
        >
          ✎
        </button>
      ) : null}
      {isEditableText && editing ? (
        <div className="absolute -top-3 left-2 z-20 flex gap-1">
          <button
            className="h-6 w-6 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-xs leading-none shadow-card"
            title="Save changes"
            aria-label="Save changes"
            onPointerDown={(e) => {
              // preventDefault keeps focus in the textarea so blur doesn't
              // commit before the click lands.
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              saveEdit();
            }}
          >
            ✓
          </button>
          <button
            className="h-6 w-6 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs leading-none shadow-card"
            title="Discard changes"
            aria-label="Discard changes"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onClick={(e) => {
              e.stopPropagation();
              cancelEdit();
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
      {highlight ? (
        <span className="absolute -top-2.5 right-2 z-10 bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-600 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {FEEDBACK_META[highlight]?.icon} {FEEDBACK_META[highlight]?.label}
        </span>
      ) : null}
      {body}
      {selected && !readOnly ? (
        <div
          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-sm bg-brand-500 cursor-nwse-resize"
          onPointerDown={onStartResize}
          aria-label="Resize handle"
        />
      ) : null}
    </div>
  );
}

// Wrap a diagram node label into up to 3 short lines.
function wrapLabel(label: string): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > 14) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

// Live preview of the stroke being drawn, honoring the selected color /
// gradient and marker style.
function LiveStroke({
  points,
  color,
  markerId
}: {
  points: Array<{ x: number; y: number }>;
  color: string;
  markerId: string;
}) {
  const m = markerById(markerId);
  const { stroke, gradient } = resolveStroke(color, "grad-live");
  const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg className="absolute left-0 top-0 overflow-visible pointer-events-none" width={1} height={1}>
      {gradient ? (
        <defs>
          <linearGradient id="grad-live" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={gradient.from} />
            <stop offset="100%" stopColor={gradient.to} />
          </linearGradient>
        </defs>
      ) : null}
      {m.glow ? (
        <polyline
          points={pts}
          fill="none"
          stroke={stroke}
          strokeWidth={m.width * 3}
          opacity={0.3}
          style={{ filter: "blur(3px)" }}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={m.width}
        opacity={m.opacity}
        strokeDasharray={m.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
