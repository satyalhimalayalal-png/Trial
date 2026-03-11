"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { discardFocusSession, startFocusSession, stopFocusSession } from "@/lib/db/repos/focusRepo";
import { useFocusStore, type FocusTimerSource } from "@/state/useFocusStore";

export function useFocusTimer() {
  const [nowMs, setNowMs] = useState(0);
  const activeSessionId = useFocusStore((state) => state.activeSessionId);
  const activeStartedAt = useFocusStore((state) => state.activeStartedAt);
  const activeSource = useFocusStore((state) => state.activeSource);
  const setActive = useFocusStore((state) => state.setActive);
  const clearActive = useFocusStore((state) => state.clearActive);

  useEffect(() => {
    if (!activeStartedAt) return;

    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeStartedAt]);

  const elapsedSec = useMemo(() => {
    if (!activeStartedAt) return 0;
    if (nowMs === 0) return 0;
    return Math.max(0, Math.floor((nowMs - new Date(activeStartedAt).getTime()) / 1000));
  }, [activeStartedAt, nowMs]);

  const start = useCallback(
    async (taskId?: string, source?: FocusTimerSource) => {
      if (activeSessionId) return;
      const session = await startFocusSession(taskId);
      setNowMs(new Date(session.startAt).getTime());
      setActive(session.id, session.startAt, taskId, source);
    },
    [activeSessionId, setActive],
  );

  const stop = useCallback(async () => {
    if (!activeSessionId) return;
    await stopFocusSession(activeSessionId);
    clearActive();
  }, [activeSessionId, clearActive]);

  const discard = useCallback(async () => {
    if (!activeSessionId) return;
    await discardFocusSession(activeSessionId);
    clearActive();
  }, [activeSessionId, clearActive]);

  return {
    active: Boolean(activeSessionId && activeStartedAt),
    elapsedSec,
    source: activeSource,
    start,
    stop,
    discard,
  };
}
