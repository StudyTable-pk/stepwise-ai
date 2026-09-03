// ============================================================================
// Authentication — Argon2id-class password hashing via Node's scrypt,
// httpOnly signed session cookies. Passwords are never stored in plaintext.
// ============================================================================
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { cookies } from "next/headers";
import { db, nowIso } from "@/lib/db";

const COOKIE_NAME = "stepwise_session";
const SESSION_DAYS = 30;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.includes("change-me")) {
    // Fail safely in production; in development derive a deterministic key.
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set to a long random value.");
    }
    return "dev-only-insecure-secret";
  }
  return secret;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function sign(token: string): string {
  return createHmac("sha256", getSecret()).update(token).digest("base64url");
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.insert("auth_sessions", { token, user_id: userId, expires_at: expires, created_at: nowIso() });
  return `${token}.${sign(token)}`;
}

export function destroySession(cookieValue: string | undefined): void {
  if (!cookieValue) return;
  const token = cookieValue.split(".")[0];
  if (token) db.remove("auth_sessions", { token });
}

export function setSessionCookie(value: string): void {
  cookies().set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400
  });
}

export function clearSessionCookie(): void {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export interface AuthUser {
  id: number;
  email: string;
}

/** Verify the session cookie and return the authenticated user, or null. */
export function getCurrentUser(): AuthUser | null {
  try {
    const value = cookies().get(COOKIE_NAME)?.value;
    if (!value) return null;
    const [token, sig] = value.split(".");
    if (!token || !sig) return null;
    const expected = sign(token);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const sessionRow = db.get("auth_sessions", { token });
    if (!sessionRow) return null;
    if (new Date(String(sessionRow.expires_at)).getTime() < Date.now()) {
      db.remove("auth_sessions", { token });
      return null;
    }
    const userRow = db.get("users", { id: Number(sessionRow.user_id) });
    if (!userRow) return null;
    return { id: Number(userRow.id), email: String(userRow.email) };
  } catch {
    return null;
  }
}

export function registerUser(email: string, password: string): { id: number } {
  return db.transaction(() => {
    const result = db.insert("users", {
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      created_at: nowIso(),
      last_login_at: null
    });
    db.insert("profiles", {
      user_id: result.lastInsertRowid,
      display_name: "",
      age_band: "ADULT",
      education_level: "",
      preferred_language: "en",
      explanation_depth: "STANDARD",
      autonomy_level: "BALANCED",
      learning_mode: "BALANCED",
      theme: "light",
      onboarded: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    return { id: result.lastInsertRowid };
  });
}

export function authenticateUser(email: string, password: string): { id: number } | null {
  const row = db.get("users", { email: email.toLowerCase() });
  if (!row) return null;
  if (!verifyPassword(password, String(row.password_hash))) return null;
  db.update("users", { id: Number(row.id) }, { last_login_at: nowIso() });
  return { id: Number(row.id) };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
