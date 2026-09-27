"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, EmptyState } from "@/components/ui/Basics";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp, Target, AlertTriangle } from "lucide-react";

interface AnalyticsData {
  studyTimeByDay: { date: string; minutes: number }[];
  questionsByDay: { date: string; attempted: number; solved: number }[];
  subjectCompletion: { subject: string; completionPct: number }[];
  overallAccuracy: number;
  weakSubjects: { subject: string; mistakes: number }[];
}

const CHART_GRID = "var(--border)";
const CHART_TEXT = "var(--muted)";
const CHART_ACCENT = "var(--accent)";
const CHART_SUCCESS = "var(--success)";
const CHART_DANGER = "var(--danger)";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <AppShell title="Analytics">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <EmptyState message="Loading analytics..." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics">
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-[var(--muted)]">Last 30 days of study activity and progress.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <Target size={14} />
              <p className="text-xs uppercase tracking-wide">Overall Accuracy</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{data.overallAccuracy}%</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <TrendingUp size={14} />
              <p className="text-xs uppercase tracking-wide">Active Days (30d)</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{data.studyTimeByDay.filter((d) => d.minutes > 0).length}</p>
          </Card>
          <Card>
            <div className="flex items-center gap-2 text-[var(--muted)]">
              <AlertTriangle size={14} />
              <p className="text-xs uppercase tracking-wide">Weakest Subject</p>
            </div>
            <p className="mt-2 text-2xl font-semibold">{data.weakSubjects[0]?.subject || "-"}</p>
          </Card>
        </div>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Study Time (minutes/day)</h2>
          {data.studyTimeByDay.length === 0 ? (
            <EmptyState message="No study sessions recorded yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.studyTimeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="date" stroke={CHART_TEXT} fontSize={11} />
                  <YAxis stroke={CHART_TEXT} fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: `1px solid ${CHART_GRID}`, fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="minutes" stroke={CHART_ACCENT} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold">Questions Attempted vs Solved</h2>
          {data.questionsByDay.length === 0 ? (
            <EmptyState message="No question attempts recorded yet." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.questionsByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis dataKey="date" stroke={CHART_TEXT} fontSize={11} />
                  <YAxis stroke={CHART_TEXT} fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: `1px solid ${CHART_GRID}`, fontSize: 12 }}
                  />
                  <Bar dataKey="attempted" fill={CHART_ACCENT} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="solved" fill={CHART_SUCCESS} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Subject Completion</h2>
            {data.subjectCompletion.length === 0 ? (
              <EmptyState message="No subjects yet." />
            ) : (
              <div className="space-y-2">
                {data.subjectCompletion.map((s) => (
                  <div key={s.subject}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{s.subject}</span>
                      <span className="text-[var(--muted)]">{s.completionPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[var(--surface2)]">
                      <div
                        className="h-1.5 rounded-full bg-[var(--accent)]"
                        style={{ width: `${s.completionPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold">Weak Subjects (by mistakes)</h2>
            {data.weakSubjects.length === 0 ? (
              <EmptyState message="No mistakes logged yet." />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weakSubjects} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis type="number" stroke={CHART_TEXT} fontSize={11} allowDecimals={false} />
                    <YAxis dataKey="subject" type="category" stroke={CHART_TEXT} fontSize={11} width={120} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: `1px solid ${CHART_GRID}`, fontSize: 12 }}
                    />
                    <Bar dataKey="mistakes" fill={CHART_DANGER} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
