"use client";

import React from "react";

// ============================================================================
// Design system primitives (doc 10 part 62): one consistent set of buttons,
// cards, inputs, badges, dialogs and status indicators for the whole app.
// ============================================================================

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-sm px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-3"
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-sun-400 text-ink-900 hover:bg-sun-500 shadow-card",
    secondary:
      "bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-100 dark:border-ink-700 dark:hover:bg-ink-800",
    ghost: "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800",
    danger: "bg-red-600 text-white hover:bg-red-700"
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({
  className = "",
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-800 rounded-xl shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Input({
  label,
  hint,
  className = "",
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1.5">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 px-3.5 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400 focus:border-brand-500 ${className}`}
        {...props}
      />
      {hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Textarea({
  label,
  className = "",
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1.5">
          {label}
        </label>
      ) : null}
      <textarea
        id={inputId}
        className={`w-full rounded-lg border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 px-3.5 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400 focus:border-brand-500 ${className}`}
        {...props}
      />
    </div>
  );
}

export function Select({
  label,
  className = "",
  id,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const inputId = id ?? props.name;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink-700 dark:text-ink-300 mb-1.5">
          {label}
        </label>
      ) : null}
      <select
        id={inputId}
        className={`w-full rounded-lg border border-ink-300 dark:border-ink-700 bg-white dark:bg-ink-900 px-3.5 py-2.5 text-sm text-ink-900 dark:text-ink-100 focus:border-brand-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    purple: "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300"
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-500" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      {label ?? "Working..."}
    </div>
  );
}

export function Alert({
  tone = "info",
  children
}: {
  tone?: "info" | "error" | "success" | "warning";
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-900 dark:text-sky-200",
    error: "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200",
    success:
      "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200",
    warning:
      "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200"
  };
  return <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Always icon + text for status — never color alone (doc 05). */
export const FEEDBACK_META: Record<string, { icon: string; label: string }> = {
  CORRECT_UNDERSTANDING: { icon: "🟢", label: "Correct understanding" },
  PARTIALLY_CORRECT: { icon: "🟡", label: "Partially correct" },
  MISSING_IDEA: { icon: "🔵", label: "Missing idea" },
  CONCEPT_ERROR: { icon: "🔴", label: "Concept error" },
  THINK_ABOUT_THIS: { icon: "🟣", label: "Think about this" },
  CHECK_THIS_STEP: { icon: "🟠", label: "Check this step" },
  AI_UNCERTAIN: { icon: "⚪", label: "AI uncertain" }
};

export function EmptyState({
  icon,
  title,
  message,
  action
}: {
  icon?: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6">
      {icon ? <div className="text-4xl mb-3" aria-hidden>{icon}</div> : null}
      <h3 className="text-lg font-semibold text-ink-800 dark:text-ink-200">{title}</h3>
      <p className="mt-1.5 text-sm text-ink-500 max-w-sm mx-auto">{message}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function DemoBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="bg-amber-100 dark:bg-amber-900/60 border-b border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-xs px-4 py-1.5 text-center">
      ⚠️ Development mode: using the Offline Demo Tutor (heuristic). Connect an AI provider
      (AI_PROVIDER=openai) for real analysis — demo results are never presented as real AI.
    </div>
  );
}
