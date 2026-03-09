import { getDb } from "@/lib/db/dexie";
import type { SyncTombstone } from "@/types/domain";

function buildTaskTombstoneId(taskId: string): string {
  return `task:${taskId}`;
}

export async function markTaskDeleted(taskId: string, deletedAt = new Date().toISOString()): Promise<void> {
  const db = getDb();
  const id = buildTaskTombstoneId(taskId);
  const existing = await db.syncTombstones.get(id);
  const timestamp = existing && existing.deletedAt > deletedAt ? existing.deletedAt : deletedAt;
  const now = new Date().toISOString();
  const row: SyncTombstone = {
    id,
    entityType: "task",
    entityId: taskId,
    deletedAt: timestamp,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.syncTombstones.put(row);
}

export async function markTasksDeleted(taskIds: string[], deletedAt = new Date().toISOString()): Promise<void> {
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (ids.length === 0) return;
  const db = getDb();
  const existing = await db.syncTombstones.where("entityType").equals("task").and((row) => ids.includes(row.entityId)).toArray();
  const existingByTaskId = new Map(existing.map((row) => [row.entityId, row]));
  const now = new Date().toISOString();
  const rows: SyncTombstone[] = ids.map((taskId) => {
    const prev = existingByTaskId.get(taskId);
    const timestamp = prev && prev.deletedAt > deletedAt ? prev.deletedAt : deletedAt;
    return {
      id: buildTaskTombstoneId(taskId),
      entityType: "task",
      entityId: taskId,
      deletedAt: timestamp,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
  });
  await db.syncTombstones.bulkPut(rows);
}

export async function clearTaskTombstone(taskId: string): Promise<void> {
  const db = getDb();
  await db.syncTombstones.delete(buildTaskTombstoneId(taskId));
}
