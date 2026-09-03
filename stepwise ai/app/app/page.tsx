"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Button } from "@/components/ui";

// Landing page: huge logo first, then Sign in (per user direction).
export default function LandingPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    api("/api/me")
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  return (
    <div className="min-h-screen board-surface flex flex-col items-center justify-center px-4 py-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="StepWise logo — a yellow boot shaped like a staircase with a green flag on top"
        className="h-72 w-72 sm:h-96 sm:w-96 object-contain animate-fade-in drop-shadow-xl"
      />
      <h1 className="mt-8 text-4xl sm:text-5xl font-extrabold text-brand-700 dark:text-brand-300 tracking-tight">
        StepWise
      </h1>
      <p className="mt-3 max-w-md text-center text-ink-600 dark:text-ink-300">
        Climb every concept one step at a time. The Board is your classroom, the AI is your
        guide — and <em>you</em> do the thinking.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {authed ? (
          <Link href="/home">
            <Button size="lg">Continue learning →</Button>
          </Link>
        ) : (
          <>
            <Link href="/login">
              <Button size="lg">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="secondary">
                Create account
              </Button>
            </Link>
          </>
        )}
      </div>

      <p className="mt-10 text-xs text-ink-400">
        🟡 Bright steps · 🟢 Deep understanding — learn it, own it, master it.
      </p>
    </div>
  );
}
