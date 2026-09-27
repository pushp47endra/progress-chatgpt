"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Square, RotateCcw, Timer as TimerIcon } from "lucide-react";
import { Card, Select } from "@/components/ui/Basics";
import { Button } from "@/components/ui/Button";

interface Subject {
  id: string;
  name: string;
}

type Status = "idle" | "running" | "paused";

/**
 * Study Timer.
 *
 * Persistence model: a StudySession row is only created when the timer is
 * actually STARTED (POST /api/study-sessions), and is only closed out (with
 * its final duration) when the timer is STOPPED (PATCH .../[id]). Pausing is
 * purely a client-side UI state - the elapsed seconds counted while paused
 * are simply not added to the displayed/saved duration, so the DB always
 * ends up with accurate "active" study time once Stop is pressed.
 */
export function StudyTimer() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [topicName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects((d.subjects || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === "running") {
      intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  async function handleStart() {
    setSaving(true);
    try {
      const res = await fetch("/api/study-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: subjectId || null, topicName: topicName || null }),
      });
      const data = await res.json();
      if (res.ok && data.session) {
        setSessionId(data.session.id);
        setElapsedSeconds(0);
        setStatus("running");
      }
    } finally {
      setSaving(false);
    }
  }

  function handlePause() {
    setStatus("paused");
  }

  function handleResume() {
    setStatus("running");
  }

  async function handleStop() {
    if (!sessionId) return;
    setSaving(true);
    try {
      await fetch(`/api/study-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: subjectId || null, topicName: topicName || null }),
      });
    } finally {
      setSaving(false);
      setStatus("idle");
      setSessionId(null);
      setElapsedSeconds(0);
    }
  }

  function handleReset() {
    // Reset only makes sense before a session has been saved (idle) or to
    // discard the current in-progress display; it never deletes a session
    // that has already been persisted via Start.
    setElapsedSeconds(0);
  }

  function formatClock(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <TimerIcon size={15} className="text-[var(--accent)]" />
        <h2 className="text-sm font-semibold">Study Timer</h2>
      </div>

      <div className="mb-3 text-center">
        <p className="font-mono text-3xl font-semibold tabular-nums">{formatClock(elapsedSeconds)}</p>
        {status !== "idle" && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {status === "running" ? "Running..." : "Paused"}
          </p>
        )}
      </div>

      <div className="mb-3 space-y-2">
        <Select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          disabled={status !== "idle"}
        >
          <option value="">No subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "idle" && (
          <Button size="sm" onClick={handleStart} loading={saving} className="flex-1">
            <Play size={14} /> Start
          </Button>
        )}
        {status === "running" && (
          <>
            <Button size="sm" variant="secondary" onClick={handlePause} className="flex-1">
              <Pause size={14} /> Pause
            </Button>
            <Button size="sm" variant="danger" onClick={handleStop} loading={saving} className="flex-1">
              <Square size={14} /> Stop
            </Button>
          </>
        )}
        {status === "paused" && (
          <>
            <Button size="sm" onClick={handleResume} className="flex-1">
              <Play size={14} /> Resume
            </Button>
            <Button size="sm" variant="danger" onClick={handleStop} loading={saving} className="flex-1">
              <Square size={14} /> Stop
            </Button>
          </>
        )}
        {status === "idle" && elapsedSeconds > 0 && (
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw size={14} />
          </Button>
        )}
      </div>
    </Card>
  );
}
