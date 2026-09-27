"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, Select, Badge, Checkbox } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, XCircle, Download, User, SlidersHorizontal, Palette, Bot } from "lucide-react";

interface SettingsData {
  settings: {
    dailyTargetMinutes: number;
    preferredLanguage: string;
    preferredDifficulty: string;
    theme: string;
    debugMode: boolean;
    timezone: string;
  };
  account: { username: string; createdAt: string };
  aiStatus: { optimizerConfigured: boolean; lunaConfigured: boolean };
  targetDate: string;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  async function updateSettings(patch: Partial<SettingsData["settings"]>) {
    if (!data) return;
    const next = { ...data.settings, ...patch };
    setData({ ...data, settings: next });
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setSavedAt(Date.now());
      // Theme changes take effect immediately without a reload.
      if (patch.theme) {
        document.body.classList.remove("theme-dark", "theme-light");
        document.body.classList.add(`theme-${patch.theme}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    window.location.href = "/api/settings/export";
  }

  if (!data) {
    return (
      <AppShell title="Settings">
        <div className="mx-auto max-w-3xl p-4 md:p-8" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-[var(--muted)]">Account, study preferences and AI configuration.</p>
          </div>
          {saving ? (
            <span className="text-xs text-[var(--muted)]">Saving...</span>
          ) : savedAt ? (
            <span className="text-xs text-[var(--success)]">Saved</span>
          ) : null}
        </div>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <User size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Account</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Username</p>
              <p className="font-medium">{data.account.username}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Member since</p>
              <p className="font-medium">
                {new Date(data.account.createdAt).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Target exam date</p>
              <p className="font-medium">
                {new Date(data.targetDate).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Timezone</p>
              <p className="font-medium">{data.settings.timezone}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Study Preferences</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-[var(--muted)]">Daily study target (minutes)</p>
              <Select
                value={String(data.settings.dailyTargetMinutes)}
                onChange={(e) => updateSettings({ dailyTargetMinutes: Number(e.target.value) })}
              >
                {[30, 60, 90, 120, 150, 180, 240, 300].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs text-[var(--muted)]">Preferred language for AI answers</p>
              <Select
                value={data.settings.preferredLanguage}
                onChange={(e) => updateSettings({ preferredLanguage: e.target.value })}
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
                <option value="hinglish">Hinglish</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs text-[var(--muted)]">Preferred question difficulty</p>
              <Select
                value={data.settings.preferredDifficulty}
                onChange={(e) => updateSettings({ preferredDifficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Palette size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">Appearance</h2>
          </div>
          <div className="flex items-center gap-3">
            <Select value={data.settings.theme} onChange={(e) => updateSettings({ theme: e.target.value })}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </Select>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Checkbox
              checked={data.settings.debugMode}
              onChange={() => updateSettings({ debugMode: !data.settings.debugMode })}
            />
            <span className="text-sm">Enable AI debug mode by default in chat</span>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Bot size={15} className="text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">AI Configuration Status</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span>Optimizer AI</span>
              {data.aiStatus.optimizerConfigured ? (
                <Badge tone="completed">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={12} /> Configured
                  </span>
                </Badge>
              ) : (
                <Badge tone="missed">
                  <span className="flex items-center gap-1">
                    <XCircle size={12} /> Not configured
                  </span>
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
              <span>GPT-6 Luna (Amazon Bedrock)</span>
              {data.aiStatus.lunaConfigured ? (
                <Badge tone="completed">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 size={12} /> Configured
                  </span>
                </Badge>
              ) : (
                <Badge tone="missed">
                  <span className="flex items-center gap-1">
                    <XCircle size={12} /> Not configured
                  </span>
                </Badge>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Configure these via environment variables (OPTIMIZER_API_KEY / OPTIMIZER_API_URL /
            OPTIMIZER_MODEL and LUNA_API_KEY / LUNA_API_URL / LUNA_MODEL_ID / AWS_REGION). Keys are
            never exposed to the browser.
          </p>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Data Management</h2>
          <p className="mb-3 text-sm text-[var(--muted)]">
            Export all your data (chats, subjects, topics, questions, mistakes, notes, study sessions
            and daily progress) as a single JSON file.
          </p>
          <Button variant="secondary" onClick={handleExport}>
            <Download size={14} /> Export my data
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
