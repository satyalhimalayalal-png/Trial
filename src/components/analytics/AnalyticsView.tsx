"use client";

import { useRef, useState, useEffect, useMemo } from "react";
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

type ChartType = "bar" | "line";

export function AnalyticsView() {
  const { weekStart, dailyTotals, hourTotals, hourByDayTotals, prevWeek, nextWeek } = useAnalyticsWeek();
  const { preferences, patchPreferences } = usePreferences();
  const maxDaily = Math.max(...dailyTotals, 1);
  const maxHour = Math.max(...hourTotals, 1);
  const maxHeat = Math.max(...hourByDayTotals.flat(), 1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  const prefsRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const dayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "EEE"));
  const linePoints = useMemo(() => {
    const width = 960;
    const height = 176;
    const left = 16;
    const right = width - 16;
    const top = 12;
    const bottom = height - 12;
    const drawableW = right - left;
    const drawableH = bottom - top;
    return hourTotals.map((sec, hour) => {
      const x = left + (hour / 23) * drawableW;
      const y = bottom - (Math.max(0, sec) / maxHour) * drawableH;
      return { x, y, hour, sec };
    });
  }, [hourTotals, maxHour]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!prefsRef.current) return;
      if (prefsRef.current.contains(event.target as Node)) return;
      setPrefsOpen(false);
    };

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const queueTooltip = (target: Element, hour: number, sec: number) => {
    if (!chartRef.current) return;
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);

    const containerRect = chartRef.current.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - containerRect.left;
    const y = rect.top - containerRect.top;
    tooltipTimerRef.current = window.setTimeout(() => {
      setChartTooltip({
        x,
        y,
        label: `${hour.toString().padStart(2, "0")}:00`,
        value: formatSec(sec),
      });
    }, 140);
  };

  const hideTooltip = () => {
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    setChartTooltip(null);
  };

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
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Peak Hour Chart</h2>
            <div className="inline-flex overflow-hidden rounded border border-theme">
              <button
                type="button"
                className={chartType === "bar" ? "bg-accent px-2 py-1 text-xs text-white" : "surface px-2 py-1 text-xs"}
                onClick={() => setChartType("bar")}
              >
                Bar
              </button>
              <button
                type="button"
                className={chartType === "line" ? "bg-accent px-2 py-1 text-xs text-white" : "surface px-2 py-1 text-xs"}
                onClick={() => setChartType("line")}
              >
                Line
              </button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <div ref={chartRef} className="relative min-w-[680px]">
              {chartType === "bar" ? (
                <div className="flex h-44 items-end gap-1">
                  {hourTotals.map((sec, hour) => {
                    const valuePercent = toPercent(sec, maxHour);
                    return (
                      <div key={hour} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                        <div
                          className="w-full rounded-t bg-accent transition-[height] duration-300"
                          style={{ height: `${Math.max(4, Math.round(valuePercent * 1.76))}px` }}
                          onMouseEnter={(event) => queueTooltip(event.currentTarget, hour, sec)}
                          onMouseLeave={hideTooltip}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44">
                  <svg viewBox="0 0 960 176" className="h-full w-full">
                    <polyline
                      fill="none"
                      stroke="var(--custom-color)"
                      strokeWidth="2.5"
                      points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                    />
                    {linePoints.map((point) => (
                      <circle
                        key={point.hour}
                        cx={point.x}
                        cy={point.y}
                        r="4.8"
                        fill="var(--app-background)"
                        stroke="var(--custom-color)"
                        strokeWidth="2"
                        onMouseEnter={(event) => queueTooltip(event.currentTarget, point.hour, point.sec)}
                        onMouseLeave={hideTooltip}
                      />
                    ))}
                  </svg>
                </div>
              )}
              {chartTooltip ? (
                <div
                  className="pointer-events-none absolute rounded border border-theme surface px-2 py-1 text-xs shadow"
                  style={{ left: chartTooltip.x, top: chartTooltip.y, transform: "translate(-50%, -120%)" }}
                >
                  <div className="font-semibold">{chartTooltip.label}</div>
                  <div className="text-muted">{chartTooltip.value}</div>
                </div>
              ) : null}
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
          <h2 className="text-sm font-semibold">Focus heat map</h2>
          <div className="mt-3 overflow-x-auto pb-1">
            <div className="min-w-[1160px]">
              <div className="mb-2 flex">
                <div className="w-14 shrink-0" />
                <div className="grid flex-1 grid-cols-8 gap-3 text-center text-sm font-semibold text-muted">
                  <span>00:00</span>
                  <span>03:00</span>
                  <span>06:00</span>
                  <span>09:00</span>
                  <span>12:00</span>
                  <span>15:00</span>
                  <span>18:00</span>
                  <span>21:00</span>
                </div>
              </div>

              <div className="space-y-2">
                {hourByDayTotals.map((row, dayIndex) => (
                  <div key={dayLabels[dayIndex]} className="flex items-center gap-3">
                    <span className="w-11 shrink-0 text-3xl leading-none text-muted">{dayLabels[dayIndex].slice(0, 3)}</span>
                    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(24, 1.55rem)" }}>
                      {row.map((value, hour) => {
                        const ratio = maxHeat > 0 ? value / maxHeat : 0;
                        const mixPercent = Math.round(10 + ratio * 85);
                        return (
                          <div
                            key={`${dayIndex}-${hour}`}
                            className="h-6 w-6 rounded-md border border-theme"
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
