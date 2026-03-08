"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { useAnalyticsWeek } from "@/hooks/useAnalytics";
import { useAnalyticsHistory } from "@/hooks/useAnalyticsHistory";
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
type Point = { label: string; value: number };

function MiniBarChart({ points }: { points: Point[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="flex h-36 items-end gap-1">
          {points.map((point) => (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <div
                className="w-full rounded-t bg-accent transition-[height] duration-300"
                style={{ height: `${Math.max(3, Math.round(toPercent(point.value, max) * 1.35))}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-6 text-xs text-muted">
          {points.filter((_, index) => index % Math.ceil(points.length / 6) === 0).map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniLineChart({ points }: { points: Point[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const width = 960;
  const height = 144;
  const left = 16;
  const right = width - 16;
  const top = 12;
  const bottom = height - 12;
  const drawableW = right - left;
  const drawableH = bottom - top;

  const linePoints = points.map((point, index) => {
    const x = left + (index / Math.max(1, points.length - 1)) * drawableW;
    const y = bottom - (Math.max(0, point.value) / max) * drawableH;
    return { ...point, x, y };
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="h-36">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
            <polyline
              fill="none"
              stroke="var(--custom-color)"
              strokeWidth="2.5"
              points={linePoints.map((point) => `${point.x},${point.y}`).join(" ")}
            />
            {linePoints.map((point) => (
              <circle key={point.label} cx={point.x} cy={point.y} r="3.8" fill="var(--custom-color)" />
            ))}
          </svg>
        </div>
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
  const maxHour = Math.max(...hourTotals, 1);
  const maxHeat = Math.max(...hourByDayTotals.flat(), 1);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; label: string; value: string } | null>(null);
  const [ganttDay, setGanttDay] = useState(format(new Date(), "yyyy-MM-dd"));

  const prefsRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const dayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(weekStart, i), "EEE"));

  const linePoints = useMemo(() => {
    const height = 176;
    const top = 12;
    const bottom = height - 12;
    const drawableH = bottom - top;
    return hourTotals.map((sec, hour) => {
      const x = hour * 10 + 5;
      const y = bottom - (Math.max(0, sec) / maxHour) * drawableH;
      return { x, y, hour, sec };
    });
  }, [hourTotals, maxHour]);

  const avgDailySec = useMemo(() => {
    if (!history.dailyFocus.length) return 0;
    return history.dailyFocus.reduce((sum, point) => sum + point.value, 0) / history.dailyFocus.length;
  }, [history.dailyFocus]);

  const projectMax = useMemo(
    () => Math.max(...history.projectBreakdown.map((project) => project.value), 1),
    [history.projectBreakdown],
  );

  const ganttSessions = useMemo(
    () => history.sessionsForGantt.filter((session) => session.dayKey === ganttDay),
    [history.sessionsForGantt, ganttDay],
  );

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
      if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current);
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
            <div ref={chartRef} className="relative min-w-[640px]">
              {chartType === "bar" ? (
                <div className="grid h-44 grid-cols-24 items-end gap-1">
                  {hourTotals.map((sec, hour) => {
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
                <div className="h-44">
                  <svg viewBox="0 0 240 176" preserveAspectRatio="none" className="h-full w-full">
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
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Focus heat map</h2>
          <div className="mt-3 overflow-x-auto pb-1">
            <div className="min-w-[620px]">
              <div className="mb-1 flex items-end gap-2">
                <div className="w-8 shrink-0" />
                <div className="grid gap-1 text-[10px] text-muted" style={{ gridTemplateColumns: "repeat(24, 0.72rem)" }}>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span key={hour} className="text-center">
                      {hour % 6 === 0 ? hour.toString().padStart(2, "0") : ""}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                {hourByDayTotals.map((row, dayIndex) => (
                  <div key={dayLabels[dayIndex]} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs text-muted">{dayLabels[dayIndex].slice(0, 3)}</span>
                    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(24, 0.72rem)" }}>
                      {row.map((value, hour) => {
                        const ratio = maxHeat > 0 ? value / maxHeat : 0;
                        const mixPercent = Math.round(12 + ratio * 82);
                        return (
                          <div
                            key={`${dayIndex}-${hour}`}
                            className="h-3 w-3 rounded-[3px] border border-theme"
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

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Work-time analysis & distribution</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Project time ratio / breakdown</p>
              <div className="space-y-2">
                {history.projectBreakdown.slice(0, 8).map((project) => (
                  <div key={project.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{project.label}</span>
                      <span>{formatSec(project.value)}</span>
                    </div>
                    <div className="surface-soft h-2 overflow-hidden rounded">
                      <div className="h-full rounded bg-accent" style={{ width: `${toPercent(project.value, projectMax)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Time-distribution report</p>
              <div className="space-y-2">
                {history.timeDistribution.map((bucket) => (
                  <div key={bucket.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{bucket.label}</span>
                      <span>{formatSec(bucket.value)}</span>
                    </div>
                    <div className="surface-soft h-2 overflow-hidden rounded">
                      <div className="h-full rounded bg-accent" style={{ width: `${toPercent(bucket.value, history.totalFocusSec || 1)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Task-completion analysis</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Completed to-do statistics</p>
              <div className="space-y-1 text-sm">
                <p>Total tasks: {history.completionSummary.total}</p>
                <p>Completed: {history.completionSummary.done}</p>
                <p>Open: {history.completionSummary.open}</p>
              </div>
            </div>
            <div className="rounded border border-theme p-2">
              <p className="mb-2 text-xs font-semibold uppercase text-muted">Trend chart for completed to-dos (30d)</p>
              <MiniLineChart points={history.completionTrend} />
            </div>
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <h2 className="text-sm font-semibold">Trend chart for focus time (30d)</h2>
          <div className="mt-2">
            <MiniLineChart points={history.dailyFocus} />
          </div>
        </section>

        <section className="mt-4 rounded border border-theme surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Gantt chart of focus time</h2>
            <input
              type="date"
              value={ganttDay}
              onChange={(event) => setGanttDay(event.target.value)}
              className="rounded border border-theme surface px-2 py-1 text-sm"
            />
          </div>
          <div className="mb-2 grid grid-cols-5 text-xs text-muted">
            <span>00:00</span>
            <span className="text-center">06:00</span>
            <span className="text-center">12:00</span>
            <span className="text-center">18:00</span>
            <span className="text-right">24:00</span>
          </div>
          {ganttSessions.length ? (
            <div className="space-y-2">
              {ganttSessions.map((session) => {
                const startMinutes = session.startAt.getHours() * 60 + session.startAt.getMinutes();
                const sameDay = format(session.endAt, "yyyy-MM-dd") === format(session.startAt, "yyyy-MM-dd");
                const endMinutesRaw = session.endAt.getHours() * 60 + session.endAt.getMinutes();
                const endMinutes = sameDay ? endMinutesRaw : 1440;
                const leftPct = (startMinutes / 1440) * 100;
                const widthPct = Math.max(0.8, ((endMinutes - startMinutes) / 1440) * 100);
                const task = session.taskId ? history.tasksById.get(session.taskId) : undefined;
                const label = task?.title ?? "Unlinked focus session";

                return (
                  <div key={session.id} className="rounded border border-theme p-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate">{label}</span>
                      <span>{formatSec(session.durationSec)}</span>
                    </div>
                    <div className="relative h-4 rounded border border-theme surface-soft">
                      <div
                        className="absolute top-0 h-full rounded bg-accent"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">No focus sessions found for this day.</p>
          )}
        </section>

        {!history.ready ? <p className="mt-4 text-sm text-muted">Loading historical analytics...</p> : null}
      </div>
    </main>
  );
}
