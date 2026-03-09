"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { PLANNER_DATA_CHANGED_EVENT } from "@/lib/sync/realtimeSyncSignal";
import { useFocusStore } from "@/state/useFocusStore";
import type { Task } from "@/types/domain";

const db = getDb();

interface Point {
  label: string;
  value: number;
}

interface YearHeatCell {
  dateKey: string;
  value: number;
  inRange: boolean;
}

function forEachDaySlice(
  startMs: number,
  endMs: number,
  onSlice: (sliceStartMs: number, sliceEndMs: number) => void,
): void {
  let cursor = startMs;
  while (cursor < endMs) {
    const nextDay = new Date(cursor);
    nextDay.setHours(24, 0, 0, 0);
    const sliceEnd = Math.min(nextDay.getTime(), endMs);
    onSlice(cursor, sliceEnd);
    cursor = sliceEnd;
  }
}

export function useAnalyticsHistory() {
  const [nowTick, setNowTick] = useState(Date.now());
  const lastSocialSyncHashRef = useRef<string>("");
  const socialSyncTimerRef = useRef<number | null>(null);
  const activeSessionId = useFocusStore((state) => state.activeSessionId);
  const activeStartedAt = useFocusStore((state) => state.activeStartedAt);
  const activeTaskId = useFocusStore((state) => state.activeTaskId);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sessions = useLiveQuery(async () => db.focusSessions.toArray(), [], []);
  const tasks = useLiveQuery(async () => db.tasks.toArray(), [], []);
  const lists = useLiveQuery(async () => db.lists.toArray(), [], []);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks ?? []) map.set(task.id, task);
    return map;
  }, [tasks]);

  const listsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of lists ?? []) map.set(list.id, list.name);
    return map;
  }, [lists]);

  const withRealtime = useMemo(() => {
    const base = [...(sessions ?? [])].filter((session) => session.id !== activeSessionId);
    if (activeSessionId && activeStartedAt) {
      base.push({
        id: activeSessionId,
        taskId: activeTaskId ?? undefined,
        startAt: activeStartedAt,
        durationSec: Math.floor((nowTick - new Date(activeStartedAt).getTime()) / 1000),
        dayKey: format(startOfDay(new Date(activeStartedAt)), "yyyy-MM-dd"),
        weekKey: format(startOfWeek(new Date(activeStartedAt), { weekStartsOn: 0 }), "yyyy-MM-dd"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        createdAt: activeStartedAt,
        updatedAt: new Date(nowTick).toISOString(),
      });
    }
    return base;
  }, [sessions, activeSessionId, activeStartedAt, activeTaskId, nowTick]);

  const totalFocusSec = useMemo(() => {
    return withRealtime.reduce((sum, session) => sum + Math.max(0, session.durationSec ?? 0), 0);
  }, [withRealtime]);

  const dayTotalsMap = useMemo(() => {
    const totals = new Map<string, number>();
    for (const session of withRealtime) {
      const durationSec = Math.max(0, session.durationSec ?? 0);
      if (durationSec <= 0) continue;
      const startMs = new Date(session.startAt).getTime();
      const endMs = startMs + durationSec * 1000;
      forEachDaySlice(startMs, endMs, (sliceStartMs, sliceEndMs) => {
        const key = format(new Date(sliceStartMs), "yyyy-MM-dd");
        totals.set(key, (totals.get(key) ?? 0) + (sliceEndMs - sliceStartMs) / 1000);
      });
    }
    return totals;
  }, [withRealtime]);

  const dailyFocus = useMemo<Point[]>(() => {
    const start = subDays(startOfDay(new Date()), 29);
    return Array.from({ length: 30 }, (_, i) => {
      const day = addDays(start, i);
      const key = format(day, "yyyy-MM-dd");
      return { label: format(day, "MMM d"), value: dayTotalsMap.get(key) ?? 0 };
    });
  }, [dayTotalsMap]);

  const weeklyFocus = useMemo<Point[]>(() => {
    const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return Array.from({ length: 12 }, (_, i) => {
      const weekStart = subWeeks(currentWeekStart, 11 - i);
      let total = 0;
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const dayKey = format(addDays(weekStart, dayIndex), "yyyy-MM-dd");
        total += dayTotalsMap.get(dayKey) ?? 0;
      }
      return { label: format(weekStart, "MMM d"), value: total };
    });
  }, [dayTotalsMap]);

  const monthlyFocus = useMemo<Point[]>(() => {
    const currentMonthStart = startOfMonth(new Date());
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = subMonths(currentMonthStart, 11 - i);
      const monthKey = format(monthStart, "yyyy-MM");
      let total = 0;
      for (const [dayKey, sec] of dayTotalsMap.entries()) {
        if (dayKey.startsWith(monthKey)) total += sec;
      }
      return { label: format(monthStart, "MMM"), value: total };
    });
  }, [dayTotalsMap]);

  const yearHeatmap = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const rangeStart = new Date(currentYear - 1, 0, 1);
    const rangeEnd = new Date(currentYear + 1, 11, 31);
    const gridStart = startOfWeek(rangeStart, { weekStartsOn: 0 });
    const gridEnd = addDays(startOfWeek(rangeEnd, { weekStartsOn: 0 }), 6);

    const weeks: YearHeatCell[][] = [];
    const monthTicks: Array<{ label: string; weekIndex: number }> = [];
    const yearTicks: Array<{ label: string; weekIndex: number }> = [];
    const seenMonth = new Set<string>();
    const seenYear = new Set<number>();

    let cursor = new Date(gridStart);
    let weekIndex = 0;
    while (cursor <= gridEnd) {
      const weekCells: YearHeatCell[] = [];
      for (let day = 0; day < 7; day += 1) {
        const date = addDays(cursor, day);
        const dateKey = format(date, "yyyy-MM-dd");
        const inRange = date >= rangeStart && date <= rangeEnd;
        weekCells.push({
          dateKey,
          value: dayTotalsMap.get(dateKey) ?? 0,
          inRange,
        });

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
  }, [dayTotalsMap]);

  const completedTasks = useMemo(() => (tasks ?? []).filter((task) => task.completed), [tasks]);

  const completionTrend = useMemo<Point[]>(() => {
    const start = subDays(startOfDay(new Date()), 29);
    const totals = new Map<string, number>();
    for (const task of completedTasks) {
      const key = format(new Date(task.updatedAt), "yyyy-MM-dd");
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return Array.from({ length: 30 }, (_, i) => {
      const day = addDays(start, i);
      const key = format(day, "yyyy-MM-dd");
      return { label: format(day, "MMM d"), value: totals.get(key) ?? 0 };
    });
  }, [completedTasks]);

  const completionSummary = useMemo(() => {
    const total = (tasks ?? []).length;
    const done = completedTasks.length;
    return {
      total,
      done,
      open: Math.max(0, total - done),
      rate: total > 0 ? (done / total) * 100 : 0,
    };
  }, [tasks, completedTasks]);

  const projectBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const session of withRealtime) {
      const sec = Math.max(0, session.durationSec ?? 0);
      if (sec <= 0) continue;

      const task = session.taskId ? tasksById.get(session.taskId) : undefined;
      let label = "Unlinked";
      if (task?.containerType === "LIST") label = listsById.get(task.containerId) ?? "List";
      if (task?.containerType === "DAY") label = "Daily Plan";
      totals.set(label, (totals.get(label) ?? 0) + sec);
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [withRealtime, tasksById, listsById]);

  const timeDistribution = useMemo(() => {
    const ranges = [
      { label: "00-05", from: 0, to: 6, value: 0 },
      { label: "06-11", from: 6, to: 12, value: 0 },
      { label: "12-17", from: 12, to: 18, value: 0 },
      { label: "18-23", from: 18, to: 24, value: 0 },
    ];

    for (const session of withRealtime) {
      const sec = Math.max(0, session.durationSec ?? 0);
      if (sec <= 0) continue;
      const hour = new Date(session.startAt).getHours();
      const bucket = ranges.find((range) => hour >= range.from && hour < range.to);
      if (bucket) bucket.value += sec;
    }

    return ranges.map((range) => ({ label: range.label, value: range.value }));
  }, [withRealtime]);

  const hourTotals24 = useMemo(() => {
    const totals = Array.from({ length: 24 }, () => 0);
    for (const session of withRealtime) {
      const sec = Math.max(0, session.durationSec ?? 0);
      if (sec <= 0) continue;
      const hour = new Date(session.startAt).getHours();
      totals[hour] += sec;
    }
    return totals;
  }, [withRealtime]);

  const sessionsForGantt = useMemo(() => {
    return withRealtime
      .map((session) => {
        const sec = Math.max(0, session.durationSec ?? 0);
        const start = new Date(session.startAt);
        const end = new Date(start.getTime() + sec * 1000);
        return {
          id: session.id,
          dayKey: format(start, "yyyy-MM-dd"),
          startAt: start,
          endAt: end,
          durationSec: sec,
          taskId: session.taskId,
        };
      })
      .filter((session) => session.durationSec > 0)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [withRealtime]);

  const sharedSnapshot = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const dayToSec = (dayOffset: number) => {
      const key = format(subDays(today, dayOffset), "yyyy-MM-dd");
      return dayTotalsMap.get(key) ?? 0;
    };

    let focus7Sec = 0;
    let focus30Sec = 0;
    for (let i = 0; i < 7; i += 1) focus7Sec += dayToSec(i);
    for (let i = 0; i < 30; i += 1) focus30Sec += dayToSec(i);

    const sessionWithDuration = withRealtime.filter((session) => Math.max(0, session.durationSec ?? 0) > 0);
    const sevenDaysAgoMs = subDays(today, 6).getTime();
    const thirtyDaysAgoMs = subDays(today, 29).getTime();
    const pomodoros7 = sessionWithDuration.filter((session) => new Date(session.startAt).getTime() >= sevenDaysAgoMs).length;
    const pomodoros30 = sessionWithDuration.filter((session) => new Date(session.startAt).getTime() >= thirtyDaysAgoMs).length;

    const activeDaySet = new Set(
      [...dayTotalsMap.entries()].filter(([, sec]) => sec > 0).map(([dayKey]) => dayKey),
    );

    let currentStreak = 0;
    for (let i = 0; ; i += 1) {
      const key = format(subDays(today, i), "yyyy-MM-dd");
      if (!activeDaySet.has(key)) break;
      currentStreak += 1;
    }

    const sortedDays = [...activeDaySet].sort();
    let longestStreak = 0;
    let running = 0;
    let prevDay: Date | null = null;
    for (const key of sortedDays) {
      const currentDay = new Date(`${key}T00:00:00`);
      if (!prevDay) {
        running = 1;
      } else {
        const diffDays = Math.round((currentDay.getTime() - prevDay.getTime()) / (24 * 60 * 60 * 1000));
        running = diffDays === 1 ? running + 1 : 1;
      }
      if (running > longestStreak) longestStreak = running;
      prevDay = currentDay;
    }

    const lastActiveSession = sessionWithDuration
      .map((session) => {
        const startMs = new Date(session.startAt).getTime();
        const endMs = startMs + Math.max(0, session.durationSec ?? 0) * 1000;
        return endMs;
      })
      .sort((a, b) => b - a)[0];

    const yearHeatmapDays = historyYearHeatmapToDays(yearHeatmap.weeks);

    return {
      total_focus_minutes_7d: Math.round(focus7Sec / 60),
      total_focus_minutes_30d: Math.round(focus30Sec / 60),
      total_focus_minutes_all_time: Math.round(totalFocusSec / 60),
      pomodoros_completed_7d: pomodoros7,
      pomodoros_completed_30d: pomodoros30,
      current_streak_days: currentStreak,
      longest_streak_days: longestStreak,
      hour_totals_24: hourTotals24.map((value) => Math.round(value)),
      daily_totals_30d: dailyFocus.map((point) => Math.round(point.value)),
      weekly_totals_12w: weeklyFocus.map((point) => Math.round(point.value)),
      monthly_totals_12m: monthlyFocus.map((point) => Math.round(point.value)),
      year_heatmap_days: yearHeatmapDays,
      last_active_at: lastActiveSession ? new Date(lastActiveSession).toISOString() : null,
    };
  }, [dayTotalsMap, totalFocusSec, withRealtime, hourTotals24, dailyFocus, weeklyFocus, monthlyFocus, yearHeatmap.weeks]);

  const sharedSnapshotRef = useRef(sharedSnapshot);
  useEffect(() => {
    sharedSnapshotRef.current = sharedSnapshot;
  }, [sharedSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const runSnapshotSync = () => {
      const accessToken = localStorage.getItem("cheqlist-google-access-token");
      if (!accessToken) return;
      const snapshot = sharedSnapshotRef.current;
      const hash = JSON.stringify(snapshot);
      if (hash === lastSocialSyncHashRef.current) return;

      void fetch("/api/social/snapshot", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot),
      })
        .then((response) => {
          if (!response.ok || cancelled) return;
          lastSocialSyncHashRef.current = hash;
        })
        .catch(() => {
          // avoid breaking analytics UI on social snapshot sync failures
        });
    };

    const scheduleSnapshotSync = (delayMs = 250) => {
      if (socialSyncTimerRef.current) {
        window.clearTimeout(socialSyncTimerRef.current);
      }
      socialSyncTimerRef.current = window.setTimeout(() => {
        socialSyncTimerRef.current = null;
        runSnapshotSync();
      }, delayMs);
    };

    const onDataChanged = () => scheduleSnapshotSync(250);
    const onVisibility = () => {
      if (document.visibilityState === "visible") scheduleSnapshotSync(0);
    };
    const onOnline = () => scheduleSnapshotSync(0);

    scheduleSnapshotSync(0);
    window.addEventListener(PLANNER_DATA_CHANGED_EVENT, onDataChanged as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (socialSyncTimerRef.current) {
        window.clearTimeout(socialSyncTimerRef.current);
        socialSyncTimerRef.current = null;
      }
      window.removeEventListener(PLANNER_DATA_CHANGED_EVENT, onDataChanged as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return {
    ready: Boolean(sessions && tasks && lists),
    totalFocusSec,
    dailyFocus,
    weeklyFocus,
    monthlyFocus,
    completionTrend,
    completionSummary,
    projectBreakdown,
    timeDistribution,
    sessionsForGantt,
    yearHeatmap,
    tasksById,
    listsById,
  };
}

function historyYearHeatmapToDays(
  weeks: Array<Array<{ dateKey: string; value: number; inRange: boolean }>>,
): Array<{ dateKey: string; value: number }> {
  const byDate = new Map<string, number>();
  for (const week of weeks) {
    for (const cell of week) {
      if (!cell.inRange) continue;
      byDate.set(cell.dateKey, Math.round(cell.value));
    }
  }
  return [...byDate.entries()]
    .map(([dateKey, value]) => ({ dateKey, value }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
