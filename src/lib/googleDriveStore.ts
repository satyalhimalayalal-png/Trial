"use client";

import { getDb } from "@/lib/db/dexie";
import type { FocusSession, PlannerList, RecurrenceSeries, Task, UserPreferences } from "@/types/domain";

export interface PlannerBackupV1 {
  version: 1;
  exportedAt: string;
  data: {
    tasks: Task[];
    lists: PlannerList[];
    preferences: UserPreferences[];
    recurrenceSeries: RecurrenceSeries[];
    focusSessions: FocusSession[];
  };
}

export async function exportPlannerBackup(): Promise<PlannerBackupV1> {
  const db = getDb();
  const [tasks, lists, preferences, recurrenceSeries, focusSessions] = await Promise.all([
    db.tasks.toArray(),
    db.lists.toArray(),
    db.preferences.toArray(),
    db.recurrenceSeries.toArray(),
    db.focusSessions.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { tasks, lists, preferences, recurrenceSeries, focusSessions },
  };
}

export async function importPlannerBackup(payload: PlannerBackupV1): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.tasks.clear(),
    db.lists.clear(),
    db.preferences.clear(),
    db.recurrenceSeries.clear(),
    db.focusSessions.clear(),
  ]);

  if (payload.data.tasks.length) await db.tasks.bulkPut(payload.data.tasks);
  if (payload.data.lists.length) await db.lists.bulkPut(payload.data.lists);
  if (payload.data.preferences.length) await db.preferences.bulkPut(payload.data.preferences);
  if (payload.data.recurrenceSeries.length) await db.recurrenceSeries.bulkPut(payload.data.recurrenceSeries);
  if (payload.data.focusSessions.length) await db.focusSessions.bulkPut(payload.data.focusSessions);
}

export function getBackupTimestamp(payload: PlannerBackupV1): number {
  const fromExport = Date.parse(payload.exportedAt);
  if (!Number.isNaN(fromExport)) return fromExport;
  return 0;
}
