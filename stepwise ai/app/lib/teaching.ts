// ============================================================================
// Teaching Engine helpers (doc 05).
// - Feedback label taxonomy: always icon + text, never color alone.
// - Hint escalation ladder and intervention levels.
// ============================================================================
import type { EvaluationStatus, FeedbackLabel, HintLevel, LearningMode } from "@/lib/types";

export const FEEDBACK_META: Record<FeedbackLabel, { icon: string; label: string }> = {
  CORRECT_UNDERSTANDING: { icon: "🟢", label: "Correct understanding" },
  PARTIALLY_CORRECT: { icon: "🟡", label: "Partially correct" },
  MISSING_IDEA: { icon: "🔵", label: "Missing idea" },
  CONCEPT_ERROR: { icon: "🔴", label: "Concept error" },
  THINK_ABOUT_THIS: { icon: "🟣", label: "Think about this" },
  CHECK_THIS_STEP: { icon: "🟠", label: "Check this step" },
  AI_UNCERTAIN: { icon: "⚪", label: "AI uncertain" }
};

export const HINT_LEVEL_TITLES: Record<HintLevel, string> = {
  1: "Gentle nudge",
  2: "Direction",
  3: "Specific hint",
  4: "Example",
  5: "Partial structure",
  6: "Nearly there",
  7: "Worked explanation"
};

/** Learning modes tune escalation thresholds — same core, different pacing. */
const MODE_THRESHOLDS: Record<LearningMode, { escalateAfterFailedChecks: number; autoInterveneLevel: number }> = {
  GUIDED: { escalateAfterFailedChecks: 1, autoInterveneLevel: 2 },
  BALANCED: { escalateAfterFailedChecks: 2, autoInterveneLevel: 3 },
  CHALLENGE: { escalateAfterFailedChecks: 3, autoInterveneLevel: 4 },
  EXPLAIN: { escalateAfterFailedChecks: 1, autoInterveneLevel: 2 },
  REVIEW: { escalateAfterFailedChecks: 2, autoInterveneLevel: 2 }
};

export function thresholdsFor(mode: LearningMode) {
  return MODE_THRESHOLDS[mode] ?? MODE_THRESHOLDS.BALANCED;
}

/** Next hint level: escalate one step at a time, capped at 7. */
export function nextHintLevel(previous: HintLevel[]): HintLevel {
  const max = previous.reduce((m, l) => Math.max(m, l), 0);
  return (Math.min(max + 1, 7) || 1) as HintLevel;
}

/** Map an evaluation status to the session state machine transition. */
export function stateAfterEvaluation(status: EvaluationStatus):
  | "CORRECT"
  | "PARTIAL"
  | "ERROR"
  | "UNCERTAIN" {
  switch (status) {
    case "correct":
      return "CORRECT";
    case "partial":
      return "PARTIAL";
    case "error":
      return "ERROR";
    default:
      return "UNCERTAIN";
  }
}

/**
 * Intervention policy (doc 04 levels 0–8, doc 05 cases):
 * - clearly wrong  -> intervene (>=4)
 * - partial        -> encourage + ask first (1–3)
 * - uncertain      -> clarify, never false certainty (0)
 */
export function decideIntervention(status: EvaluationStatus, providerLevel: number): number {
  if (status === "correct") return 0;
  if (status === "uncertain") return 0;
  if (status === "partial") return Math.min(Math.max(providerLevel, 1), 3);
  return Math.min(Math.max(providerLevel, 4), 8);
}
