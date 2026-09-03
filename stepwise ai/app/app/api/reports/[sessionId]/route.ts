import { getCurrentUser } from "@/lib/auth";
import { ok, unauthorized, notFound, int, serverError } from "@/lib/apiHelpers";
import { db } from "@/lib/db";
import type { FinalReport } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/reports/:sessionId — ownership-verified report access (part 9).
export async function GET(_req: Request, { params }: { params: { sessionId: string } }) {
  try {
    const user = getCurrentUser();
    if (!user) return unauthorized();
    const sessionId = int(params.sessionId, -1);
    const row = db.get("reports", { session_id: sessionId, user_id: user.id });
    if (!row) return notFound();
    return ok({ report: JSON.parse(String(row.report_json)) as FinalReport, createdAt: String(row.created_at) });
  } catch {
    return serverError();
  }
}
