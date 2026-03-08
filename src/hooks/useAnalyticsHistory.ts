"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { useFocusStore } from "@/state/useFocusStore";
import type { Task } from "@/types/domain";

const db = getDb();

interface Point {
  label: string;
  value: number;
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
    tasksById,
    listsById,
  };
}
