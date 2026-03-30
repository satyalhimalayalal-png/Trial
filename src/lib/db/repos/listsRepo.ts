import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/dexie";
import { ensureDefaultLists } from "@/lib/db/seeds";
import { markTasksDeleted } from "@/lib/db/repos/syncTombstonesRepo";
import { toDayKey } from "@/lib/domain/dates";
import { ORDER_STEP } from "@/lib/domain/ordering";
import type { PlannerList } from "@/types/domain";

export async function getActiveLists(): Promise<PlannerList[]> {
  const db = getDb();
  await ensureDefaultLists();
  const rows = await db.lists.toArray();
  return rows.filter((list) => !list.archived).sort((a, b) => a.order - b.order);
}

export async function createCustomList(name: string): Promise<PlannerList | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const db = getDb();
  await ensureDefaultLists();

  const rows = await db.lists.filter((list) => !list.archived).toArray();
  const maxOrder = rows.reduce((max, row) => Math.max(max, row.order), 0);
  const now = new Date().toISOString();

  const list: PlannerList = {
    id: nanoid(),
    name: trimmed,
    kind: "CUSTOM",
    resetsDaily: false,
    lastResetDayKey: undefined,
    order: maxOrder + 1024,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.lists.add(list);
  return list;
}

export async function toggleCustomListDailyReset(listId: string): Promise<PlannerList | null> {
  const db = getDb();
  const list = await db.lists.get(listId);

  if (!list || list.archived || list.kind !== "CUSTOM") {
    return null;
  }

  const now = new Date().toISOString();
  const today = toDayKey(new Date());
  const nextEnabled = !list.resetsDaily;
  const patch: Partial<PlannerList> = {
    resetsDaily: nextEnabled,
    updatedAt: now,
  };

  if (nextEnabled) {
    patch.lastResetDayKey = today;
  }

  await db.lists.update(listId, patch);
  return (await db.lists.get(listId)) ?? null;
}

export async function syncDailyResetLists(today = new Date()): Promise<void> {
  const db = getDb();
  const todayKey = toDayKey(today);
  const now = today.toISOString();

  await db.transaction("rw", db.lists, db.tasks, async () => {
    const listsToReset = await db.lists
      .filter(
        (list) =>
          !list.archived &&
          list.kind === "CUSTOM" &&
          list.resetsDaily === true &&
          list.lastResetDayKey !== todayKey,
      )
      .toArray();

    for (const list of listsToReset) {
      const completedTasks = await db.tasks
        .filter(
          (task) =>
            task.containerType === "LIST" &&
            task.containerId === list.id &&
            task.completed,
        )
        .toArray();

      await Promise.all(
        completedTasks.map((task) =>
          db.tasks.update(task.id, {
            completed: false,
            updatedAt: now,
          }),
        ),
      );

      await db.lists.update(list.id, {
        lastResetDayKey: todayKey,
        updatedAt: now,
      });
    }
  });
}

export async function deleteCustomList(listId: string): Promise<boolean> {
  const db = getDb();
  const list = await db.lists.get(listId);

  if (!list || list.archived || list.kind !== "CUSTOM") {
    return false;
  }

  const now = new Date().toISOString();

  await db.transaction("rw", db.lists, db.tasks, async () => {
    const listTasks = await db.tasks
      .filter((task) => task.containerType === "LIST" && task.containerId === listId)
      .toArray();
    await db.tasks
      .filter((task) => task.containerType === "LIST" && task.containerId === listId)
      .delete();
    await markTasksDeleted(listTasks.map((task) => task.id), now);

    await db.lists.update(listId, {
      archived: true,
      updatedAt: now,
    });
  });

  return true;
}

export async function reorderActiveLists(orderedListIds: string[]): Promise<void> {
  const db = getDb();
  await ensureDefaultLists();

  if (orderedListIds.length === 0) return;

  const activeRows = await db.lists.filter((list) => !list.archived).toArray();
  const activeIds = new Set(activeRows.map((row) => row.id));
  const normalizedIds = orderedListIds.filter((id, index, arr) => activeIds.has(id) && arr.indexOf(id) === index);
  if (normalizedIds.length === 0) return;

  // Keep any missing active ids stable at the end so no active list becomes orphaned.
  const missingActiveIds = activeRows
    .filter((row) => !normalizedIds.includes(row.id))
    .sort((a, b) => a.order - b.order)
    .map((row) => row.id);

  const finalIds = [...normalizedIds, ...missingActiveIds];
  const now = new Date().toISOString();

  await db.transaction("rw", db.lists, async () => {
    await Promise.all(
      finalIds.map((id, index) =>
        db.lists.update(id, {
          order: (index + 1) * ORDER_STEP,
          updatedAt: now,
        }),
      ),
    );
  });
}
