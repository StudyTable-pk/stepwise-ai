import { cookies } from "next/headers";
import { destroySession, clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";
import { ok } from "@/lib/apiHelpers";

export const runtime = "nodejs";

export async function POST() {
  destroySession(cookies().get(SESSION_COOKIE_NAME)?.value);
  clearSessionCookie();
  return ok({ signedOut: true });
}
