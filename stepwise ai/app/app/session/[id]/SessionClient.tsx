"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import Board, { Tool } from "@/components/board/Board";
import { SOLID_COLORS, GRADIENTS, MARKER_STYLES, DEFAULT_DRAW_OPTIONS } from "@/components/board/drawOptions";
import { Button, Alert, Spinner, FEEDBACK_META, Badge, DemoBanner } from "@/components/ui";
import type {
  BoardObject,
  EvaluationResult,
  FeedbackLabel,
  Hint,
  QuestionAnalysis
} from "@/lib/types";
import { parseGraphSpec } from "@/lib/graphMath";

interface SessionPayload {
  session: {
    id: number;
    status: string;
    state: string;
    currentStep: number;
    activeSeconds: number;
    startedAt: string;
    question: string;
    analysis: QuestionAnalysis;
    stateData: Record<string, unknown>;
    boardId: number;
    boardTitle: string;
  };
  objects: BoardObject[];
  messages: Array<{ kind: string; content_json: string }>;
  provider: { displayName: string; isDemo: boolean };
}

type SaveStatus = "saved" | "saving" | "error";

// Math symbols students may not know how to type, offered as one-tap chips
// in the graph popover.
const GRAPH_SYMBOLS = ["π", "√", "²", "³", "^", "θ", "abs("];
// Clickable examples covering the supported graph kinds.
const GRAPH_EXAMPLES = [
  "y = x^2 − 3",
  "y = sin(x), y = cos(x)",
  "r = 1 + cos(θ)",
  "x = cos(t), y = sin(t)",
  "y = x^3 − 3x",
  "y = 2x + 1"
];

interface AttachmentInfo {
  id: number;
  kind: "image" | "pdf";
  name: string;
  mime: string;
  url: string;
  summary: string;
  created_at: string;
}

const STATUS_META: Record<string, { icon: string; label: string; tone: string }> = {
  correct: { icon: "🟢", label: "Correct", tone: "text-emerald-700 dark:text-emerald-300" },
  partial: { icon: "🟡", label: "Partially correct", tone: "text-amber-700 dark:text-amber-300" },
  error: { icon: "🔴", label: "Needs work", tone: "text-red-700 dark:text-red-300" },
  uncertain: { icon: "⚪", label: "AI is unsure", tone: "text-ink-500" }
};

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params.id;

  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [objects, setObjects] = useState<BoardObject[]>([]);
  const historyRef = useRef<BoardObject[][]>([]);
  const futureRef = useRef<BoardObject[][]>([]);
  const [, forceRender] = useState(0);

  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState<string>(DEFAULT_DRAW_OPTIONS.color);
  const [drawStyle, setDrawStyle] = useState<string>(DEFAULT_DRAW_OPTIONS.style);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectsRef = useRef<BoardObject[]>([]);
  objectsRef.current = objects;

  const [highlights, setHighlights] = useState<Record<string, FeedbackLabel>>({});
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "hint" | "finish" | "visual">("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [stepsDone, setStepsDone] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [allDone, setAllDone] = useState(false);

  // --- Graph-from-equation & file attachments -------------------------------
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphExpr, setGraphExpr] = useState("y = x^2");
  const exprInputRef = useRef<HTMLInputElement | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>([]);

  // --- Voice chat (speech-to-text input + read-aloud feedback) --------------
  const [voiceOk, setVoiceOk] = useState(false);
  const [speakOk, setSpeakOk] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    setVoiceOk(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    setSpeakOk("speechSynthesis" in window);
  }, []);

  function addVoiceNote(text: string) {
    const count = objectsRef.current.filter((o) => o.owner === "student").length;
    const note: BoardObject = {
      id: `obj-voice-${Date.now()}`,
      board_id: "",
      type: "text",
      x: 60 + (count % 4) * 30,
      y: 380 + (count % 6) * 24,
      width: 280,
      height: 96,
      rotation: 0,
      z_index: 100 + count,
      content: `🎤 ${text}`,
      style: {},
      meta: {},
      owner: "student",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    commit([...objectsRef.current, note]);
  }

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const w = window as unknown as Record<string, any>;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) addVoiceNote(finalText.trim());
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
    };
    setListening(true);
    rec.start();
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  }

  const mountedAt = useRef(Date.now());
  const baseActiveSeconds = useRef(0);

  // --- Load session (full recovery payload, spec part 66) -------------------
  useEffect(() => {
    api<SessionPayload>(`/api/sessions/${sessionId}`)
      .then((data) => {
        setPayload(data);
        setObjects(data.objects);
        baseActiveSeconds.current = data.session.activeSeconds;
        const done = Array.isArray(data.session.stateData.stepsCompleted)
          ? (data.session.stateData.stepsCompleted as number[])
          : [];
        setStepsDone(done);
        setCurrentStep(data.session.currentStep);
        if (done.length >= data.session.analysis.steps.length) setAllDone(true);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load session."));
  }, [sessionId]);

  // Materials the student already attached to this session.
  useEffect(() => {
    api<{ attachments: AttachmentInfo[] }>(`/api/sessions/${sessionId}/attachments`)
      .then((d) => setAttachments(d.attachments))
      .catch(() => {});
  }, [sessionId]);

  function activeSeconds() {
    return baseActiveSeconds.current + Math.floor((Date.now() - mountedAt.current) / 1000);
  }

  const completed = payload?.session.status === "completed";

  // --- Autosave (debounced optimistic snapshot, spec part 21) ---------------
  const flushSave = useCallback(async (): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!payload) return;
    setSaveStatus("saving");
    try {
      await api(`/api/boards/${payload.session.boardId}`, {
        method: "PUT",
        body: { objects: objectsRef.current }
      });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [payload]);

  const commit = useCallback((next: BoardObject[]) => {
    historyRef.current.push(objectsRef.current);
    if (historyRef.current.length > 80) historyRef.current.shift();
    futureRef.current = [];
    setObjects(next);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      flushSave();
    }, 1200);
    forceRender((n) => n + 1);
  }, [flushSave]);

  function undo() {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(objectsRef.current);
    setObjects(prev);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      flushSave();
    }, 1200);
    forceRender((n) => n + 1);
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(objectsRef.current);
    setObjects(next);
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      flushSave();
    }, 1200);
    forceRender((n) => n + 1);
  }

  // Ctrl+Z / Ctrl+Y keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))
      ) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The student's attempt = everything they wrote or drew on the Board.
  function attemptText() {
    return objectsRef.current
      .filter((o) => o.owner === "student" && o.content.trim().length > 0)
      .map((o) => (o.type === "drawing" ? "[drawing on the board]" : o.content))
      .join("\n\n");
  }

  // --- Teaching loop ---------------------------------------------------------
  async function checkThis() {
    if (!payload) return;
    setBusy("check");
    setActionError(null);
    try {
      await flushSave(); // AI must see the latest board (spec part 39).
      const res = await api<{
        evaluation: EvaluationResult;
        stepJustCompleted: boolean;
        nextStepIndex: number;
        allStepsDone: boolean;
        sessionState: string;
      }>(`/api/sessions/${sessionId}/analyze`, {
        method: "POST",
        body: {
          stepIndex: currentStep,
          attemptText: attemptText(),
          activeSeconds: activeSeconds()
        }
      });
      setEvaluation(res.evaluation);
      setHint(null);
      const next: Record<string, FeedbackLabel> = {};
      for (const item of res.evaluation.feedback) {
        for (const id of item.objectIds) next[id] = item.label;
      }
      setHighlights(next);
      if (res.stepJustCompleted) {
        setStepsDone((prev) => (prev.includes(currentStep) ? prev : [...prev, currentStep]));
        setCurrentStep(res.nextStepIndex);
      }
      if (res.allStepsDone) setAllDone(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Check failed. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function askHint() {
    if (!payload) return;
    setBusy("hint");
    setActionError(null);
    try {
      await flushSave();
      const res = await api<{ hint: Hint; level: number }>(`/api/sessions/${sessionId}/hint`, {
        method: "POST",
        body: { attemptText: attemptText() }
      });
      setHint(res.hint);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't get a hint. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function finish() {
    setBusy("finish");
    setActionError(null);
    try {
      await flushSave();
      await api(`/api/sessions/${sessionId}/complete`, {
        method: "POST",
        body: { activeSeconds: activeSeconds() }
      });
      router.push(`/report/${sessionId}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't finish the session.");
      setBusy("");
    }
  }

  // AI draws a supporting flowchart or table for this step.
  async function requestVisualAid(kind: "table" | "flowchart") {
    if (!payload) return;
    setBusy("visual");
    setActionError(null);
    try {
      await flushSave();
      const res = await api<{ kind: string; objects: BoardObject[] }>(
        `/api/sessions/${sessionId}/visual-aid`,
        { body: { kind } }
      );
      if (res.objects?.length) {
        commit([...objectsRef.current, ...res.objects]);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Couldn't generate the visual aid. Try again."
      );
    } finally {
      setBusy("");
    }
  }

  // Plot an equation as a student-owned graph object on the Board.
  function addGraph() {
    if (!payload) return;
    setActionError(null);
    const cleaned = graphExpr.trim();
    if (!cleaned) return;
    if (!parseGraphSpec(cleaned)) {
      setActionError(
        "That equation doesn't parse. Try y = 2x + 1, y = sin(x), y = cos(x), r = 1 + cos(θ) or x = cos(t), y = sin(t)."
      );
      return;
    }
    const objs = objectsRef.current;
    // Free space: past the right edge of everything on the board (+ gap),
    // aligned with the top row — never on top of the question or other objects.
    const maxX = objs.length ? Math.max(...objs.map((o) => o.x + o.width)) : 0;
    const minY = objs.length ? Math.min(...objs.map((o) => o.y)) : 40;
    const maxZ = objs.reduce((m, o) => Math.max(m, o.z_index), 0);
    const obj: BoardObject = {
      id: `obj-graph-${Date.now()}`,
      board_id: "",
      type: "graph",
      x: Math.round(maxX + 120),
      y: Math.round(minY),
      width: 440,
      height: 330,
      rotation: 0,
      z_index: maxZ + 1,
      content: JSON.stringify({ expr: cleaned }),
      style: {},
      meta: {},
      owner: "student",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    commit([...objs, obj]);
    setGraphOpen(false);
  }

  // Insert a math symbol at the cursor inside the equation input.
  function insertSymbol(sym: string) {
    const el = exprInputRef.current;
    if (!el) {
      setGraphExpr((v) => v + sym);
      return;
    }
    const start = el.selectionStart ?? graphExpr.length;
    const end = el.selectionEnd ?? graphExpr.length;
    const next = graphExpr.slice(0, start) + sym + graphExpr.slice(end);
    setGraphExpr(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + sym.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // --- Render ------------------------------------------------------------------
    if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-4">
          <Alert tone="error">{loadError}</Alert>
          <Link href="/home" className="block text-center text-brand-600 font-medium hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Opening your Board..." />
      </div>
    );
  }
  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Opening your Board..." />
      </div>
    );
  }

  const { analysis } = payload.session;
  const steps = analysis.steps;
  const step = steps[Math.min(currentStep, steps.length - 1)];
  const statusMeta = evaluation ? STATUS_META[evaluation.status] : null;

  // Preview stroke color for marker-style buttons (gradients show their start).
  const previewColor = drawColor.startsWith("grad:")
    ? GRADIENTS.find((g) => `grad:${g.id}` === drawColor)?.from ?? "#166534"
    : drawColor;

  const toolBtn = (t: Tool, label: string, icon: string) => (
    <button
      key={t}
      onClick={() => setTool(t)}
      disabled={!!completed}
      className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
        tool === t
          ? "bg-brand-600 text-white"
          : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
      }`}
      aria-pressed={tool === t}
      title={label}
    >
      <span aria-hidden>{icon}</span> <span className="hidden lg:inline">{label}</span>
    </button>

  return (
    <div className="h-screen flex flex-col bg-ink-50 dark:bg-ink-950">
      <DemoBanner visible={payload.provider.isDemo} />

      {/* Top bar */}
      <header className="h-14 shrink-0 bg-white dark:bg-ink-900 border-b border-ink-200 dark:border-ink-800 flex items-center gap-3 px-4">
        <Link
          href="/home"
          className="flex items-center gap-1.5 font-bold text-brand-700 dark:text-brand-300 whitespace-nowrap"
          aria-label="Back to home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-9 w-9 object-contain" />
          StepWise
        </Link>
        <div className="h-6 w-px bg-ink-200 dark:bg-ink-700" />
        <h1 className="text-sm font-semibold text-ink-800 dark:text-ink-100 truncate">
          {analysis.topic || payload.session.question}
        </h1>

        <div className="ml-auto flex items-center gap-1.5">
          <span
            className={`text-xs mr-2 ${
              saveStatus === "saved"
                ? "text-ink-400"
                : saveStatus === "saving"
                  ? "text-amber-600"
                  : "text-red-600"
            }`}
            role="status"
          >
            {saveStatus === "saved" ? "✓ Saved" : saveStatus === "saving" ? "Saving…" : "Save failed"}
          </span>
          <button
            onClick={undo}
            disabled={historyRef.current.length === 0 || !!completed}
            className="px-2.5 py-1.5 rounded-lg text-sm text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 disabled:opacity-40"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={futureRef.current.length === 0 || !!completed}
            className="px-2.5 py-1.5 rounded-lg text-sm text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 disabled:opacity-40"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            ↷
          </button>
          <div className="h-6 w-px bg-ink-200 dark:bg-ink-700 mx-1" />
          {toolBtn("select", "Select", "🖱️")}
          {toolBtn("text", "Text", "T")}
          {toolBtn("draw", "Draw", "✏️")}
          {toolBtn("erase", "Erase", "⌫")}
          {toolBtn("pan", "Pan", "✋")}
          <div className="h-6 w-px bg-ink-200 dark:bg-ink-700 mx-1" />
          <button
            onClick={() => requestVisualAid("flowchart")}
            disabled={!!completed || busy !== ""}
            className="px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            title="AI generates a flowchart for this step"
          >
            {busy === "visual" ? "…" : "🗺️"} <span className="hidden lg:inline">Flowchart</span>
          </button>
          <button
            onClick={() => requestVisualAid("table")}
            disabled={!!completed || busy !== ""}
            className="px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 text-ink-600 hover:bg-ink-100 dark:text-ink-300 
