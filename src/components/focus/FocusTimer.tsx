"use client";

import { useEffect, useMemo, useState } from "react";
import { useFocusTimer } from "@/hooks/useFocusTimer";

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

type TimerMode = "stopwatch" | "pomodoro";
type PomodoroPhase = "focus" | "break";

export function FocusTimer() {
  const timer = useFocusTimer();
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [remainingSec, setRemainingSec] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroOwnsSession, setPomodoroOwnsSession] = useState(false);

  const phaseDurationSec = useMemo(() => {
    return (phase === "focus" ? focusMinutes : breakMinutes) * 60;
  }, [phase, focusMinutes, breakMinutes]);

  useEffect(() => {
    if (mode !== "pomodoro") {
      setPomodoroRunning(false);
      if (pomodoroOwnsSession && timer.active) {
        void timer.stop();
      }
      setPomodoroOwnsSession(false);
      return;
    }

    if (pomodoroRunning) return;
    setRemainingSec(phaseDurationSec);
  }, [mode, pomodoroRunning, phaseDurationSec, pomodoroOwnsSession, timer.active, timer.stop]);

  useEffect(() => {
    if (mode !== "pomodoro" || !pomodoroRunning) return;

    const intervalId = window.setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [mode, pomodoroRunning]);

  useEffect(() => {
    if (mode !== "pomodoro" || !pomodoroRunning || remainingSec > 0) return;

    setPomodoroRunning(false);

    if (phase === "focus") {
      if (pomodoroOwnsSession && timer.active) {
        void timer.stop();
      }
      setPomodoroOwnsSession(false);
      setPhase("break");
      setRemainingSec(breakMinutes * 60);
      return;
    }

    setPhase("focus");
    setRemainingSec(focusMinutes * 60);
  }, [
    mode,
    pomodoroRunning,
    remainingSec,
    phase,
    focusMinutes,
    breakMinutes,
    pomodoroOwnsSession,
    timer.active,
    timer.stop,
  ]);

  const startPomodoro = () => {
    if (phase === "focus" && !timer.active) {
      void timer.start();
      setPomodoroOwnsSession(true);
    }
    setPomodoroRunning(true);
  };

  const pausePomodoro = () => {
    if (phase === "focus" && pomodoroOwnsSession && timer.active) {
      void timer.stop();
    }
    setPomodoroOwnsSession(false);
    setPomodoroRunning(false);
  };

  const resetPomodoro = () => {
    if (phase === "focus" && pomodoroOwnsSession && timer.active) {
      void timer.stop();
    }
    setPomodoroOwnsSession(false);
    setPomodoroRunning(false);
    setRemainingSec(phaseDurationSec);
  };

  return (
    <div className="mb-4 rounded border border-theme surface p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase text-muted">Focus timer</p>
        <div className="inline-flex overflow-hidden rounded border border-theme">
          <button
            type="button"
            className={mode === "stopwatch" ? "bg-accent px-2 py-1 text-xs text-white" : "surface px-2 py-1 text-xs"}
            onClick={() => setMode("stopwatch")}
          >
            Stopwatch
          </button>
          <button
            type="button"
            className={mode === "pomodoro" ? "bg-accent px-2 py-1 text-xs text-white" : "surface px-2 py-1 text-xs"}
            onClick={() => setMode("pomodoro")}
          >
            Pomodoro
          </button>
        </div>
      </div>

      {mode === "stopwatch" ? (
        <div className="flex items-center justify-between">
          <p className="font-mono text-2xl">{formatDuration(timer.elapsedSec)}</p>
          {timer.active ? (
            <button className="rounded border border-theme px-3 py-1" onClick={() => void timer.stop()}>
              Stop
            </button>
          ) : (
            <button className="rounded border border-theme px-3 py-1" onClick={() => void timer.start()}>
              Start
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">
              {phase === "focus" ? "Focus session" : "Break"}
            </p>
            <p className="font-mono text-2xl">{formatDuration(remainingSec)}</p>
          </div>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              Focus
              <select
                className="rounded border border-theme surface px-2 py-1"
                value={focusMinutes}
                onChange={(event) => setFocusMinutes(Number(event.target.value))}
              >
                <option value={15}>15m</option>
                <option value={25}>25m</option>
                <option value={45}>45m</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              Break
              <select
                className="rounded border border-theme surface px-2 py-1"
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(Number(event.target.value))}
              >
                <option value={5}>5m</option>
                <option value={10}>10m</option>
                <option value={15}>15m</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            {pomodoroRunning ? (
              <button className="rounded border border-theme px-3 py-1" onClick={pausePomodoro}>
                Pause
              </button>
            ) : (
              <button className="rounded border border-theme px-3 py-1" onClick={startPomodoro}>
                Start
              </button>
            )}
            <button className="rounded border border-theme px-3 py-1" onClick={resetPomodoro}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
