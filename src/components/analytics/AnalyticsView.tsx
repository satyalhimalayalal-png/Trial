"use client";

import { useRef, useState, useEffect } from "react";
import { addDays, format } from "date-fns";
import { useAnalyticsWeek } from "@/hooks/useAnalytics";
import { usePreferences } from "@/hooks/usePreferences";
import { TopAccentBar } from "@/components/planner/TopAccentBar";
import { PreferencesSidebar } from "@/components/planner/PreferencesSidebar";

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function toPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

export function AnalyticsView() {
  const { weekStart, dailyTotals, hourTotals, hourByDayTotals, prevWeek, nextWeek } = useAnalyticsWeek();
  const { preferences, patchPreferences } = usePreferences();
  const maxDaily = Math.max(...dailyTotals, 1);
  const maxHour = Math.max(...hourTotals, 1);
  const maxHeat = Math.max(...hourByDayTotals.flat(), 1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const prefsRef = useRef<HTMLDivElement | null>(null);
  const dayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "EEE"));

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!prefsRef.current) return;
      if (prefsRef.current.contains(event.target as Node)) return;
      setPrefsOpen(false);
    };

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <main
      data-theme={preferences.theme}
      data-accent={preferences.accentColor}
      data-text-size={preferences.textSize}
      data-spacing={preferences.spacing}
      data-columns={preferences.columns}
      className="app-shell min-h-screen tab-view-enter"
    >
      <TopAccentBar
        mode="analytics"
        rangeLabel={`Week of ${format(weekStart, "MMM d, yyyy")}`}
        onTogglePrefs={() => setPrefsOpen((prev) => !prev)}
      />

      <div
        ref={prefsRef}
        className="fixed right-3 z-50 w-[290px]"
        style={{ top: "calc(var(--ui-toolbar-height) + var(--ui-top-border-width) + 0.3333333333rem)" }}
      >
        {prefsOpen ? <PreferencesSidebar preferences={preferences} onPatch={patchPreferences} /> : null}
      </div>

      <div className="planner-main-shell px-4 pt-3 pb-4">
        <div className="mb-4 flex items-center gap-2">
          <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={prevWeek}>Prev</button>
          <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={nextWeek}>Next</button>
        </div>

        <section className="rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Daily totals</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(weekStart, i);
              const value = dailyTotals[i] ?? 0;
              return (
                <div key={i} className="rounded border border-theme p-2">
                  <p className="text-xs text-muted">{format(day, "EEE")}</p>
                  <div className="surface-soft mt-1 h-2 w-full overflow-hidden rounded">
                    <div className="h-full rounded bg-accent transition-[width] duration-300" style={{ width: `${toPercent(value, maxDaily)}%` }} />
                  </div>
                  <p className="mt-1 font-medium">{formatSec(value)}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Hour-of-day totals</h2>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="flex h-44 items-end gap-1">
                {hourTotals.map((sec, hour) => {
                  const valuePercent = toPercent(sec, maxHour);
                  return (
                    <div key={hour} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                      <div
                        className="w-full rounded-t bg-accent transition-[height] duration-300"
                        style={{ height: `${Math.max(4, Math.round(valuePercent * 1.76))}px` }}
                        title={`${hour.toString().padStart(2, "0")}:00 · ${formatSec(sec)}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-8 text-xs text-muted">
                <span>00:00</span>
                <span className="text-center">03:00</span>
                <span className="text-center">06:00</span>
                <span className="text-center">09:00</span>
                <span className="text-center">12:00</span>
                <span className="text-center">15:00</span>
                <span className="text-center">18:00</span>
                <span className="text-right">21:00</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Focus heat map (day x hour)</h2>
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[780px]">
              <div
                className="mb-1 ml-12 grid gap-1 text-[10px] text-muted"
                style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <span key={hour} className="text-center">
                    {hour % 3 === 0 ? hour.toString().padStart(2, "0") : ""}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                {hourByDayTotals.map((row, dayIndex) => (
                  <div key={dayLabels[dayIndex]} className="flex items-center gap-2">
                    <span className="w-10 text-xs text-muted">{dayLabels[dayIndex]}</span>
                    <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                      {row.map((value, hour) => {
                        const ratio = maxHeat > 0 ? value / maxHeat : 0;
                        const mixPercent = Math.round(12 + ratio * 80);
                        return (
                          <div
                            key={`${dayIndex}-${hour}`}
                            className="h-4 rounded-[2px] border border-theme"
                            style={{ backgroundColor: `color-mix(in oklab, var(--custom-color) ${mixPercent}%, var(--app-background))` }}
                            title={`${dayLabels[dayIndex]} ${hour.toString().padStart(2, "0")}:00 · ${formatSec(value)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
