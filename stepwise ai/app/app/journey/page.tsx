"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api } from "@/lib/client";
import { Card, Badge, Spinner, EmptyState } from "@/components/ui";
import type { Recommendation } from "@/lib/types";

interface JourneyConcept {
  name: string;
  subject: string;
  topic: string;
  status: string;
  evidence_count: number;
  review_due: string | null;
}

interface JourneyData {
  concepts: JourneyConcept[];
  misconceptions: Array<{
    description: string;
    concept_name: string;
    status: string;
    occurrence_count: number;
  }>;
  reviews: Array<{ concept_name: string; due_at: string; reason: string; status: string }>;
  recommendations: Recommendation[];
  events: Array<{ event_type: string; created_at: string; detail_json: string }>;
  stats: { sessions: number; completed: number; self_corrections: number };
}

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red" | "blue" | "purple"> = {
  UNKNOWN: "neutral",
  INTRODUCED: "blue",
  EXPLORING: "blue",
  DEVELOPING: "amber",
  PARTIALLY_UNDERSTOOD: "amber",
  UNDERSTOOD: "green",
  STRONG: "green",
  MASTERED: "purple",
  NEEDS_REVIEW: "amber",
  MISCONCEPTION_DETECTED: "red",
  PREREQUISITE_BLOCKED: "red"
};

const STATUS_LABEL: Record<string, string> = {
  UNKNOWN: "Not started",
  INTRODUCED: "Introduced",
  EXPLORING: "Exploring",
  DEVELOPING: "Developing",
  PARTIALLY_UNDERSTOOD: "Partially understood",
  UNDERSTOOD: "Understood",
  STRONG: "Strong",
  MASTERED: "Mastered",
  NEEDS_REVIEW: "Needs review",
  MISCONCEPTION_DETECTED: "Misconception detected",
  PREREQUISITE_BLOCKED: "Blocked by prerequisite"
};

export default function JourneyPage() {
  const [journey, setJourney] = useState<JourneyData | null>(null);

  useEffect(() => {
    api<{ journey: JourneyData }>("/api/journey")
      .then((d) => setJourney(d.journey))
      .catch(() => setJourney(null));
  }, []);

  if (!journey) {
    return (
      <Shell active="journey">
        <div className="flex justify-center py-20">
          <Spinner label="Mapping your journey..." />
        </div>
      </Shell>
    );
  }

  const mastered = journey.concepts.filter((c) => c.status === "MASTERED").length;

  return (
    <Shell active="journey">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">My Learning Journey</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            Every session adds evidence of what you truly understand. Mastery is earned, never
            assumed.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "📚", value: String(journey.stats.sessions), label: "Sessions" },
            { icon: "🏁", value: String(journey.stats.completed), label: "Completed" },
            { icon: "💪", value: String(journey.stats.self_corrections), label: "Self-corrections" }
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-4 text-center"
            >
              <div className="text-xl" aria-hidden>
                {s.icon}
              </div>
              <div className="mt-1 text-xl font-bold text-ink-900 dark:text-ink-50">{s.value}</div>
              <div className="text-xs text-ink-500">{s.label}</div>
            </div>
          ))}
        </div>

        {journey.recommendations.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">
              🧭 Recommended next
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {journey.recommendations.map((r, i) => (
                <li key={i}>
                  <Card className="p-4 h-full">
                    <Badge tone="blue">{r.type.replace(/_/g, " ")}</Badge>
                    <p className="mt-2 text-sm font-semibold text-ink-900 dark:text-ink-50">
                      {r.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">{r.reason}</p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">
            🧠 Concepts {mastered > 0 ? `· ${mastered} mastered` : ""}
          </h2>
          {journey.concepts.length === 0 ? (
            <Card className="mt-3">
              <EmptyState
                icon="🌱"
                title="No concepts yet"
                message="Complete a learning session and StepWise will start mapping what you know."
                action={
                  <Link href="/home" className="text-brand-600 font-medium hover:underline">
                    Start learning →
                  </Link>
                }
              />
            </Card>
          ) : (
            <ul className="mt-3 space-y-2">
              {journey.concepts.map((c, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">
                      {c.name}
                    </p>
                    <p className="text-xs text-ink-400 truncate">
                      {[c.subject, c.topic].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-400" title="Evidence of understanding">
                      {c.evidence_count} evidence
                    </span>
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {journey.misconceptions.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">
              🪤 Misconceptions being addressed
            </h2>
            <ul className="mt-3 space-y-2">
              {journey.misconceptions.map((m, i) => (
                <li key={i} className="bg-white dark:bg-ink-900 border border-red-200 dark:border-red-900/60 rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-ink-800 dark:text-ink-100">{m.description}</p>
                    <Badge tone={m.status === "RESOLVED" ? "green" : "red"}>
                      {m.status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {m.concept_name} · seen {m.occurrence_count}×
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {journey.reviews.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">
              🔁 Coming up for review
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              Spaced repetition keeps understanding strong — StepWise schedules reviews
              automatically.
            </p>
            <ul className="mt-3 space-y-2">
              {journey.reviews.map((r, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                      {r.concept_name}
                    </p>
                    <p className="text-xs text-ink-400">{r.reason}</p>
                  </div>
                  <span className="text-xs text-ink-500 whitespace-nowrap">
                    due {new Date(r.due_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}
