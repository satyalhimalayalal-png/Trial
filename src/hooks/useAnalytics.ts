"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addWeeks, format, startOfDay, startOfWeek } from "date-fns";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { useFocusStore } from "@/state/useFocusStore";

const db = getDb();

function weekKey(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), "yyyy-MM-dd");
}

function forEachHourSlice(
  startMs: number,
  endMs: number,
  onSlice: (sliceStartMs: number, sliceEndMs: number) => void,
): void {
  let cursor = startMs;
  while (cursor < endMs) {
    const nextHour = new Date(cursor);
    nextHour.setMinutes(0, 0, 0);
    nextHour.setHours(nextHour.getHours() + 1);
    const sliceEnd = Math.min(nextHour.getTime(), endMs);
    onSlice(cursor, sliceEnd);
    cursor = sliceEnd;
  }
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

export function useAnalyticsWeek() {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [nowTick, setNowTick] = useState(Date.now());

  const activeSessionId = useFocusStore((state) => state.activeSessionId);
  const activeStartedAt = useFocusStore((state) => state.activeStartedAt);
  const previousCurrentWeekKey = useRef(weekKey(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const latestCurrentKey = weekKey(new Date());
      const viewedKey = weekKey(weekStart);
      if (viewedKey === previousCurrentWeekKey.current && latestCurrentKey !== previousCurrentWeekKey.current) {
        setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
      }
      previousCurrentWeekKey.current = latestCurrentKey;
    }, 60_000);

    return () => window.clearInterval(id);
  }, [weekStart]);

  const key = weekKey(weekStart);
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;

  const sessions = useLiveQuery(async () => db.focusSessions.where("weekKey").equals(key).toArray(), [key], []);

  const withRealtime = useMemo(() => {
    const base = [...(sessions ?? [])];
    if (activeSessionId && activeStartedAt && weekKey(new Date(activeStartedAt)) === key) {
      base.push({
        id: activeSessionId,
        startAt: activeStartedAt,
        durationSec: Math.floor((nowTick - new Date(activeStartedAt).getTime()) / 1000),
        dayKey: format(startOfDay(new Date(activeStartedAt)), "yyyy-MM-dd"),
        weekKey: key,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        createdAt: activeStartedAt,
        updatedAt: new Date(nowTick).toISOString(),
      });
    }
    return base;
  }, [sessions, activeSessionId, activeStartedAt, nowTick, key]);

  const dailyTotals = useMemo(() => {
    const totals: number[] = Array.from({ length: 7 }, () => 0);
    for (const session of withRealtime) {
      const durationSec = Math.max(0, session.durationSec ?? 0);
      if (durationSec <= 0) continue;

      const startMs = new Date(session.startAt).getTime();
      const endMs = startMs + durationSec * 1000;
      const clampedStart = Math.max(startMs, weekStartMs);
      const clampedEnd = Math.min(endMs, weekEndMs);
      if (clampedStart >= clampedEnd) continue;

      forEachDaySlice(clampedStart, clampedEnd, (sliceStartMs, sliceEndMs) => {
        const dayIndex = Math.floor((sliceStartMs - weekStartMs) / (24 * 60 * 60 * 1000));
        if (dayIndex < 0 || dayIndex > 6) return;
        totals[dayIndex] += (sliceEndMs - sliceStartMs) / 1000;
      });
    }
    return totals;
  }, [withRealtime, weekStartMs, weekEndMs]);

  const hourTotals = useMemo(() => {
    const hours = Array.from({ length: 24 }, () => 0);
    for (const session of withRealtime) {
      const durationSec = Math.max(0, session.durationSec ?? 0);
      if (durationSec <= 0) continue;

      const startMs = new Date(session.startAt).getTime();
      const endMs = startMs + durationSec * 1000;
      const clampedStart = Math.max(startMs, weekStartMs);
      const clampedEnd = Math.min(endMs, weekEndMs);
      if (clampedStart >= clampedEnd) continue;

      forEachHourSlice(clampedStart, clampedEnd, (sliceStartMs, sliceEndMs) => {
        const hour = new Date(sliceStartMs).getHours();
        hours[hour] += (sliceEndMs - sliceStartMs) / 1000;
      });
    }
    return hours;
  }, [withRealtime, weekStartMs, weekEndMs]);

  return {
    weekStart,
    dailyTotals,
    hourTotals,
    prevWeek: () => setWeekStart((prev) => addWeeks(prev, -1)),
    nextWeek: () => setWeekStart((prev) => addWeeks(prev, 1)),
  };
}
