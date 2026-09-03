import { NextRequest } from "next/server";
import { authenticateUser, createSession, setSessionCookie } from "@/lib/auth";
import { ok, fail, str, serverError } from "@/lib/apiHelpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = str((body as Record<string, unknown>).email, "", 254).toLowerCase();
    const password = str((body as Record<string, unknown>).password, "", 128);

    if (!email || !password) {
      return fail("MISSING_CREDENTIALS", "Please enter your email and password.");
    }

    // Constant-ish messaging: never reveal whether the email exists.
    const user = authenticateUser(email, password);
    if (!user) {
      return fail("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
    }

    const cookie = createSession(user.id);
    setSessionCookie(cookie);
    return ok({ id: user.id, email });
  } catch {
    return serverError();
  }
}
