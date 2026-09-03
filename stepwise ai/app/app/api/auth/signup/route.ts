import { NextRequest } from "next/server";
import { registerUser, createSession, setSessionCookie } from "@/lib/auth";
import { ok, fail, str, serverError } from "@/lib/apiHelpers";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = str((body as Record<string, unknown>).email, "", 254).toLowerCase();
    const password = str((body as Record<string, unknown>).password, "", 128);

    if (!EMAIL_RE.test(email)) {
      return fail("INVALID_EMAIL", "Please enter a valid email address.");
    }
    if (password.length < 8) {
      return fail("WEAK_PASSWORD", "Password must be at least 8 characters.");
    }

    const existing = db.get("users", { email });
    if (existing) {
      return fail("EMAIL_TAKEN", "An account with this email already exists.");
    }

    const user = registerUser(email, password);
    const cookie = createSession(user.id);
    setSessionCookie(cookie);
    return ok({ id: user.id, email }, 201);
  } catch {
    return serverError();
  }
}
