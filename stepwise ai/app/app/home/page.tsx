"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api } from "@/lib/client";
import { Button, Card, Textarea, Badge, Alert, Spinner, EmptyState } from "@/components/ui";

interface SessionListItem {
  id: number;
  question_text: string;
  topic: string;
  status: string;
  state: string;
  started_at: string;
  has_report: boolean;
}

const ATTACH_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf"
]);
const MAX_ATTACH_SIZE = 8 * 1024 * 1024; // 8 MB

// A file the student attached on the question bar. The AI reads it
// immediately (POST /api/attachments) and the summary is shown here before
// the session even exists; the row is claimed when the session starts.
interface StagedFile {
  key: string;
  id: number | null;
  name: string;
  kind: "image" | "pdf";
  summary: string;
  status: "reading" | "ready" | "error";
}

export default function HomePage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api<{ sessions: SessionListItem[] }>("/api/sessions")
      .then((d) => setSessions(d.sessions))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  // Spec part 65: student asks a question -> AI prepares -> Board opens.
  // Attached files were already read by the AI; their ids travel with the
  // create request so the lesson is built from the document itself.
  async function startSession() {
    if (staged.some((s) => s.status === "reading")) {
      setError("Wait a moment — the AI is still reading your files.");
      return;
    }
    const ready = staged.filter((s) => s.status === "ready" && s.id !== null);
    const q = question.trim();
    if (!q && ready.length === 0) {
      setError("Tell StepWise what you want to learn first.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await api<{
        sessionId: number;
        needsClarification?: boolean;
        clarifyQuestion?: string;
      }>("/api/sessions", {
        method: "POST",
        body: { question: q, attachmentIds: ready.map((s) => s.id) }
      });
      if (res.needsClarification) {
        setError(res.clarifyQuestion ?? "Please add a bit more detail to your question.");
        setStarting(false);
        return;
      }
      router.push(`/session/${res.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the session.");
      setStarting(false);
    }
  }

  // Send one file to the AI straight away; the summary comes back before the
  // session exists so the student sees what the AI understood.
  async function stageFile(key: string, file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: fd,
        credentials: "same-origin"
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { attachment?: { id: number; kind: "image" | "pdf"; summary: string } };
        error?: { message?: string } | null;
      };
      const att = json?.data?.attachment;
      if (!res.ok || json?.error || !att) {
        setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, status: "error" } : s)));
        setError(json?.error?.message ?? `Couldn't read "${file.name}".`);
        return;
      }
      setStaged((prev) =>
        prev.map((s) =>
          s.key === key
            ? { ...s, id: att.id, kind: att.kind, summary: att.summary, status: "ready" }
            : s
        )
      );
    } catch {
      setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, status: "error" } : s)));
      setError(`Couldn't read "${file.name}".`);
    }
  }

  // Validate picked files client-side (the server enforces the same rules),
  // then have the AI read each one immediately.
  function pickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    for (const f of Array.from(list)) {
      if (!ATTACH_TYPES.has((f.type || "").toLowerCase())) {
        setError(`"${f.name}" isn't supported — attach a picture (PNG/JPEG/WebP/GIF) or a PDF.`);
        continue;
      }
      if (f.size > MAX_ATTACH_SIZE) {
        setError(`"${f.name}" is over 8 MB.`);
        continue;
      }
      const key = `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setStaged((prev) => [
        ...prev,
        {
          key,
          id: null,
          name: f.name,
          kind: f.type === "application/pdf" ? "pdf" : "image",
          summary: "",
          status: "reading"
        }
      ]);
      void stageFile(key, f);
    }
  }

  const inProgress = sessions.filter((s) => s.status !== "completed");
  const completed = sessions.filter((s) => s.status === "completed");

  return (
    <Shell active="home">
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-100">
          What do you want to understand today?
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Ask anything — or attach a picture or PDF and ask about it. StepWise opens a Board and
          guides you step by step.
        </p>

        <Card className="mt-6 p-5">
          <Textarea
            aria-label="Your question"
            rows={3}
            placeholder="e.g. Explain how photosynthesis works, or: Help me understand fractions…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") startSession();
            }}
          />
          {staged.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {staged.map((s) => (
                <div
                  key={s.key}
                  className="rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 text-xs text-ink-600 dark:text-ink-300">
                    <span>{s.kind === "pdf" ? "📄" : "🖼️"} {s.name}</span>
                    <span
                      className={
                        s.status === "ready"
                          ? "text-green-600 dark:text-green-400"
                          : s.status === "error"
                            ? "text-red-500"
                            : "text-ink-400"
                      }
                    >
                      {s.status === "reading"
                        ? "⏳ AI is reading it…"
                        : s.status === "ready"
                          ? "✓ understood"
                          : "⚠ couldn't read"}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${s.name}`}
                      onClick={() => setStaged((prev) => prev.filter((x) => x.key !== s.key))}
                      className="ml-auto text-ink-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                  {s.summary ? (
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                      {s.summary}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3">
              <Alert tone="warning">{error}</Alert>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={starting}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-ink-300 dark:border-ink-600 text-ink-500 dark:text-ink-300 hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-40"
                title="Attach pictures or a PDF — the AI reads them and uses them while teaching you"
              >
                📎 Attach files
              </button>
              <span className="text-xs text-ink-400">Ctrl + Enter to start</span>
            </div>
            <Button
              size="lg"
              onClick={startSession}
              disabled={starting || staged.some((s) => s.status === "reading")}
            >
              {starting ? "Preparing your Board..." : "✦ Start Learning"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            aria-label="Attach pictures or a PDF"
            onChange={(e) => {
              pickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </Card>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-200">
            Continue learning
          </h2>
          {loading ? (
            <div className="mt-4">
              <Spinner label="Loading your sessions..." />
            </div>
          ) : inProgress.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon="🧭"
                title="Nothing in progress"
                message="Ask a question above to open your first learning Board."
              />
            </Card>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {inProgress.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/session/${s.id}`}
                    className="block h-full bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl p-4 hover:border-brand-400 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100 line-clamp-2">
                        {s.question_text}
                      </p>
                      <Badge tone="amber">In progress</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-400">
                      {s.topic || "Topic"} · {new Date(s.started_at).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {completed.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-200">Completed</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {completed.map((s) => (
                <li key={s.id}>
                  <div className="flex h-full items-center justify-between gap-3 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-800 dark:text-ink-100 truncate">
                        {s.question_text}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">{s.topic || "Topic"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="green">✓ Done</Badge>
                      {s.has_report ? (
                        <Link
                          href={`/report/${s.id}`}
                          className="text-sm font-medium text-brand-600 hover:underline"
                        >
                          Report
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
