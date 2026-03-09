"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { useAnalyticsWeek } from "@/hooks/useAnalytics";
import { useAnalyticsHistory } from "@/hooks/useAnalyticsHistory";
import { usePreferences } from "@/hooks/usePreferences";
import { TopAccentBar } from "@/components/planner/TopAccentBar";
import { PreferencesSidebar } from "@/components/planner/PreferencesSidebar";
import { AccountSidebar } from "@/components/account/AccountSidebar";

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
type Point = { label: string; value: number };
type PeakScope = "average" | number;

function MiniBarChart({ points }: { points: Point[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const initialPositionedRef = useRef(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: string; placement: "above" | "below" } | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    if (initialPositionedRef.current) return;
    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    initialPositionedRef.current = true;
  }, [points]);

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <div ref={chartRef} className="relative min-w-[680px]">
        <div className="flex h-36 items-end gap-1">
          {points.map((point) => (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-accent transition-[height] duration-300"
                style={{ height: `${Math.max(3, Math.round(toPercent(point.value, max) * 1.35))}px` }}
                onMouseEnter={(event) => {
                  if (!chartRef.current) return;
                  const containerRect = chartRef.current.getBoundingClientRect();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setTooltip({
                    x: rect.left + rect.width / 2 - containerRect.left,
                    y: rect.top - containerRect.top,
                    label: point.label,
                    value: formatSec(point.value),
                    placement: rect.top - containerRect.top < 36 ? "below" : "above",
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            </div>
          ))}
        </div>
        {tooltip ? (
          <div
            className="pointer-events-none absolute rounded border border-theme surface px-2 py-1 text-xs shadow"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: tooltip.placement === "above" ? "translate(-50%, -120%)" : "translate(-50%, 14%)",
            }}
          >
            <div className="font-semibold">{tooltip.label}</div>
            <div className="text-muted">{tooltip.value}</div>
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-6 text-xs text-muted">
          {points.filter((_, index) => index % Math.ceil(points.length / 6) === 0).map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { weekStart, dailyTotals, hourTotals, hourByDayTotals, prevWeek, nextWeek } = useAnalyticsWeek();
  const history = useAnalyticsHistory();
  const { preferences, patchPreferences } = usePreferences();

  const maxDaily = Math.max(...dailyTotals, 1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [peakScope, setPeakScope] = useState<PeakScope>("average");
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; label: string; value: string; placement: "above" | "below" } | null>(null);
  const [selectedHeatCell, setSelectedHeatCell] = useState<{ dateKey: string; value: number } | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const heatmapScrollRef = useRef<HTMLDivElement | null>(null);
  const initialHeatmapPositionedRef = useRef(false);
  const tooltipTimerRef = useRef<number | null>(null);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentYearLabel = String(new Date().getFullYear());
  const todayIndexInViewedWeek = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((todayStart.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && diffDays <= 6 ? diffDays : null;
  }, [weekStart]);
  const selectedHourTotals = useMemo(() => {
    if (peakScope === "average") return hourTotals;
    return hourByDayTotals[peakScope] ?? hourTotals;
  }, [hourByDayTotals, hourTotals, peakScope]);
  const maxHour = useMemo(() => Math.max(...selectedHourTotals, 1), [selectedHourTotals]);
  const selectedPeakLabel = useMemo(() => {
    if (peakScope === "average") return "Weekly average";
    return `${weekdayLabels[peakScope]} focus pattern`;
  }, [peakScope]);
  const lineScaleMax = useMemo(() => {
    const sorted = [...selectedHourTotals].sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 1;
    return Math.max(1, p90);
  }, [selectedHourTotals]);
  const linePointsScaled = useMemo(() => {
    const width = 960;
    const height = 176;
    const top = 12;
    const bottom = height - 12;
    const drawableH = bottom - top;
    return selectedHourTotals.map((sec, hour) => {
      const x = ((hour + 0.5) / 24) * width;
      const y = bottom - (Math.min(Math.max(0, sec), lineScaleMax) / lineScaleMax) * drawableH;
      return { x, y, hour, sec };
    });
  }, [lineScaleMax, selectedHourTotals]);

  const avgDailySec = useMemo(() => {
    if (!history.dailyFocus.length) return 0;
    return history.dailyFocus.reduce((sum, point) => sum + point.value, 0) / history.dailyFocus.length;
  }, [history.dailyFocus]);

  const maxYearHeat = useMemo(() => {
    const values = history.yearHeatmap.weeks.flat().filter((cell) => cell.inRange).map((cell) => cell.value);
    return Math.max(...values, 1);
  }, [history.yearHeatmap.weeks]);
  const yearBreakWeeks = useMemo(
    () => new Set(history.yearHeatmap.yearTicks.map((tick) => tick.weekIndex)),
    [history.yearHeatmap.yearTicks],
  );

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(event.target as Node)) return;
      setPrefsOpen(false);
      setAccountOpen(false);
    };

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!heatmapScrollRef.current) return;
    if (initialHeatmapPositionedRef.current) return;
    const tick = history.yearHeatmap.yearTicks.find((item) => item.label === currentYearLabel);
    if (!tick) return;
    const cellWidth = 0.72 * 16 + 4;
    const left = tick.weekIndex * cellWidth - 64;
    heatmapScrollRef.current.scrollLeft = Math.max(0, left);
    initialHeatmapPositionedRef.current = true;
  }, [history.yearHeatmap.yearTicks, currentYearLabel]);

  useEffect(() => {
    if (todayIndexInViewedWeek === null) {
      setPeakScope("average");
      return;
    }
    setPeakScope(todayIndexInViewedWeek);
  }, [todayIndexInViewedWeek]);

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
        placement: y < 40 ? "below" : "above",
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
      className="app-shell min-h-[100dvh] tab-view-enter"
    >
      <TopAccentBar
        mode="analytics"
        rangeLabel={`Week of ${format(weekStart, "MMM d, yyyy")}`}
        onTogglePrefs={() => {
          setPrefsOpen((prev) => !prev);
          setAccountOpen(false);
        }}
        onToggleAccount={() => {
          setAccountOpen((prev) => !prev);
          setPrefsOpen(false);
        }}
        prefsOpen={prefsOpen}
        accountOpen={accountOpen}
      />

      <div
        ref={popoverRef}
        className="fixed inset-x-2 z-50 max-h-[calc(100dvh-var(--ui-toolbar-height)-0.75rem)] w-auto overflow-hidden sm:inset-x-auto sm:right-3 sm:w-[290px]"
        style={{ top: "calc(var(--ui-toolbar-height) + var(--ui-top-border-width) + 0.3333333333rem)" }}
      >
        {prefsOpen ? <PreferencesSidebar preferences={preferences} onPatch={patchPreferences} /> : null}
        {accountOpen ? <AccountSidebar /> : null}
      </div>

      <div className="planner-main-shell overflow-y-auto px-4 pt-3 pb-4">
        <div className="mb-4 flex items-center gap-2">
          <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={prevWeek}>Prev</button>
          <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={nextWeek}>Next</button>
        </div>

        <section className="rounded border border-theme surface p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Daily totals</h2>
            <button
              type="button"
              className={`rounded border px-2 py-1 text-xs ${peakScope === "average" ? "border-[var(--custom-color)] text-[var(--custom-color)]" : "border-theme"}`}
              onClick={() => setPeakScope("average")}
            >
              Average
            </button>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => {
              const day = addDays(weekStart, i);
              const value = dailyTotals[i] ?? 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={`rounded border p-2 text-left ${peakScope === i ? "border-[var(--custom-color)]" : "border-theme"}`}
                  onClick={() => setPeakScope(i)}
                >
                  <p className="text-xs text-muted">{format(day, "EEE")}</p>
                  <div className="surface-soft mt-1 h-2 w-full overflow-hidden rounded">
                    <div className="h-full rounded bg-accent transition-[width] duration-300" style={{ width: `${toPercent(value, maxDaily)}%` }} />
                  </div>
                  <p className="mt-1 font-medium">{formatSec(value)}</p>
                </button>
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
          <p className="mt-2 text-xs text-muted">{selectedPeakLabel}</p>
          <div className="mt-3 overflow-x-auto">
            <div ref={chartRef} className="relative min-w-[640px]">
              {chartType === "bar" ? (
                <div className="grid h-44 grid-cols-24 items-end gap-1">
                  {selectedHourTotals.map((sec, hour) => {
                    const valuePercent = toPercent(sec, maxHour);
                    return (
                      <div key={hour} className="flex min-w-0 items-end justify-center">
                        <div
                          className="w-full rounded-t-[3px] bg-accent transition-[height] duration-300"
                          style={{ height: `${Math.max(4, Math.round(valuePercent * 1.76))}px` }}
                          onMouseEnter={(event) => queueTooltip(event.currentTarget, hour, sec)}
                          onMouseLeave={hideTooltip}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-52">
                  <svg viewBox="0 0 960 176" className="h-full w-full">
                    <line x1="0" y1="164" x2="960" y2="164" stroke="var(--todo-border-color)" strokeWidth="1" />
                    <polyline
                      fill="none"
                      stroke="var(--custom-color)"
                      strokeWidth="2.5"
                      points={linePointsScaled.map((point) => `${point.x},${point.y}`).join(" ")}
                    />
                    {linePointsScaled.map((point) => (
                      <g key={point.hour}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="9"
                          fill="transparent"
                          onMouseEnter={(event) => queueTooltip(event.currentTarget, point.hour, point.sec)}
                          onMouseLeave={hideTooltip}
                        />
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="4.8"
                          fill="var(--app-background)"
                          stroke="var(--custom-color)"
                          strokeWidth="2"
                          pointerEvents="none"
                        />
                      </g>
                    ))}
                  </svg>
                </div>
              )}
              {chartTooltip ? (
                <div
                  className="pointer-events-none absolute rounded border border-theme surface px-2 py-1 text-xs shadow"
                  style={{
                    left: chartTooltip.x,
                    top: chartTooltip.y,
                    transform: chartTooltip.placement === "above" ? "translate(-50%, -120%)" : "translate(-50%, 14%)",
                  }}
                >
                  <div className="font-semibold">{chartTooltip.label}</div>
                  <div className="text-muted">{chartTooltip.value}</div>
                </div>
              ) : null}
              {chartType === "bar" ? (
                <div className="relative mt-2 h-4 text-xs text-muted">
                  {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
                    <span
                      key={hour}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${((hour + 0.5) / 24) * 100}%` }}
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Focus heat map</h2>
          <div ref={heatmapScrollRef} className="mt-3 overflow-x-auto">
            <div className="inline-block" style={{ minWidth: `max(100%, ${history.yearHeatmap.weeks.length * 13 + 120}px)` }}>
              <div className="mb-1 flex items-end gap-2">
                <div className="w-8 shrink-0" />
                <div
                  className="relative grid gap-1 text-[10px] font-semibold text-muted"
                  style={{ gridTemplateColumns: `repeat(${history.yearHeatmap.weeks.length}, 0.72rem)` }}
                >
                  {history.yearHeatmap.yearTicks.map((year) => (
                    <span key={`year-${year.label}-${year.weekIndex}`} style={{ gridColumnStart: year.weekIndex + 1 }}>
                      {year.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mb-1 flex items-end gap-2">
                <div className="w-8 shrink-0" />
                <div
                  className="grid gap-1 text-[10px] font-medium text-muted"
                  style={{ gridTemplateColumns: `repeat(${history.yearHeatmap.weeks.length}, 0.72rem)` }}
                >
                  {history.yearHeatmap.monthTicks.map((month) => (
                    <span key={`${month.label}-${month.weekIndex}`} style={{ gridColumnStart: month.weekIndex + 1 }}>
                      {month.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                {weekdayLabels.map((weekday, dayIndex) => (
                  <div key={weekday} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs text-muted">{weekday}</span>
                    <div
                      className="grid gap-1"
                      style={{ gridTemplateColumns: `repeat(${history.yearHeatmap.weeks.length}, 0.72rem)` }}
                    >
                      {history.yearHeatmap.weeks.map((week, weekIndex) => {
                        const cell = week[dayIndex];
                        const ratio = maxYearHeat > 0 ? cell.value / maxYearHeat : 0;
                        const sec = cell.value;
                        let redMix = 0;
                        if (sec >= 4 * 3600) redMix = 74;
                        else if (sec >= 2 * 3600) redMix = 60;
                        else if (sec >= 60 * 60) redMix = 46;
                        else if (sec >= 30 * 60) redMix = 33;
                        else if (sec >= 10 * 60) redMix = 22;
                        else if (sec > 0) redMix = 14;
                        const mixPercent = Math.max(redMix, Math.round(10 + ratio * 64));
                        const isSelected = selectedHeatCell?.dateKey === cell.dateKey;
                        return (
                          <button
                            key={`${weekIndex}-${dayIndex}`}
                            type="button"
                            className={`h-3 w-3 rounded-[3px] border border-theme ${isSelected ? "ring-1 ring-offset-1 ring-offset-transparent ring-[var(--custom-color)]" : ""}`}
                            style={{
                              borderColor: isSelected ? "var(--custom-color)" : undefined,
                              backgroundColor: cell.inRange
                                ? sec > 0
                                  ? `color-mix(in oklab, var(--custom-color) ${mixPercent}%, var(--app-background))`
                                  : "color-mix(in oklab, #8f959d 34%, var(--app-background))"
                                : "var(--ui-button-bg-alt)",
                              opacity: cell.inRange ? 1 : 0.35,
                              boxShadow: yearBreakWeeks.has(weekIndex) && !isSelected
                                ? "inset 1px 0 0 color-mix(in oklab, #9aa0a8 65%, transparent)"
                                : undefined,
                              outline: isSelected ? "1px solid var(--custom-color)" : undefined,
                              outlineOffset: "1px",
                            }}
                            onClick={() => setSelectedHeatCell({ dateKey: cell.dateKey, value: cell.value })}
                            aria-label={`${cell.dateKey}: ${formatSec(cell.value)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {selectedHeatCell
              ? `${selectedHeatCell.dateKey} - ${formatSec(selectedHeatCell.value)}`
              : "Click a cell to view the exact day and focus time."}
          </p>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Historical statistics</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <div className="rounded border border-theme p-2">
              <p className="text-xs text-muted">Total focus time</p>
              <p className="text-lg font-semibold">{formatSec(history.totalFocusSec)}</p>
            </div>
            <div className="rounded border border-theme p-2">
              <p className="text-xs text-muted">Average / day (30d)</p>
              <p className="text-lg font-semibold">{formatSec(avgDailySec)}</p>
            </div>
            <div className="rounded border border-theme p-2">
              <p className="text-xs text-muted">Completed to-dos</p>
              <p className="text-lg font-semibold">{history.completionSummary.done}</p>
            </div>
            <div className="rounded border border-theme p-2">
              <p className="text-xs text-muted">Completion rate</p>
              <p className="text-lg font-semibold">{history.completionSummary.rate.toFixed(1)}%</p>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Daily / Weekly / Monthly time stats</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Daily (30d)</p>
              <MiniBarChart points={history.dailyFocus} />
            </div>
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Weekly (12w)</p>
              <MiniBarChart points={history.weeklyFocus} />
            </div>
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Monthly (12m)</p>
              <MiniBarChart points={history.monthlyFocus} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
