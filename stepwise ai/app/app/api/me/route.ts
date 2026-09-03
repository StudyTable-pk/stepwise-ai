import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, nowIso } from "@/lib/db";
import { ok, unauthorized, fail, str, serverError } from "@/lib/apiHelpers";
import { isDemoMode, getAIProvider } from "@/lib/ai";
import type { AgeBand, AutonomyLevel, ExplanationDepth, LearningMode, Theme } from "@/lib/types";

export const runtime = "nodejs";

const AGE_BANDS = new Set(["EARLY_LEARNER", "YOUNG_LEARNER", "EARLY_TEEN", "TEEN", "ADULT"]);
const DEPTHS = new Set(["QUICK", "STANDARD", "DETAILED", "DEEP_DIVE"]);
const AUTONOMY = new Set(["GUIDED", "BALANCED", "INDEPENDENT"]);
const MODES = new Set(["GUIDED", "BALANCED", "CHALLENGE", "EXPLAIN", "REVIEW"]);
const THEMES = new Set(["light", "dark", "system"]);

function readProfile(userId: number) {
  return db.get("profiles", { user_id: userId }) as Record<string, unknown> | null;
}

export async function GET() {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const profile = readProfile(user.id);
    return ok({
      user,
      profile,
      ai: { provider: getAIProvider().info.displayName, isDemo: isDemoMode() }
    });
  } catch {
    return serverError();
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const sets: Record<string, unknown> = {};

    if (body.display_name !== undefined) {
      sets.display_name = str(body.display_name, "", 80);
    }
    if (body.age_band !== undefined && AGE_BANDS.has(String(body.age_band))) {
      sets.age_band = String(body.age_band) as AgeBand;
    }
    if (body.education_level !== undefined) {
      sets.education_level = str(body.education_level, "", 80);
    }
    if (body.preferred_language !== undefined) {
      sets.preferred_language = str(body.preferred_language, "en", 10);
    }
    if (body.explanation_depth !== undefined && DEPTHS.has(String(body.explanation_depth))) {
      sets.explanation_depth = String(body.explanation_depth) as ExplanationDepth;
    }
    if (body.autonomy_level !== undefined && AUTONOMY.has(String(body.autonomy_level))) {
      sets.autonomy_level = String(body.autonomy_level) as AutonomyLevel;
    }
    if (body.learning_mode !== undefined && MODES.has(String(body.learning_mode))) {
      sets.learning_mode = String(body.learning_mode) as LearningMode;
    }
    if (body.theme !== undefined && THEMES.has(String(body.theme))) {
      sets.theme = String(body.theme) as Theme;
    }
    if (body.onboarded === true) {
      sets.onboarded = 1;
    }

    if (Object.keys(sets).length === 0) return fail("NO_CHANGES", "Nothing to update.");
    sets.updated_at = nowIso();
    db.update("profiles", { user_id: user.id }, sets);
    return ok({ profile: readProfile(user.id) });
  } catch {
    return serverError();
  }
}
