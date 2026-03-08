import { getDb } from "@/lib/db/dexie";

interface BackupPayload {
  version: 2;
  exportedAt: string;
  data: {
    tasks: unknown[];
    lists: unknown[];
    preferences: unknown[];
    recurrenceSeries: unknown[];
    focusSessions: unknown[];
  };
}

export async function exportBackup(): Promise<BackupPayload> {
  const db = getDb();
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: await db.tasks.toArray(),
      lists: await db.lists.toArray(),
      preferences: await db.preferences.toArray(),
      recurrenceSeries: await db.recurrenceSeries.toArray(),
      focusSessions: await db.focusSessions.toArray(),
    },
  };
}

export async function importBackup(payload: BackupPayload): Promise<void> {
  if (payload.version !== 2) {
    throw new Error("Unsupported backup version");
  }

  const db = getDb();

  await db.transaction(
    "rw",
    [db.tasks, db.lists, db.preferences, db.recurrenceSeries, db.focusSessions],
    async () => {
      await db.tasks.clear();
      await db.lists.clear();
      await db.preferences.clear();
      await db.recurrenceSeries.clear();
      await db.focusSessions.clear();

      if (payload.data.tasks.length) await db.tasks.bulkAdd(payload.data.tasks as never[]);
      if (payload.data.lists.length) await db.lists.bulkAdd(payload.data.lists as never[]);
      if (payload.data.preferences.length) await db.preferences.bulkAdd(payload.data.preferences as never[]);
      if (payload.data.recurrenceSeries.length) await db.recurrenceSeries.bulkAdd(payload.data.recurrenceSeries as never[]);
      if (payload.data.focusSessions.length) await db.focusSessions.bulkAdd(payload.data.focusSessions as never[]);
    },
  );
}
