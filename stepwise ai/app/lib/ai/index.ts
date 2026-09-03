// ============================================================================
// AI provider factory — the single place the rest of the application obtains
// the AI brain. The app never talks to a specific vendor SDK directly
// (spec part 4). Swapping models/providers means changing configuration only.
// ============================================================================
import type { AIProvider } from "@/lib/types";
import { demoProvider } from "./demoProvider";
import { openaiProvider } from "./openaiProvider";

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;
  const choice = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (choice === "openai" && process.env.OPENAI_API_KEY) {
    cached = openaiProvider;
  } else {
    cached = demoProvider;
  }
  return cached;
}

/** True when the active provider is a development/demo fallback. */
export function isDemoMode(): boolean {
  return getAIProvider().info.isDemo;
}
