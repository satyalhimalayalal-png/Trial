"use client";

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

export function FocusTimer() {
  const timer = useFocusTimer();

  return (
    <div className="mb-4 flex items-center justify-between rounded border border-theme surface p-3">
      <div>
        <p className="text-xs uppercase text-muted">Focus timer</p>
        <p className="font-mono text-2xl">{formatDuration(timer.elapsedSec)}</p>
      </div>
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
  );
}
