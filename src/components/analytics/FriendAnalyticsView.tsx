"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { TopAccentBar } from "@/components/planner/TopAccentBar";
import { PreferencesSidebar } from "@/components/planner/PreferencesSidebar";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { usePreferences } from "@/hooks/usePreferences";
import type { SharedStatsSnapshot, SocialUser } from "@/types/social";

const TOKEN_STORAGE_KEY = "cheqlist-google-access-token";

type ChartType = "bar" | "line";
type Point = { label: string; value: number };
type PeakScope = "average" | number;

function formatSec(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function toPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function toPoints(values: number[], kind: "daily" | "weekly" | "monthly"): Point[] {
  if (kind === "daily") {
    const start = subDays(new Date(), 29);
    return values.map((value, index) => ({ label: format(addDays(start, index), "MMM d"), value }));
  }
  if (kind === "weekly") {
    const start = subWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), 11);
    return values.map((value, index) => ({ label: format(addWeeks(start, index), "MMM d"), value }));
  }
  const start = subMonths(startOfMonth(new Date()), 11);
  return values.map((value, index) => ({ label: format(addMonths(start, index), "MMM"), value }));
}

function addWeeks(date: Date, amount: number): Date {
  return addDays(date, amount * 7);
}

function addMonths(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

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
                title={`${point.label}: ${formatSec(point.value)}`}
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

function buildHeatmap(snapshot: SharedStatsSnapshot) {
  const byDate = new Map(snapshot.year_heatmap_days.map((entry) => [entry.dateKey, entry.value]));
  const minDate = snapshot.year_heatmap_days[0]?.dateKey ?? `${new Date().getFullYear()}-01-01`;
  const maxDate = snapshot.year_heatmap_days[snapshot.year_heatmap_days.length - 1]?.dateKey ?? `${new Date().getFullYear()}-12-31`;

  const rangeStart = new Date(`${minDate}T00:00:00`);
  const rangeEnd = new Date(`${maxDate}T00:00:00`);
  const gridStart = startOfWeek(rangeStart, { weekStartsOn: 0 });
  const gridEnd = addDays(startOfWeek(rangeEnd, { weekStartsOn: 0 }), 6);

  const weeks: Array<Array<{ dateKey: string; value: number; inRange: boolean }>> = [];
  const monthTicks: Array<{ label: string; weekIndex: number }> = [];
  const yearTicks: Array<{ label: string; weekIndex: number }> = [];
  const seenMonth = new Set<string>();
  const seenYear = new Set<number>();

  let cursor = new Date(gridStart);
  let weekIndex = 0;
  while (cursor <= gridEnd) {
    const weekCells: Array<{ dateKey: string; value: number; inRange: boolean }> = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(cursor, day);
      const dateKey = format(date, "yyyy-MM-dd");
      const inRange = date >= rangeStart && date <= rangeEnd;
      const value = byDate.get(dateKey) ?? 0;
      weekCells.push({ dateKey, value, inRange });

      if (date.getDate() === 1 && inRange) {
        const monthKey = format(date, "yyyy-MM");
        if (!seenMonth.has(monthKey)) {
          seenMonth.add(monthKey);
          monthTicks.push({ label: format(date, "MMM"), weekIndex });
        }
        if (date.getMonth() === 0 && !seenYear.has(date.getFullYear())) {
          seenYear.add(date.getFullYear());
          yearTicks.push({ label: String(date.getFullYear()), weekIndex });
        }
      }
    }
    weeks.push(weekCells);
    cursor = addDays(cursor, 7);
    weekIndex += 1;
  }

  return { weeks, monthTicks, yearTicks };
}

export function FriendAnalyticsView({ userId }: { userId: string }) {
  const { preferences, patchPreferences } = usePreferences();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [user, setUser] = useState<SocialUser | null>(null);
  const [stats, setStats] = useState<SharedStatsSnapshot | null>(null);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [peakScope, setPeakScope] = useState<PeakScope>(6);
  const [selectedHeatCell, setSelectedHeatCell] = useState<{ dateKey: string; value: number } | null>(null);
  const [chartTooltip, setChartTooltip] = useState<{ x: number; y: number; label: string; value: string; placement: "above" | "below" } | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(event.target as Node)) return;
      setPrefsOpen(false);
      setAccountOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setError("Sign in with Google first.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void fetch(`/api/social/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        return (await res.json()) as { user: SocialUser; stats: SharedStatsSnapshot | null; can_view_stats: boolean };
      })
      .then((payload) => {
        if (cancelled) return;
        setUser(payload.user);
        setStats(payload.can_view_stats ? payload.stats : null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load friend profile.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const heatmap = useMemo(() => (stats ? buildHeatmap(stats) : null), [stats]);
  const maxYearHeat = useMemo(() => {
    if (!heatmap) return 1;
    const values = heatmap.weeks.flat().filter((cell) => cell.inRange).map((cell) => cell.value);
    return Math.max(...values, 1);
  }, [heatmap]);

  const recentDaily = useMemo(() => {
    if (!stats?.daily_totals_30d?.length) {
      return Array.from({ length: 7 }, (_, index) => ({ day: subDays(new Date(), 6 - index), value: 0 }));
    }
    const slice = stats.daily_totals_30d.slice(-7);
    const start = subDays(new Date(), slice.length - 1);
    return slice.map((value, index) => ({ day: addDays(start, index), value }));
  }, [stats?.daily_totals_30d]);
  const maxRecentDaily = useMemo(
    () => Math.max(...recentDaily.map((entry) => entry.value), 1),
    [recentDaily],
  );
  const hourTotals = stats?.hour_totals_24 ?? Array.from({ length: 24 }, () => 0);
  const selectedHourTotals = useMemo(() => {
    if (peakScope === "average") return hourTotals;
    const selectedDaily = recentDaily[peakScope]?.value ?? 0;
    const avgDaily = recentDaily.reduce((sum, entry) => sum + entry.value, 0) / Math.max(1, recentDaily.length);
    if (avgDaily <= 0) return hourTotals;
    const scale = selectedDaily / avgDaily;
    return hourTotals.map((value) => Math.max(0, Math.round(value * scale)));
  }, [hourTotals, peakScope, recentDaily]);
  const maxHour = useMemo(() => Math.max(...selectedHourTotals, 1), [selectedHourTotals]);
  const selectedPeakLabel = useMemo(() => {
    if (peakScope === "average") return "Average (last 7 days)";
    const selected = recentDaily[peakScope];
    if (!selected) return "Average (last 7 days)";
    return format(selected.day, "EEE, MMM d");
  }, [peakScope, recentDaily]);
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

  useEffect(() => {
    setPeakScope(Math.max(0, recentDaily.length - 1));
  }, [recentDaily.length]);

  if (loading) {
    return <main className="app-shell min-h-[100dvh] p-4">Loading friend analytics...</main>;
  }

  return (
    <main
      data-theme={preferences.theme}
      data-accent={preferences.accentColor}
      data-text-size={preferences.textSize}
      data-spacing={preferences.spacing}
      data-columns={preferences.columns}
      className="app-shell min-h-[100dvh]"
      style={{ "--custom-color": "#5a7fb8", "--custom-color-highlight": "#4c72ad" } as CSSProperties}
    >
      <TopAccentBar
        mode="analytics"
        rangeLabel={user ? `Friend analytics: @${user.username}` : "Friend analytics"}
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
        {error ? <section className="rounded border border-theme surface p-3 text-sm text-red-400">{error}</section> : null}
        {!error && !stats ? (
          <section className="rounded border border-theme surface p-3 text-sm text-muted">
            This user does not share analytics with you right now.
          </section>
        ) : null}

        {!error && stats ? (
          <>
            <section className="rounded border border-theme surface p-3">
              <h2 className="text-sm font-semibold">{user?.display_name ?? `@${user?.username ?? ""}`}</h2>
              <p className="mt-1 text-xs text-muted">@{user?.username}</p>
            </section>

            <section className="mt-4 rounded border border-theme surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Daily totals</h2>
                <button
                  type="button"
                  className={`ui-chip-btn rounded border px-2 py-1 ${peakScope === "average" ? "border-[var(--custom-color)] text-[var(--custom-color)]" : "border-theme"}`}
                  onClick={() => setPeakScope("average")}
                >
                  Average
                </button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-7">
                {recentDaily.map((entry, index) => (
                  <button
                    key={`${entry.day.toISOString()}-${index}`}
                    type="button"
                    className={`rounded border p-2 text-left ${peakScope === index ? "border-[var(--custom-color)]" : "border-theme"}`}
                    onClick={() => setPeakScope(index)}
                  >
                    <p className="text-xs text-muted">{format(entry.day, "EEE")}</p>
                    <div className="surface-soft mt-1 h-2 w-full overflow-hidden rounded">
                      <div className="h-full rounded bg-accent transition-[width] duration-300" style={{ width: `${toPercent(entry.value, maxRecentDaily)}%` }} />
                    </div>
                    <p className="mt-1 font-medium">{formatSec(entry.value)}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded border border-theme surface p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Peak Hour Chart</h2>
                <div className="inline-flex overflow-hidden rounded border border-theme">
                  <button
                    type="button"
                    className={chartType === "bar" ? "ui-chip-btn bg-accent px-2 py-1 text-white" : "ui-chip-btn surface px-2 py-1"}
                    onClick={() => setChartType("bar")}
                  >
                    Bar
                  </button>
                  <button
                    type="button"
                    className={chartType === "line" ? "ui-chip-btn bg-accent px-2 py-1 text-white" : "ui-chip-btn surface px-2 py-1"}
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
                      {selectedHourTotals.map((sec, hour) => (
                        <div key={hour} className="flex min-w-0 items-end justify-center">
                          <div
                            className="w-full rounded-t-[3px] bg-accent transition-[height] duration-300"
                            style={{ height: `${Math.max(4, Math.round(toPercent(sec, maxHour) * 1.76))}px` }}
                            title={`${hour.toString().padStart(2, "0")}:00 - ${formatSec(sec)}`}
                            onMouseEnter={(event) => {
                              if (!chartRef.current) return;
                              const containerRect = chartRef.current.getBoundingClientRect();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const y = rect.top - containerRect.top;
                              setChartTooltip({
                                x: rect.left + rect.width / 2 - containerRect.left,
                                y,
                                label: `${hour.toString().padStart(2, "0")}:00`,
                                value: formatSec(sec),
                                placement: y < 40 ? "below" : "above",
                              });
                            }}
                            onMouseLeave={() => setChartTooltip(null)}
                          />
                        </div>
                      ))}
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
                          <circle key={point.hour} cx={point.x} cy={point.y} r="4.8" fill="var(--app-background)" stroke="var(--custom-color)" strokeWidth="2" />
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

            {heatmap ? (
              <section className="mt-4 rounded border border-theme surface p-3">
                <h2 className="text-sm font-semibold">Focus heat map</h2>
                <div className="mt-3 overflow-x-auto">
                  <div className="inline-block" style={{ minWidth: `max(100%, ${heatmap.weeks.length * 14 + 120}px)` }}>
                    <div className="mb-1 flex items-end gap-2">
                      <div className="w-8 shrink-0" />
                      <div className="grid gap-1 text-[10px] font-medium text-muted" style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 0.78rem)` }}>
                        {heatmap.monthTicks.map((month) => (
                          <span key={`${month.label}-${month.weekIndex}`} style={{ gridColumnStart: month.weekIndex + 1 }}>
                            {month.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday, dayIndex) => (
                      <div key={weekday} className="mb-1 flex items-center gap-2">
                        <span className="w-8 shrink-0 text-xs text-muted">{weekday}</span>
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, 0.78rem)` }}>
                          {heatmap.weeks.map((week, weekIndex) => {
                            const cell = week[dayIndex];
                            const ratio = maxYearHeat > 0 ? cell.value / maxYearHeat : 0;
                            const redMix = Math.max(14, Math.round(10 + ratio * 64));
                            const isSelected = selectedHeatCell?.dateKey === cell.dateKey;
                            return (
                              <button
                                key={`${weekIndex}-${dayIndex}`}
                                type="button"
                                className={`h-[0.8rem] w-[0.8rem] rounded-[3px] border border-theme ${isSelected ? "ring-1 ring-[var(--custom-color)]" : ""}`}
                                style={{
                                  backgroundColor: cell.inRange
                                    ? cell.value > 0
                                      ? `color-mix(in oklab, var(--custom-color) ${redMix}%, var(--app-background))`
                                      : "color-mix(in oklab, #8f959d 34%, var(--app-background))"
                                    : "var(--ui-button-bg-alt)",
                                  opacity: cell.inRange ? 1 : 0.35,
                                }}
                                onClick={() => setSelectedHeatCell({ dateKey: cell.dateKey, value: cell.value })}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {selectedHeatCell ? `${selectedHeatCell.dateKey} - ${formatSec(selectedHeatCell.value)}` : "Click a cell to view the exact day and focus time."}
                </p>
              </section>
            ) : null}

            <section className="mt-4 rounded border border-theme surface p-3">
              <h2 className="text-sm font-semibold">Historical statistics</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-4">
                <div className="rounded border border-theme p-2">
                  <p className="text-xs text-muted">Total focus time</p>
                  <p className="text-lg font-semibold">{formatSec(stats.total_focus_minutes_all_time * 60)}</p>
                </div>
                <div className="rounded border border-theme p-2">
                  <p className="text-xs text-muted">Focus time (7d)</p>
                  <p className="text-lg font-semibold">{formatSec(stats.total_focus_minutes_7d * 60)}</p>
                </div>
                <div className="rounded border border-theme p-2">
                  <p className="text-xs text-muted">Pomodoros (30d)</p>
                  <p className="text-lg font-semibold">{stats.pomodoros_completed_30d}</p>
                </div>
                <div className="rounded border border-theme p-2">
                  <p className="text-xs text-muted">Longest streak</p>
                  <p className="text-lg font-semibold">{stats.longest_streak_days} days</p>
                </div>
              </div>
            </section>

            <section className="mt-4 rounded border border-theme surface p-3">
              <h2 className="text-sm font-semibold">Daily / Weekly / Monthly time stats</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="rounded border border-theme p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">Daily (30d)</p>
                  <MiniBarChart points={toPoints(stats.daily_totals_30d ?? [], "daily")} />
                </div>
                <div className="rounded border border-theme p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">Weekly (12w)</p>
                  <MiniBarChart points={toPoints(stats.weekly_totals_12w ?? [], "weekly")} />
                </div>
                <div className="rounded border border-theme p-2">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted">Monthly (12m)</p>
                  <MiniBarChart points={toPoints(stats.monthly_totals_12m ?? [], "monthly")} />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
