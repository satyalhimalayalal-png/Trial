"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { ensureDefaultLists } from "@/lib/db/seeds";
import { sortByOrder } from "@/lib/domain/ordering";
import { syncDailyResetLists } from "@/lib/db/repos/listsRepo";
import type { ContainerRef, PlannerList, Task } from "@/types/domain";

const db = getDb();

function groupTasksByContainer(tasks: Task[]): Record<string, Task[]> {
  const grouped: Record<string, Task[]> = {};

  for (const task of tasks) {
    const key = `${task.containerType}:${task.containerId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(task);
  }

  for (const key of Object.keys(grouped)) {
    grouped[key] = sortByOrder(grouped[key]);
  }

  return grouped;
}

export function usePlannerBoard() {
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let mounted = true;

    void ensureDefaultLists().finally(() => {
      if (mounted) setSeeded(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncRecurringLists = () => {
      if (cancelled) return;
      void syncDailyResetLists();
    };

    syncRecurringLists();

    const onFocus = () => syncRecurringLists();
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncRecurringLists();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const intervalId = window.setInterval(syncRecurringLists, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(intervalId);
    };
  }, []);

  const lists = useLiveQuery<PlannerList[]>(
    async () => db.lists.filter((list) => !list.archived).sortBy("order"),
    [],
  );

  const tasks = useLiveQuery<Task[]>(
    async () => {
      const rows = await db.tasks.toArray();
      return sortByOrder(rows);
    },
    [],
  );

  const tasksByContainer = useMemo(() => groupTasksByContainer(tasks ?? []), [tasks]);

  const getTasksForContainer = (container: ContainerRef): Task[] =>
    tasksByContainer[`${container.containerType}:${container.containerId}`] ?? [];

  return {
    lists: lists ?? [],
    tasks: tasks ?? [],
    getTasksForContainer,
    tasksByContainer,
    ready: seeded && Boolean(lists) && Boolean(tasks),
  };
}
