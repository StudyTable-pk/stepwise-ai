"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { DemoBanner, Spinner } from "@/components/ui";

// Shared app shell for authenticated pages: verifies the session, applies
// adaptive theme, shows the demo-mode banner and the primary navigation.
export interface MeData {
  user: { id: number; email: string };
  profile: {
    display_name: string;
    age_band: string;
    education_level: string;
    preferred_language: string;
    explanation_depth: string;
    autonomy_level: string;
    learning_mode: string;
    theme: string;
    onboarded: number;
  };
  ai: { provider: string; isDemo: boolean };
}

export default function Shell({
  children,
  active
}: {
  children: React.ReactNode;
  active: "home" | "journey" | "settings";
}) {
  const router = useRouter();
  const [me, setMe] = useState<MeData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<MeData>("/api/me")
      .then((data) => {
        if (!data.profile || !data.profile.onboarded) {
          router.replace("/onboarding");
          return;
        }
        setMe(data);
        applyTheme(data.profile.theme, data.profile.age_band);
      })
      .catch(() => {
        setFailed(true);
        router.replace("/login");
      });
  }, [router]);

  function applyTheme(theme: string, ageBand: string) {
    const root = document.documentElement;
    const dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.classList.toggle("band-early", ageBand === "EARLY_LEARNER");
    root.classList.toggle("band-young", ageBand === "YOUNG_LEARNER");
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
    } finally {
      router.replace("/login");
    }
  }

  if (failed) return null;
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Loading StepWise..." />
      </div>
    );
  }

  const navLink = (href: string, label: string, key: string) => (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active === key
          ? "bg-brand-600 text-white"
          : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <DemoBanner visible={me.ai.isDemo} />
      <header className="border-b border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/home" className="flex items-center gap-2 font-bold text-brand-700 dark:text-brand-300 text-lg whitespace-nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="StepWise logo" className="h-10 w-10 object-contain" />
            StepWise
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {navLink("/home", "Home", "home")}
            {navLink("/journey", "My Journey", "journey")}
            {navLink("/settings", "Settings", "settings")}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-ink-500">
              {me.profile.display_name || me.user.email}
            </span>
            <button
              onClick={logout}
              className="text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
