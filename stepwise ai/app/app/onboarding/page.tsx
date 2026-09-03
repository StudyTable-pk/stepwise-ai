"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, Alert, Spinner } from "@/components/ui";

// Onboarding (doc 10 part 110): quick, friendly setup before the first
// session. Never blocks learning with a long form.
export default function OnboardingPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [ageBand, setAgeBand] = useState("ADULT");
  const [educationLevel, setEducationLevel] = useState("");
  const [depth, setDepth] = useState("STANDARD");
  const [autonomy, setAutonomy] = useState("BALANCED");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Verify auth; prefill existing profile values.
    api<{ profile: Record<string, string> | null }>("/api/me")
      .then((data) => {
        const p = data.profile;
        if (p) {
          setDisplayName(p.display_name ?? "");
          if (p.age_band) setAgeBand(p.age_band);
          setEducationLevel(p.education_level ?? "");
          if (p.explanation_depth) setDepth(p.explanation_depth);
          if (p.autonomy_level) setAutonomy(p.autonomy_level);
        }
        setLoaded(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: {
          display_name: displayName,
          age_band: ageBand,
          education_level: educationLevel,
          explanation_depth: depth,
          autonomy_level: autonomy,
          onboarded: true
        }
      });
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your setup.");
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner label="Setting things up..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 board-surface">
      <Card className="w-full max-w-lg p-8 animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold text-brand-700 dark:text-brand-300">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
                      Welcome to StepWise
                    </div>
          <p className="mt-2 text-sm text-ink-500">
            A few quick questions so StepWise can teach you in the right way. You can change
            these any time in Settings.
          </p>
        </div>
        {error ? (
          <div className="mb-4">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="What should StepWise call you?"
            name="display_name"
            placeholder="Your name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Select
            label="Age group"
            name="age_band"
            value={ageBand}
            onChange={(e) => setAgeBand(e.target.value)}
          >
            <option value="EARLY_LEARNER">Early learner (5–8)</option>
            <option value="YOUNG_LEARNER">Young learner (9–12)</option>
            <option value="EARLY_TEEN">Early teen (13–15)</option>
            <option value="TEEN">Teen (16–18)</option>
            <option value="ADULT">Adult (18+)</option>
          </Select>
          <Input
            label="School or level (optional)"
            name="education_level"
            placeholder="e.g. Grade 7, High school, University"
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
          />
          <Select
            label="How detailed should explanations be?"
            name="explanation_depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
          >
            <option value="QUICK">Quick — short and to the point</option>
            <option value="STANDARD">Standard — a balanced amount</option>
            <option value="DETAILED">Detailed — explain thoroughly</option>
            <option value="DEEP_DIVE">Deep dive — cover every angle</option>
          </Select>
          <Select
            label="How much guidance do you want?"
            name="autonomy_level"
            value={autonomy}
            onChange={(e) => setAutonomy(e.target.value)}
          >
            <option value="GUIDED">Guided — walk me through each step</option>
            <option value="BALANCED">Balanced — help when I need it</option>
            <option value="INDEPENDENT">Independent — let me try first</option>
          </Select>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Saving..." : "Start learning →"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
