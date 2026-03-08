"use client";

import { useEffect, useMemo, useState } from "react";
import { startFocusSession, stopFocusSession } from "@/lib/db/repos/focusRepo";
import { useFocusStore } from "@/state/useFocusStore";

export function useFocusTimer() {
  const [nowMs, setNowMs] = useState(0);
  const activeSessionId = useFocusStore((state) => state.activeSessionId);
  const activeStartedAt = useFocusStore((state) => state.activeStartedAt);
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

  return {
    active: Boolean(activeSessionId && activeStartedAt),
    elapsedSec,
    start: async (taskId?: string) => {
      if (activeSessionId) return;
      const session = await startFocusSession(taskId);
      setNowMs(new Date(session.startAt).getTime());
      setActive(session.id, session.startAt, taskId);
    },
    stop: async () => {
      if (!activeSessionId) return;
      await stopFocusSession(activeSessionId);
      clearActive();
    },
  };
}
