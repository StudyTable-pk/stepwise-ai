// ============================================================================
// API helpers — consistent response envelope (spec part 89), safe errors
// (part 113), and authorization-first access patterns (part 9).
// ============================================================================
import { NextResponse } from "next/server";
import type { ApiEnvelope } from "@/lib/types";

export function ok<T>(data: T, status = 200): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

export function fail(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json(
    { data: null, error: { code, message } },
    { status }
  );
}

export function unauthorized(): NextResponse {
  return fail("UNAUTHORIZED", "Please sign in to continue.", 401);
}

export function notFound(): NextResponse {
  return fail("NOT_FOUND", "We couldn't find that.", 404);
}

export function serverError(): NextResponse {
  // Never leak stack traces (part 89).
  return fail("SERVER_ERROR", "Something went wrong. Please try again.", 500);
}

/** Clamp and trim an untrusted string input. */
export function str(value: unknown, fallback = "", max = 4000): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max);
}

export function int(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
