import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/dexie";
import { needsRebalance, nextOrder, rebalanceOrders, sortByOrder } from "@/lib/domain/ordering";
import { clearTaskTombstone, markTasksDeleted } from "@/lib/db/repos/syncTombstonesRepo";
import type { ContainerRef, Task } from "@/types/domain";

interface CreateTaskOptions {
  parentTaskId?: string;
}

function normalizeExcludedDateKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const keys = value
    .filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item));
  return [...new Set(keys)].sort();
}

async function listByContainerInternal(container: ContainerRef): Promise<Task[]> {
  const db = getDb();
  const rows = await db.tasks
    .filter(
      (task) =>
        task.containerType === container.containerType &&
        task.containerId === container.containerId,
    )
    .toArray();

  return sortByOrder(rows);
}

export async function listByContainer(container: ContainerRef): Promise<Task[]> {
  return listByContainerInternal(container);
}

function collectDescendantIds(tasks: Task[], rootTaskId: string): string[] {
  const childIdsByParent = new Map<string, string[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const childIds = childIdsByParent.get(task.parentTaskId) ?? [];
    childIds.push(task.id);
    childIdsByParent.set(task.parentTaskId, childIds);
  }

  const descendants: string[] = [];
  const queue = [...(childIdsByParent.get(rootTaskId) ?? [])];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) continue;
    descendants.push(currentId);
    queue.push(...(childIdsByParent.get(currentId) ?? []));
  }

  return descendants;
}

export async function createTask(container: ContainerRef, title: string, options?: CreateTaskOptions): Promise<Task> {
  const db = getDb();
  const now = new Date().toISOString();

  return db.transaction("rw", db.tasks, async () => {
    const current = await listByContainerInternal(container);
    const parent = options?.parentTaskId ? current.find((task) => task.id === options.parentTaskId) : undefined;
    const siblingTasks = parent
      ? current.filter((task) => task.parentTaskId === parent.id)
      : current.filter((task) => !task.parentTaskId);
    const task: Task = {
      id: nanoid(),
      title: title.trim(),
      completed: false,
      createdAt: now,
      updatedAt: now,
      containerType: container.containerType,
      containerId: container.containerId,
      order: nextOrder(siblingTasks),
      parentTaskId: parent?.id,
      indentLevel: parent ? Math.min((parent.indentLevel ?? 0) + 1, 6) : 0,
    };

    await db.tasks.add(task);
    return task;
  });
}

export async function restoreTasks(tasks: Task[]): Promise<void> {
  if (tasks.length === 0) return;
  const db = getDb();
  await db.transaction("rw", db.tasks, db.recurrenceSeries, async () => {
    for (const task of tasks) {
      await db.tasks.put(task);
      if (task.seriesId && task.occurrenceDateKey) {
        const series = await db.recurrenceSeries.get(task.seriesId);
        if (series?.active) {
          const excludedDateKeys = normalizeExcludedDateKeys(series.excludedDateKeys).filter(
            (dateKey) => dateKey !== task.occurrenceDateKey,
          );
          await db.recurrenceSeries.update(task.seriesId, {
            excludedDateKeys,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  });
  await Promise.all(tasks.map((task) => clearTaskTombstone(task.id)));
}

export async function restoreTask(task: Task): Promise<void> {
  await restoreTasks([task]);
}

export async function updateTitle(taskId: string, title: string): Promise<void> {
  const db = getDb();
  await db.tasks.update(taskId, {
    title: title.trim(),
    updatedAt: new Date().toISOString(),
  });
}

export async function toggleComplete(taskId: string): Promise<void> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  if (!task) return;

  await db.tasks.update(taskId, {
    completed: !task.completed,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTask(taskId: string): Promise<Task[]> {
  const db = getDb();
  const now = new Date().toISOString();
  let deletedTasks: Task[] = [];
  await db.transaction("rw", db.tasks, db.recurrenceSeries, async () => {
    const target = await db.tasks.get(taskId);
    if (!target) return;
    const allTasks = await db.tasks.toArray();
    const descendantIds = collectDescendantIds(allTasks, taskId);
    const deletedIds = [taskId, ...descendantIds];
    deletedTasks = allTasks.filter((task) => deletedIds.includes(task.id));

    if (target.seriesId && target.occurrenceDateKey) {
      const series = await db.recurrenceSeries.get(target.seriesId);
      if (series?.active) {
        const excludedDateKeys = normalizeExcludedDateKeys(series.excludedDateKeys);
        if (!excludedDateKeys.includes(target.occurrenceDateKey)) {
          excludedDateKeys.push(target.occurrenceDateKey);
          excludedDateKeys.sort();
          await db.recurrenceSeries.update(target.seriesId, {
            excludedDateKeys,
            updatedAt: now,
          });
        }
      }
    }

    await db.tasks.bulkDelete(deletedIds);
  });
  await markTasksDeleted(deletedTasks.map((task) => task.id), now);
  return deletedTasks;
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  const db = getDb();
  return db.tasks.get(taskId);
}

export async function reorderTask(params: {
  taskId: string;
  container: ContainerRef;
  newOrder: number;
}): Promise<void> {
  const db = getDb();

  await db.transaction("rw", db.tasks, async () => {
    await db.tasks.update(params.taskId, {
      containerType: params.container.containerType,
      containerId: params.container.containerId,
      order: params.newOrder,
      parentTaskId: undefined,
      indentLevel: 0,
      updatedAt: new Date().toISOString(),
    });

    const rows = await listByContainerInternal(params.container);
    if (!needsRebalance(rows)) return;

    const rebalanced = rebalanceOrders(rows);
    await Promise.all(
      rebalanced.map((entry) => db.tasks.update(entry.id, { order: entry.order })),
    );
  });
}

export async function moveTask(params: {
  taskId: string;
  to: ContainerRef;
  newOrder: number;
}): Promise<void> {
  await reorderTask({
    taskId: params.taskId,
    container: params.to,
    newOrder: params.newOrder,
  });
}
