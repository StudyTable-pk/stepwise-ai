"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, Input, Alert } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 board-surface">
      <Card className="w-full max-w-md p-8 animate-fade-in">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="StepWise logo" className="h-24 w-24 mx-auto object-contain" />
          <div className="mt-3 text-2xl font-bold text-brand-700 dark:text-brand-300">StepWise</div>
          <p className="mt-2 text-sm text-ink-500">
            Learn step by step. The Board is your classroom.
          </p>
        </div>
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-500">
          New to StepWise?{" "}
          <Link href="/signup" className="text-brand-700 dark:text-brand-300 font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}
