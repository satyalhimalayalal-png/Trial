"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useFocusTimer } from "@/hooks/useFocusTimer";
import type { FocusTimerSource } from "@/state/useFocusStore";

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
type AlertTone = "synth-chime" | "synth-bell" | "synth-pulse" | "uploaded-file";

interface PomodoroConfig {
  focusMinutes: number;
  breakMinutes: number;
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  breakMinutes: 5,
};
const PREFS_STORAGE_KEY = "focus-timer-prefs-v1";
const POMODORO_RUNTIME_STORAGE_KEY = "focus-timer-pomodoro-runtime-v1";

interface PomodoroRuntimeSnapshot {
  phase: PomodoroPhase;
  remainingSec: number;
  pomodoroRunning: boolean;
  phaseEndsAtMs: number | null;
}

export function FocusTimer() {
  const timer = useFocusTimer();
  const timerWithSource = timer as typeof timer & {
    source?: FocusTimerSource | null;
    discard?: () => Promise<void>;
    start: (taskId?: string, source?: FocusTimerSource) => Promise<void>;
  };
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [expanded, setExpanded] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [autoStartBreaks, setAutoStartBreaks] = useState(false);
  const [autoStartPomodoros, setAutoStartPomodoros] = useState(false);
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [draftFocus, setDraftFocus] = useState(DEFAULT_CONFIG.focusMinutes);
  const [draftBreak, setDraftBreak] = useState(DEFAULT_CONFIG.breakMinutes);
  const [remainingSec, setRemainingSec] = useState(DEFAULT_CONFIG.focusMinutes * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [phaseEndsAtMs, setPhaseEndsAtMs] = useState<number | null>(null);
  const [alertTone, setAlertTone] = useState<AlertTone>("synth-chime");
  const [uploadedToneDataUrl, setUploadedToneDataUrl] = useState<string | null>(null);
  const [uploadedToneName, setUploadedToneName] = useState<string | null>(null);
  const remainingRef = useRef(remainingSec);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const defaultRingtoneRef = useRef<HTMLAudioElement | null>(null);
  const uploadedRingtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    remainingRef.current = remainingSec;
  }, [remainingSec]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        focusMinutes: number;
        breakMinutes: number;
        autoStartBreaks: boolean;
        autoStartPomodoros: boolean;
        alertTone: AlertTone;
      }>;
      const nextFocus = Math.max(1, Math.min(180, Math.floor(parsed.focusMinutes ?? DEFAULT_CONFIG.focusMinutes)));
      const nextBreak = Math.max(1, Math.min(120, Math.floor(parsed.breakMinutes ?? DEFAULT_CONFIG.breakMinutes)));
      setConfig({ focusMinutes: nextFocus, breakMinutes: nextBreak });
      setDraftFocus(nextFocus);
      setDraftBreak(nextBreak);
      setRemainingSec((phase === "focus" ? nextFocus : nextBreak) * 60);
      if (typeof parsed.autoStartBreaks === "boolean") setAutoStartBreaks(parsed.autoStartBreaks);
      if (typeof parsed.autoStartPomodoros === "boolean") setAutoStartPomodoros(parsed.autoStartPomodoros);
      if (parsed.alertTone === "synth-chime" || parsed.alertTone === "synth-bell" || parsed.alertTone === "synth-pulse" || parsed.alertTone === "uploaded-file") {
        setAlertTone(parsed.alertTone);
      }
    } catch {
      // keep defaults if cache parse fails
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        focusMinutes: config.focusMinutes,
        breakMinutes: config.breakMinutes,
        autoStartBreaks,
        autoStartPomodoros,
        alertTone,
      }),
    );
  }, [config.focusMinutes, config.breakMinutes, autoStartBreaks, autoStartPomodoros, alertTone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(POMODORO_RUNTIME_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PomodoroRuntimeSnapshot>;
      const nextPhase: PomodoroPhase = parsed.phase === "break" ? "break" : "focus";
      const safeRemaining = Math.max(0, Math.floor(Number(parsed.remainingSec ?? 0)));
      const nextEndsAt = typeof parsed.phaseEndsAtMs === "number" ? parsed.phaseEndsAtMs : null;
      const running = Boolean(parsed.pomodoroRunning) && nextEndsAt !== null;
      const projectedRemaining = running ? Math.max(0, Math.ceil((nextEndsAt - Date.now()) / 1000)) : safeRemaining;

      setPhase(nextPhase);
      setRemainingSec(projectedRemaining);
      setPomodoroRunning(running);
      setPhaseEndsAtMs(running ? nextEndsAt : null);
    } catch {
      // keep in-memory defaults when cache parse fails
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot: PomodoroRuntimeSnapshot = {
      phase,
      remainingSec,
      pomodoroRunning,
      phaseEndsAtMs: pomodoroRunning ? phaseEndsAtMs : null,
    };
    sessionStorage.setItem(POMODORO_RUNTIME_STORAGE_KEY, JSON.stringify(snapshot));
  }, [phase, remainingSec, pomodoroRunning, phaseEndsAtMs]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  const phaseDurationSec = useMemo(() => {
    return (phase === "focus" ? config.focusMinutes : config.breakMinutes) * 60;
  }, [phase, config.focusMinutes, config.breakMinutes]);
  const phaseProgress = useMemo(() => {
    if (phaseDurationSec <= 0) return 0;
    return Math.max(0, Math.min(1, (phaseDurationSec - remainingSec) / phaseDurationSec));
  }, [phaseDurationSec, remainingSec]);
  const ringFillColor = phase === "focus" ? "#cf2d2d" : "#2f72ea";
  const ringTrackColor = phase === "focus" ? "#4c1f1f" : "#1f3457";
  const timerSource = timerWithSource.source ?? null;
  const pomodoroHasActiveSession = timer.active && timerSource === "pomodoro";
  const stopwatchActive = timer.active && (timerSource === "stopwatch" || timerSource === null);
  const stopwatchBlockedByPomodoro = timer.active && timerSource === "pomodoro";
  const stopwatchElapsedSec = stopwatchActive ? timer.elapsedSec : 0;

  useEffect(() => {
    setMode("pomodoro");
  }, []);

  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const audio = new Audio("/sounds/pomodoro-end.mp3");
    audio.preload = "auto";
    audio.volume = 1;
    defaultRingtoneRef.current = audio;

    return () => {
      audio.pause();
      defaultRingtoneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const storedDataUrl = localStorage.getItem("pomodoro-uploaded-tone-data-url");
    const storedName = localStorage.getItem("pomodoro-uploaded-tone-name");
    if (storedDataUrl) setUploadedToneDataUrl(storedDataUrl);
    if (storedName) setUploadedToneName(storedName);
  }, []);

  useEffect(() => {
    if (typeof Audio === "undefined") return;
    if (!uploadedToneDataUrl) {
      uploadedRingtoneRef.current = null;
      return;
    }
    const audio = new Audio(uploadedToneDataUrl);
    audio.preload = "auto";
    audio.volume = 1;
    uploadedRingtoneRef.current = audio;
    return () => {
      audio.pause();
      uploadedRingtoneRef.current = null;
    };
  }, [uploadedToneDataUrl]);

  const playSynthAlert = (tone: Exclude<AlertTone, "track" | "uploaded-file">) => {
    if (typeof window === "undefined") return;
    const AudioContextImpl =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextImpl) return;

    const context = new AudioContextImpl();
    const now = context.currentTime;

    const patterns: Record<Exclude<AlertTone, "uploaded-file">, number[]> = {
      "synth-chime": [784, 988, 1175, 1568],
      "synth-bell": [523, 659, 784, 988],
      "synth-pulse": [740, 740, 740, 988],
    };
    const notes = patterns[tone];

    notes.forEach((freq, index) => {
      const start = now + index * 0.2;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = tone === "synth-bell" ? "sine" : "triangle";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.34, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });

    window.setTimeout(() => {
      void context.close();
    }, 1400);
  };

  const playPhaseEndRingtone = () => {
    if (alertTone === "synth-chime" || alertTone === "synth-bell" || alertTone === "synth-pulse") {
      playSynthAlert(alertTone);
      return;
    }

    const audio = alertTone === "uploaded-file" ? uploadedRingtoneRef.current : defaultRingtoneRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // no-op: browser blocked autoplay or unsupported codec
    });
  };

  const primeRingtone = () => {
    if (alertTone !== "uploaded-file") return;
    const audio = alertTone === "uploaded-file" ? uploadedRingtoneRef.current : defaultRingtoneRef.current;
    if (!audio) return;
    const previousVolume = audio.volume;
    audio.volume = 0;
    audio.currentTime = 0;
    void audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = previousVolume;
      })
      .catch(() => {
        audio.volume = previousVolume;
      });
  };

  const onUploadTone = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) return;
      setUploadedToneDataUrl(dataUrl);
      setUploadedToneName(file.name);
      setAlertTone("uploaded-file");
      localStorage.setItem("pomodoro-uploaded-tone-data-url", dataUrl);
      localStorage.setItem("pomodoro-uploaded-tone-name", file.name);
    };
    reader.readAsDataURL(file);
  };

  const clearUploadedTone = () => {
    setUploadedToneDataUrl(null);
    setUploadedToneName(null);
    if (alertTone === "uploaded-file") setAlertTone("synth-chime");
    localStorage.removeItem("pomodoro-uploaded-tone-data-url");
    localStorage.removeItem("pomodoro-uploaded-tone-name");
  };

  useEffect(() => {
    if (mode !== "pomodoro") {
      setPomodoroRunning(false);
      setPhaseEndsAtMs(null);
      if (pomodoroHasActiveSession) {
        void timer.stop();
      }
      return;
    }
  }, [mode, pomodoroHasActiveSession, timer.stop]);

  useEffect(() => {
    if (mode !== "pomodoro" || !pomodoroRunning) {
      setPhaseEndsAtMs(null);
      return;
    }
    const targetEndMs = phaseEndsAtMs ?? Date.now() + remainingRef.current * 1000;
    if (phaseEndsAtMs === null) {
      setPhaseEndsAtMs(targetEndMs);
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((targetEndMs - Date.now()) / 1000));
      setRemainingSec(left);
    };
    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [mode, pomodoroRunning, phaseEndsAtMs]);

  useEffect(() => {
    if (mode !== "pomodoro" || !pomodoroRunning || remainingSec > 0) return;

    playPhaseEndRingtone();
    setPhaseEndsAtMs(null);

    if (phase === "focus") {
      if (pomodoroHasActiveSession) {
        void timer.stop();
      }
      setPhase("break");
      setRemainingSec(config.breakMinutes * 60);
      setPomodoroRunning(autoStartBreaks);
      if (autoStartBreaks) {
        setPhaseEndsAtMs(Date.now() + config.breakMinutes * 60 * 1000);
      }
      return;
    }

    setPhase("focus");
    setRemainingSec(config.focusMinutes * 60);
    if (autoStartPomodoros) {
      if (!pomodoroHasActiveSession) {
        void ensurePomodoroFocusSession();
      }
      setPomodoroRunning(true);
      setPhaseEndsAtMs(Date.now() + config.focusMinutes * 60 * 1000);
      return;
    }
    setPomodoroRunning(false);
  }, [
    mode,
    pomodoroRunning,
    remainingSec,
    phase,
    config.focusMinutes,
    config.breakMinutes,
    pomodoroHasActiveSession,
    timer.start,
    timer.stop,
    autoStartBreaks,
    autoStartPomodoros,
  ]);

  const ensurePomodoroFocusSession = async () => {
    if (phase !== "focus") return;
    if (timer.active && timerSource === "pomodoro") return;
    if (timer.active && timerSource !== "pomodoro") {
      await timer.stop();
    }
    await timerWithSource.start(undefined, "pomodoro");
  };

  const startPomodoro = () => {
    primeRingtone();
    void ensurePomodoroFocusSession();
    const safeRemaining = Math.max(0, remainingSec);
    setPhaseEndsAtMs(Date.now() + safeRemaining * 1000);
    setPomodoroRunning(true);
  };

  const pausePomodoro = () => {
    if (phaseEndsAtMs !== null) {
      const left = Math.max(0, Math.ceil((phaseEndsAtMs - Date.now()) / 1000));
      setRemainingSec(left);
    }
    setPhaseEndsAtMs(null);
    if (phase === "focus" && pomodoroHasActiveSession) {
      void timer.stop();
    }
    setPomodoroRunning(false);
  };

  const resetPomodoro = () => {
    setPhaseEndsAtMs(null);
    if (phase === "focus" && pomodoroHasActiveSession) {
      if (timerWithSource.discard) {
        void timerWithSource.discard();
      } else {
        void timer.stop();
      }
    }
    setPomodoroRunning(false);
    setRemainingSec(phaseDurationSec);
  };

  const jumpToPhase = (nextPhase: PomodoroPhase) => {
    if (nextPhase === "break" && pomodoroHasActiveSession) {
      void timer.stop();
    }

    if (nextPhase === "focus" && pomodoroRunning) {
      void ensurePomodoroFocusSession();
    }

    setPhase(nextPhase);
    const nextRemaining = (nextPhase === "focus" ? config.focusMinutes : config.breakMinutes) * 60;
    setRemainingSec(nextRemaining);
    if (pomodoroRunning) {
      setPhaseEndsAtMs(Date.now() + nextRemaining * 1000);
    } else {
      setPhaseEndsAtMs(null);
    }
  };

  const applyConfig = () => {
    const nextFocus = Math.max(1, Math.min(180, Math.floor(draftFocus || 0)));
    const nextBreak = Math.max(1, Math.min(120, Math.floor(draftBreak || 0)));
    setConfig({ focusMinutes: nextFocus, breakMinutes: nextBreak });
    const nextRemaining = (phase === "focus" ? nextFocus : nextBreak) * 60;
    setRemainingSec(nextRemaining);
    if (pomodoroRunning) {
      setPhaseEndsAtMs(Date.now() + nextRemaining * 1000);
    } else {
      setPhaseEndsAtMs(null);
    }
  };

  const applyPreset = (focusMinutes: number, breakMinutes: number) => {
    setDraftFocus(focusMinutes);
    setDraftBreak(breakMinutes);
    setConfig({ focusMinutes, breakMinutes });
    const nextRemaining = (phase === "focus" ? focusMinutes : breakMinutes) * 60;
    setRemainingSec(nextRemaining);
    if (pomodoroRunning) {
      setPhaseEndsAtMs(Date.now() + nextRemaining * 1000);
    } else {
      setPhaseEndsAtMs(null);
    }
  };

  const expandedRingSize = "min(74dvh, 92vw)";

  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-[500] flex h-[100dvh] flex-col overflow-y-auto surface p-4"
          : "mb-4 rounded border border-theme surface p-3"
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="focus-timer-label text-xs uppercase text-muted">Focus timer</p>
        <div className="inline-flex overflow-hidden rounded border border-theme">
          <button
            type="button"
            className={mode === "stopwatch" ? "ui-chip-btn bg-accent px-2 py-1 text-white" : "ui-chip-btn surface px-2 py-1"}
            onClick={() => setMode("stopwatch")}
          >
            Stopwatch
          </button>
          <button
            type="button"
            className={mode === "pomodoro" ? "ui-chip-btn bg-accent px-2 py-1 text-white" : "ui-chip-btn surface px-2 py-1"}
            onClick={() => setMode("pomodoro")}
          >
            Pomodoro
          </button>
        </div>
      </div>

      {mode === "stopwatch" ? (
        <div className={expanded ? "flex flex-1 flex-col items-center justify-center gap-10 px-4" : "flex items-center justify-between"}>
          <div className="flex flex-col items-center">
            <button
              type="button"
              className={expanded ? "focus-timer-display cursor-pointer leading-none" : "focus-timer-display cursor-pointer text-[2.2rem] leading-none"}
              style={expanded ? { fontSize: "clamp(5.5rem, 20vw, 14rem)", lineHeight: 1 } : undefined}
              onClick={() => setExpanded((prev) => !prev)}
              title={expanded ? "Minimize timer" : "Fullscreen timer"}
            >
              {formatDuration(stopwatchElapsedSec)}
            </button>
          </div>
          {stopwatchActive ? (
            <button
              className={expanded ? "rounded border border-theme px-14 py-5 text-4xl" : "rounded border border-theme px-3 py-1"}
              onClick={() => void timer.stop()}
            >
              Stop
            </button>
          ) : (
            <button
              className={expanded ? "rounded border border-theme px-14 py-5 text-4xl" : "rounded border border-theme px-3 py-1"}
              disabled={stopwatchBlockedByPomodoro}
              onClick={() => void timerWithSource.start(undefined, "stopwatch")}
            >
              Start
            </button>
          )}
        </div>
      ) : (
        <div className={expanded ? "flex flex-1 flex-col justify-center space-y-5" : "space-y-3"}>
          <div className="flex justify-center">
            <div
              className={`pomodoro-ring ${pomodoroRunning ? "pomodoro-ring-running" : ""}`}
              onClick={() => setExpanded((prev) => !prev)}
              title={expanded ? "Minimize timer" : "Fullscreen timer"}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setExpanded((prev) => !prev);
                }
              }}
              style={{
                background: `conic-gradient(${ringFillColor} ${Math.round(phaseProgress * 360)}deg, ${ringTrackColor} 0deg)`,
                ...(expanded ? { height: expandedRingSize, width: expandedRingSize, padding: "10px" } : {}),
                cursor: "pointer",
              }}
            >
              <div
                className="pomodoro-ring-core"
                style={expanded ? { height: "calc(min(74dvh, 92vw) - 20px)", width: "calc(min(74dvh, 92vw) - 20px)" } : undefined}
              >
                <p className={expanded ? "focus-timer-phase text-base uppercase tracking-[0.1em] text-muted" : "focus-timer-phase text-xs uppercase tracking-[0.1em] text-muted"}>
                  {phase === "focus" ? "Work" : "Break"}
                </p>
                <p className={expanded ? "focus-timer-display text-7xl leading-none" : "focus-timer-display text-[2.15rem] leading-none"}>
                  {formatDuration(remainingSec)}
                </p>
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
          {!expanded ? (
            <div className="rounded border border-theme p-2">
              <button
                type="button"
                className="ui-chip-btn mb-2 flex w-full items-center justify-between uppercase text-muted"
                onClick={() => setPresetsOpen((prev) => !prev)}
                aria-expanded={presetsOpen}
              >
                <span>Presets</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {presetsOpen ? (
                    <path d="M18 15 12 9 6 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M6 9 12 15 18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              </button>
              {presetsOpen ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button className="rounded border border-theme px-2 py-1 text-xs" onClick={() => applyPreset(25, 5)}>
                      25 | 5
                    </button>
                    <button className="rounded border border-theme px-2 py-1 text-xs" onClick={() => applyPreset(50, 10)}>
                      50 | 10
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      className={autoStartBreaks ? "rounded border border-theme bg-accent px-2 py-1 text-white" : "rounded border border-theme px-2 py-1"}
                      onClick={() => setAutoStartBreaks((prev) => !prev)}
                    >
                      Auto start breaks: {autoStartBreaks ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      className={autoStartPomodoros ? "rounded border border-theme bg-accent px-2 py-1 text-white" : "rounded border border-theme px-2 py-1"}
                      onClick={() => setAutoStartPomodoros((prev) => !prev)}
                    >
                      Auto start pomodoros: {autoStartPomodoros ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      Alert
                      <select
                        className="rounded border border-theme surface px-2 py-1"
                        value={alertTone}
                        onChange={(event) => setAlertTone(event.target.value as AlertTone)}
                      >
                        <option value="synth-chime">Synth Chime</option>
                        <option value="synth-bell">Synth Bell</option>
                        <option value="synth-pulse">Synth Pulse</option>
                        {uploadedToneDataUrl ? <option value="uploaded-file">Your Upload</option> : null}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="rounded border border-theme px-2 py-1"
                      onClick={playPhaseEndRingtone}
                    >
                      Preview
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={onUploadTone}
                    />
                    <button
                      type="button"
                      className="rounded border border-theme px-2 py-1"
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      Upload Sound
                    </button>
                    <span className="max-w-[220px] truncate rounded border border-theme px-2 py-1 text-muted">
                      {uploadedToneName ?? "No file selected"}
                    </span>
                    {uploadedToneDataUrl ? (
                      <button type="button" className="rounded border border-theme px-2 py-1" onClick={clearUploadedTone}>
                        Remove
                      </button>
                    ) : null}
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
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
