"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import Shell from "@/components/Shell";
import { Card, Badge, Alert, Spinner } from "@/components/ui";
import type { FinalReport } from "@/lib/types";

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0 min";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} sec`;
  return s > 0 ? `${m} min ${s} sec` : `${m} min`;
}

export default function ReportPage() {
  const params = useParams<{ sessionId: string }>();
  const [report, setReport] = useState<FinalReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ report: FinalReport; createdAt: string }>(`/api/reports/${params.sessionId}`)
      .then((d) => setReport(d.report))
      .catch((err) => setError(err instanceof Error ? err.message : "Report not found."));
  }, [params.sessionId]);

  if (error) {
    return (
      <Shell active="home">
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Alert tone="error">{error}</Alert>
          <Link href="/home" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
            ← Back to Home
          </Link>
        </div>
      </Shell>
    );
  }
  if (!report) {
    return (
      <Shell active="home">
        <div className="flex justify-center py-20">
          <Spinner label="Loading your report..." />
        </div>
      </Shell>
    );
  }

  const stat = (label: string, value: string, icon: string) => (
    <div className="rounded-xl bg-ink-50 dark:bg-ink-800/60 p-4 text-center">
      <div className="text-xl" aria-hidden>
        {icon}
      </div>
      <div className="mt-1 text-lg font-bold text-ink-900 dark:text-ink-50">{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );

  return (
    <Shell active="home">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 animate-fade-in">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-600 font-semibold">
            Final Report
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-ink-50">{report.topic}</h1>
          <p className="mt-1 text-sm text-ink-500 italic">“{report.question}”</p>
          <div className="mt-3">
            <Badge tone="green">🏁 {report.statusLabel}</Badge>
          </div>
        </div>

        {/* Numbers the server measured — never AI-estimated (spec part 75) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stat("Active time", formatDuration(report.activeTimeSeconds), "⏱️")}
          {stat("Mistakes found", String(report.mistakes), "⚠️")}
          {stat("Fixed by you", String(report.independentCorrections), "💪")}
          {stat("Hints used", String(report.hintsUsed), "💡")}
        </div>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">
            📈 How your understanding grew
          </h2>
          <ol className="mt-3 space-y-2 text-sm text-ink-700 dark:text-ink-200">
            <li className="flex gap-2">
              <Badge tone="neutral">Start</Badge>
              <span>{report.understandingProgression.start}</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="amber">During</Badge>
              <span>{report.understandingProgression.during}</span>
            </li>
            <li className="flex gap-2">
              <Badge tone="green">End</Badge>
              <span>{report.understandingProgression.end}</span>
            </li>
          </ol>
        </Card>

        {report.errors.length > 0 ? (
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">
              ⚠️ Mistakes and how they were resolved
            </h2>
            <ul className="mt-3 space-y-3">
              {report.errors.map((e, i) => (
                <li key={i} className="rounded-lg border border-ink-100 dark:border-ink-800 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={e.corrected ? "green" : "red"}>
                      {e.selfCorrected
                        ? "💪 Self-corrected"
                        : e.corrected
                          ? "✓ Corrected"
                          : "✗ Not yet corrected"}
                    </Badge>
                    <Badge tone="neutral">{e.category}</Badge>
                    <Badge tone={e.severity === "FOUNDATIONAL" || e.severity === "IMPORTANT" ? "red" : "neutral"}>
                      {e.severity}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{e.description}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Alert tone="success">✅ No mistakes were detected in this session — great work!</Alert>
        )}

        {report.selfCorrections.length > 0 ? (
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">
              💪 Independent corrections
            </h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-600 dark:text-ink-300 space-y-1">
              {report.selfCorrections.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {report.hintInterpretation ? (
              <p className="mt-3 text-xs text-ink-500">{report.hintInterpretation}</p>
            ) : null}
          </Card>
        ) : null}

        <Card className="p-5">
          <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">
            🎯 What you understood in the end
          </h2>
          <p className="mt-2 text-sm text-ink-700 dark:text-ink-200 whitespace-pre-wrap">
            {report.finalUnderstanding}
          </p>
          <h3 className="mt-4 text-sm font-semibold text-ink-800 dark:text-ink-100">
            The complete answer
          </h3>
          <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300 whitespace-pre-wrap rounded-lg bg-ink-50 dark:bg-ink-800/60 p-3">
            {report.completeAnswer}
          </p>
        </Card>

        <div className="grid sm:grid-cols-2 gap-6">
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">🔑 Key takeaways</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-600 dark:text-ink-300 space-y-1">
              {report.keyTakeaways.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">🧩 Remaining gaps</h2>
            {report.remainingGaps.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">None identified — solid understanding!</p>
            ) : (
              <ul className="mt-2 list-disc pl-5 text-sm text-ink-600 dark:text-ink-300 space-y-1">
                {report.remainingGaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {report.nextLearning.length > 0 ? (
          <Card className="p-5">
            <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">
              🧭 What to learn next
            </h2>
            <ul className="mt-3 space-y-2">
              {report.nextLearning.map((r, i) => (
                <li key={i} className="rounded-lg bg-brand-50/60 dark:bg-brand-950/30 p-3">
                  <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">{r.title}</p>
                  <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">{r.reason}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/journey"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            See how this updated your Learning Journey →
          </Link>
        </div>
      </div>
    </Shell>
  );
}
