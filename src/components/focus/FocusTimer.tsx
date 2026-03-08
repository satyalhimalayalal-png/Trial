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

interface PomodoroConfig {
  focusMinutes: number;
  breakMinutes: number;
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  breakMinutes: 5,
};

function playPhaseEndRingtone() {
  if (typeof window === "undefined") return;
  const AudioContextImpl = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextImpl) return;

  try {
    const context = new AudioContextImpl();
    const now = context.currentTime;
    const pattern = [0, 0.22, 0.44, 0.66];
    const freqs = [880, 1046, 1318, 1567];

    pattern.forEach((offset, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "triangle";
      osc.frequency.value = freqs[index % freqs.length];

      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.17);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.19);
    });

    window.setTimeout(() => {
      void context.close();
    }, 1400);
  } catch {
    // no-op: silently ignore audio playback failures
  }
}

export function FocusTimer() {
  const timer = useFocusTimer();
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [draftFocus, setDraftFocus] = useState(DEFAULT_CONFIG.focusMinutes);
  const [draftBreak, setDraftBreak] = useState(DEFAULT_CONFIG.breakMinutes);
  const [remainingSec, setRemainingSec] = useState(DEFAULT_CONFIG.focusMinutes * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroOwnsSession, setPomodoroOwnsSession] = useState(false);

  const phaseDurationSec = useMemo(() => {
    return (phase === "focus" ? config.focusMinutes : config.breakMinutes) * 60;
  }, [phase, config.focusMinutes, config.breakMinutes]);
  const phaseProgress = useMemo(() => {
    if (phaseDurationSec <= 0) return 0;
    return Math.max(0, Math.min(1, (phaseDurationSec - remainingSec) / phaseDurationSec));
  }, [phaseDurationSec, remainingSec]);
  const ringFillColor = phase === "focus" ? "#cf2d2d" : "#2f72ea";
  const ringTrackColor = phase === "focus" ? "#4c1f1f" : "#1f3457";

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
    playPhaseEndRingtone();

    if (phase === "focus") {
      if (pomodoroOwnsSession && timer.active) {
        void timer.stop();
      }
      setPomodoroOwnsSession(false);
      setPhase("break");
      setRemainingSec(config.breakMinutes * 60);
      return;
    }

    setPhase("focus");
    setRemainingSec(config.focusMinutes * 60);
  }, [
    mode,
    pomodoroRunning,
    remainingSec,
    phase,
    config.focusMinutes,
    config.breakMinutes,
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

  const jumpToPhase = (nextPhase: PomodoroPhase) => {
    if (nextPhase === "break" && pomodoroOwnsSession && timer.active) {
      void timer.stop();
      setPomodoroOwnsSession(false);
    }

    if (nextPhase === "focus" && !timer.active && pomodoroRunning) {
      void timer.start();
      setPomodoroOwnsSession(true);
    }

    setPhase(nextPhase);
    setRemainingSec((nextPhase === "focus" ? config.focusMinutes : config.breakMinutes) * 60);
  };

  const applyConfig = () => {
    const nextFocus = Math.max(1, Math.min(180, Math.floor(draftFocus || 0)));
    const nextBreak = Math.max(1, Math.min(120, Math.floor(draftBreak || 0)));
    setConfig({ focusMinutes: nextFocus, breakMinutes: nextBreak });
    setRemainingSec((phase === "focus" ? nextFocus : nextBreak) * 60);
  };

  const applyPreset = (focusMinutes: number, breakMinutes: number) => {
    setDraftFocus(focusMinutes);
    setDraftBreak(breakMinutes);
    setConfig({ focusMinutes, breakMinutes });
    setRemainingSec((phase === "focus" ? focusMinutes : breakMinutes) * 60);
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
        <div className="space-y-3">
          <div className="flex justify-center">
            <div
              className={`pomodoro-ring ${pomodoroRunning ? "pomodoro-ring-running" : ""}`}
              style={{
                background: `conic-gradient(${ringFillColor} ${Math.round(phaseProgress * 360)}deg, ${ringTrackColor} 0deg)`,
              }}
            >
              <div className="pomodoro-ring-core">
                <p className="text-xs uppercase tracking-[0.1em] text-muted">
                  {phase === "focus" ? "Work" : "Break"}
                </p>
                <p className="font-mono text-3xl">{formatDuration(remainingSec)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
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
          <div className="flex items-center justify-center gap-2">
            <button
              className="rounded border border-theme px-3 py-1 text-sm"
              onClick={() => jumpToPhase(phase === "focus" ? "break" : "focus")}
            >
              {phase === "focus" ? "Skip work" : "Skip break"}
            </button>
          </div>
          <div className="rounded border border-theme p-2">
            <p className="mb-2 text-xs uppercase text-muted">Presets</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <button className="rounded border border-theme px-2 py-1 text-xs" onClick={() => applyPreset(25, 5)}>
                25 | 5
              </button>
              <button className="rounded border border-theme px-2 py-1 text-xs" onClick={() => applyPreset(50, 10)}>
                50 | 10
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex items-center gap-1">
                Work
                <input
                  type="number"
                  min={1}
                  max={180}
                  className="w-16 rounded border border-theme surface px-2 py-1"
                  value={draftFocus}
                  onChange={(event) => setDraftFocus(Number(event.target.value))}
                />
              </label>
              <label className="flex items-center gap-1">
                Break
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="w-16 rounded border border-theme surface px-2 py-1"
                  value={draftBreak}
                  onChange={(event) => setDraftBreak(Number(event.target.value))}
                />
              </label>
              <button className="rounded border border-theme px-2 py-1" onClick={applyConfig}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
