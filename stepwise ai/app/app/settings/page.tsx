"use client";

import React, { useEffect, useState } from "react";
import Shell, { MeData } from "@/components/Shell";
import { api } from "@/lib/client";
import { Button, Card, Input, Select, Alert, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const [profile, setProfile] = useState<MeData["profile"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [ageBand, setAgeBand] = useState("ADULT");
  const [educationLevel, setEducationLevel] = useState("");
  const [language, setLanguage] = useState("en");
  const [depth, setDepth] = useState("STANDARD");
  const [autonomy, setAutonomy] = useState("BALANCED");
  const [mode, setMode] = useState("BALANCED");
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    api<MeData>("/api/me")
      .then((d) => {
        const p = d.profile;
        if (!p) return;
        setProfile(p);
        setDisplayName(p.display_name ?? "");
        if (p.age_band) setAgeBand(p.age_band);
        setEducationLevel(p.education_level ?? "");
        if (p.preferred_language) setLanguage(p.preferred_language);
        if (p.explanation_depth) setDepth(p.explanation_depth);
        if (p.autonomy_level) setAutonomy(p.autonomy_level);
        if (p.learning_mode) setMode(p.learning_mode);
        if (p.theme) setTheme(p.theme);
      })
      .catch(() => setError("Could not load your settings."));
  }, []);

  // Apply theme instantly so the student sees the effect (doc 09).
  useEffect(() => {
    const root = document.documentElement;
    const dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
  }, [theme]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: {
          display_name: displayName,
          age_band: ageBand,
          education_level: educationLevel,
          preferred_language: language,
          explanation_depth: depth,
          autonomy_level: autonomy,
          learning_mode: mode,
          theme
        }
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell active="settings">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Settings</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          StepWise adapts how it teaches based on these preferences.
        </p>

        {!profile && !error ? (
          <div className="mt-8">
            <Spinner label="Loading settings..." />
          </div>
        ) : (
          <Card className="mt-6 p-6">
            {error ? (
              <div className="mb-4">
                <Alert tone="error">{error}</Alert>
              </div>
            ) : null}
            {saved ? (
              <div className="mb-4">
                <Alert tone="success">✓ Settings saved.</Alert>
              </div>
            ) : null}
            <form onSubmit={save} className="space-y-4">
              <Input
                label="Display name"
                name="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <div className="grid sm:grid-cols-2 gap-4">
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
                  label="School or level"
                  name="education_level"
                  value={educationLevel}
                  onChange={(e) => setEducationLevel(e.target.value)}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Explanation depth"
                  name="explanation_depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value)}
                >
                  <option value="QUICK">Quick</option>
                  <option value="STANDARD">Standard</option>
                  <option value="DETAILED">Detailed</option>
                  <option value="DEEP_DIVE">Deep dive</option>
                </Select>
                <Select
                  label="Guidance level"
                  name="autonomy_level"
                  value={autonomy}
                  onChange={(e) => setAutonomy(e.target.value)}
                >
                  <option value="GUIDED">Guided</option>
                  <option value="BALANCED">Balanced</option>
                  <option value="INDEPENDENT">Independent</option>
                </Select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Learning mode"
                  name="learning_mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="GUIDED">Guided</option>
                  <option value="BALANCED">Balanced</option>
                  <option value="CHALLENGE">Challenge</option>
                  <option value="EXPLAIN">Explain back</option>
                  <option value="REVIEW">Review</option>
                </Select>
                <Select
                  label="Theme"
                  name="theme"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">Follow system</option>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </Shell>
  );
}
