"use client";

import { getDb } from "@/lib/db/dexie";
import type { FocusSession, PlannerList, RecurrenceSeries, SyncTombstone, Task, UserPreferences } from "@/types/domain";

export interface PlannerBackupV1 {
  version: 1;
  exportedAt: string;
  data: {
    tasks: Task[];
    lists: PlannerList[];
    preferences: UserPreferences[];
    recurrenceSeries: RecurrenceSeries[];
    focusSessions: FocusSession[];
    syncTombstones?: SyncTombstone[];
  };
}

function toEpoch(value: string | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function latestDataTimestamp(payload: PlannerBackupV1): number {
  const taskTs = payload.data.tasks.reduce((max, item) => Math.max(max, toEpoch(item.updatedAt), toEpoch(item.createdAt)), 0);
  const listTs = payload.data.lists.reduce((max, item) => Math.max(max, toEpoch(item.updatedAt), toEpoch(item.createdAt)), 0);
  const prefsTs = payload.data.preferences.reduce((max, item) => Math.max(max, toEpoch(item.updatedAt)), 0);
  const recurrenceTs = payload.data.recurrenceSeries.reduce(
    (max, item) => Math.max(max, toEpoch(item.updatedAt), toEpoch(item.createdAt)),
    0,
  );
  const focusTs = payload.data.focusSessions.reduce(
    (max, item) => Math.max(max, toEpoch(item.updatedAt), toEpoch(item.createdAt), toEpoch(item.startAt), toEpoch(item.endAt)),
    0,
  );
  const tombstoneTs = (payload.data.syncTombstones ?? []).reduce(
    (max, item) => Math.max(max, toEpoch(item.deletedAt), toEpoch(item.updatedAt), toEpoch(item.createdAt)),
    0,
  );
  const dataTs = Math.max(taskTs, listTs, prefsTs, recurrenceTs, focusTs, tombstoneTs);
  return dataTs || toEpoch(payload.exportedAt);
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], getUpdatedAt: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const item of remote) merged.set(item.id, item);
  for (const item of local) {
    const prev = merged.get(item.id);
    if (!prev || toEpoch(getUpdatedAt(item)) >= toEpoch(getUpdatedAt(prev))) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

function listIdentity(list: PlannerBackupV1["data"]["lists"][number]): string {
  if (list.kind === "SYSTEM" && list.systemKey) {
    return `SYSTEM:${list.systemKey}`;
  }
  return `LIST:${list.id}`;
}

function mergeListsAndBuildAliases(
  local: PlannerBackupV1["data"]["lists"],
  remote: PlannerBackupV1["data"]["lists"],
): { lists: PlannerBackupV1["data"]["lists"]; aliases: Map<string, string> } {
  const byIdentity = new Map<string, PlannerBackupV1["data"]["lists"][number]>();
  const identityById = new Map<string, string>();
  const ingest = (item: PlannerBackupV1["data"]["lists"][number]) => {
    const identity = listIdentity(item);
    identityById.set(item.id, identity);
    const prev = byIdentity.get(identity);
    if (!prev || toEpoch(item.updatedAt) >= toEpoch(prev.updatedAt)) {
      byIdentity.set(identity, item);
    }
  };

  for (const item of remote) ingest(item);
  for (const item of local) ingest(item);

  const canonicalIdByIdentity = new Map<string, string>();
  for (const [identity, item] of byIdentity) {
    canonicalIdByIdentity.set(identity, item.id);
  }

  const aliases = new Map<string, string>();
  for (const [id, identity] of identityById) {
    const canonical = canonicalIdByIdentity.get(identity);
    if (canonical && canonical !== id) {
      aliases.set(id, canonical);
    }
  }

  return { lists: [...byIdentity.values()], aliases };
}

export function mergePlannerBackups(local: PlannerBackupV1, remote: PlannerBackupV1): PlannerBackupV1 {
  const { lists, aliases } = mergeListsAndBuildAliases(local.data.lists, remote.data.lists);
  const normalizeTask = (item: PlannerBackupV1["data"]["tasks"][number]) => {
    if (item.containerType !== "LIST") return item;
    const canonicalId = aliases.get(item.containerId);
    if (!canonicalId || canonicalId === item.containerId) return item;
    return { ...item, containerId: canonicalId };
  };
  const normalizeSeries = (item: PlannerBackupV1["data"]["recurrenceSeries"][number]) => {
    if (item.containerType !== "LIST") return item;
    const canonicalId = aliases.get(item.containerId);
    if (!canonicalId || canonicalId === item.containerId) return item;
    return { ...item, containerId: canonicalId };
  };

  const localTasks = local.data.tasks.map(normalizeTask);
  const remoteTasks = remote.data.tasks.map(normalizeTask);
  const localSeries = local.data.recurrenceSeries.map(normalizeSeries);
  const remoteSeries = remote.data.recurrenceSeries.map(normalizeSeries);
  const mergedTombstones = mergeById(
    local.data.syncTombstones ?? [],
    remote.data.syncTombstones ?? [],
    (item) => item.updatedAt || item.deletedAt,
  );
  const taskTombstones = new Map(
    mergedTombstones.filter((row) => row.entityType === "task").map((row) => [row.entityId, row]),
  );

  const mergedTasks = mergeById(localTasks, remoteTasks, (item) => item.updatedAt).filter((task) => {
    const tombstone = taskTombstones.get(task.id);
    if (!tombstone) return true;
    return toEpoch(task.updatedAt) > toEpoch(tombstone.deletedAt);
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: mergedTasks,
      lists,
      preferences: mergeById(local.data.preferences, remote.data.preferences, (item) => item.updatedAt),
      recurrenceSeries: mergeById(localSeries, remoteSeries, (item) => item.updatedAt),
      focusSessions: mergeById(local.data.focusSessions, remote.data.focusSessions, (item) => item.updatedAt),
      syncTombstones: mergedTombstones,
    },
  };
}

export function createEmptyBackup(): PlannerBackupV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: [],
      lists: [],
      preferences: [],
      recurrenceSeries: [],
      focusSessions: [],
      syncTombstones: [],
    },
  };
}

export async function exportPlannerBackup(): Promise<PlannerBackupV1> {
  const db = getDb();
  const [tasks, lists, preferences, recurrenceSeries, focusSessions, syncTombstones] = await Promise.all([
    db.tasks.toArray(),
    db.lists.toArray(),
    db.preferences.toArray(),
    db.recurrenceSeries.toArray(),
    db.focusSessions.toArray(),
    db.syncTombstones.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { tasks, lists, preferences, recurrenceSeries, focusSessions, syncTombstones },
  };
}

export async function importPlannerBackup(payload: PlannerBackupV1): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.tasks, db.lists, db.preferences, db.recurrenceSeries, db.focusSessions, db.syncTombstones],
    async () => {
      await Promise.all([
        db.tasks.clear(),
        db.lists.clear(),
        db.preferences.clear(),
        db.recurrenceSeries.clear(),
        db.focusSessions.clear(),
        db.syncTombstones.clear(),
      ]);

      if (payload.data.tasks.length) await db.tasks.bulkPut(payload.data.tasks);
      if (payload.data.lists.length) await db.lists.bulkPut(payload.data.lists);
      if (payload.data.preferences.length) await db.preferences.bulkPut(payload.data.preferences);
      if (payload.data.recurrenceSeries.length) await db.recurrenceSeries.bulkPut(payload.data.recurrenceSeries);
      if (payload.data.focusSessions.length) await db.focusSessions.bulkPut(payload.data.focusSessions);
      if ((payload.data.syncTombstones ?? []).length) await db.syncTombstones.bulkPut(payload.data.syncTombstones ?? []);
    },
  );
}

export function getBackupTimestamp(payload: PlannerBackupV1): number {
  return latestDataTimestamp(payload);
}
