import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, serverError } from "@/lib/apiHelpers";
import { getJourney } from "@/lib/journey";

export const runtime = "nodejs";

// GET /api/journey — the student's long-term learning map (doc 07).
export async function GET() {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    return ok({ journey: getJourney(user.id) });
  } catch {
    return serverError();
  }
}
