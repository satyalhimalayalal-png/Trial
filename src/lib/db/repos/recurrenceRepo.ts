import { addDays, parseISO } from "date-fns";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/dexie";
import { generateOccurrencesInRange } from "@/lib/domain/recurrence";
import { sortByOrder } from "@/lib/domain/ordering";
import { clearTaskTombstone, markTasksDeleted } from "@/lib/db/repos/syncTombstonesRepo";
import type { RecurrenceRule, RecurrenceSeries, Task } from "@/types/domain";

function isValidDayKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function fallbackStartDate(task: Task): string {
  if (isValidDayKey(task.occurrenceDateKey)) return task.occurrenceDateKey;
  if (task.containerType === "DAY" && isValidDayKey(task.containerId)) return task.containerId;
  return new Date().toISOString().slice(0, 10);
}

function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  const fallbackDate =
    isValidDayKey(rule.startDate) ? rule.startDate : new Date().toISOString().slice(0, 10);
  const startDay = new Date(`${fallbackDate}T00:00:00`).getDay();
  const safeWeekdays = (rule.weekdays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return {
    ...rule,
    every: Math.max(1, Math.floor(rule.every || 1)),
    startDate: fallbackDate,
    weekdays:
      rule.freq === "week"
        ? safeWeekdays.length
          ? safeWeekdays
          : [startDay]
        : undefined,
  };
}

export async function createOrUpdateSeriesForTask(
  taskId: string,
  inputRule: RecurrenceRule,
): Promise<string | null> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  if (!task || task.containerType !== "DAY") return null;

  const rule = normalizeRule({
    ...inputRule,
    startDate: isValidDayKey(inputRule.startDate) ? inputRule.startDate : fallbackStartDate(task),
  });
  const now = new Date().toISOString();

  return db.transaction("rw", db.tasks, db.recurrenceSeries, async () => {
    const seriesId = task.seriesId ?? nanoid();

    if (task.seriesId) {
      const prior = await db.tasks.where("seriesId").equals(seriesId).toArray();
      await db.tasks.where("seriesId").equals(seriesId).delete();
      await markTasksDeleted(prior.map((item) => item.id), now);
    }

    const series: RecurrenceSeries = {
      id: seriesId,
      taskTitle: task.title,
      active: true,
      rule,
      containerType: "DAY",
      containerId: rule.startDate,
      createdAt: task.seriesId
        ? (await db.recurrenceSeries.get(seriesId))?.createdAt ?? now
        : now,
      updatedAt: now,
    };

    await db.recurrenceSeries.put(series);

    const anchorTask: Task = {
      ...task,
      id: task.id,
      containerType: "DAY",
      containerId: rule.startDate,
      seriesId,
      occurrenceDateKey: rule.startDate,
      updatedAt: now,
    };

    await db.tasks.put(anchorTask);
    await clearTaskTombstone(anchorTask.id);

    await syncSeriesOccurrences(
      seriesId,
      addDays(parseISO(`${rule.startDate}T00:00:00`), -1),
      addDays(new Date(), 365),
    );

    return seriesId;
  });
}

export async function syncSeriesOccurrences(
  seriesId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<void> {
  const db = getDb();
  const series = await db.recurrenceSeries.get(seriesId);
  if (!series || !series.active) return;

  const dates = generateOccurrencesInRange(series.rule, rangeStart, rangeEnd);
  if (dates.length === 0) return;

  const existing = await db.tasks.where("seriesId").equals(seriesId).toArray();
  const existingByDate = new Map(existing.map((task) => [task.occurrenceDateKey, task]));
  const now = new Date().toISOString();

  const inserts: Task[] = [];

  for (const dateKey of dates) {
    if (existingByDate.has(dateKey)) continue;

    const maxOrder = sortByOrder(
      await db.tasks
        .filter((task) => task.containerType === "DAY" && task.containerId === dateKey)
        .toArray(),
    ).at(-1)?.order;

    inserts.push({
      id: nanoid(),
      title: series.taskTitle,
      completed: false,
      createdAt: now,
      updatedAt: now,
      containerType: "DAY",
      containerId: dateKey,
      order: (maxOrder ?? 0) + 1024,
      seriesId,
      occurrenceDateKey: dateKey,
    });
  }

  if (inserts.length > 0) {
    await db.tasks.bulkAdd(inserts);
  }
}

export async function deleteAllSeriesInstances(taskId: string): Promise<void> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  const seriesId = task?.seriesId;
  if (!seriesId) return;

  const cutoffKey = task.occurrenceDateKey ?? (task.containerType === "DAY" ? task.containerId : undefined);
  if (!cutoffKey) return;

  await db.transaction("rw", db.tasks, db.recurrenceSeries, async () => {
    const instances = await db.tasks.where("seriesId").equals(seriesId).toArray();
    const targetIds = instances
      .filter((instance) => (instance.occurrenceDateKey ?? "") >= cutoffKey)
      .map((instance) => instance.id);

    if (targetIds.length > 0) {
      await db.tasks.bulkDelete(targetIds);
      await markTasksDeleted(targetIds);
    }

    await db.recurrenceSeries.update(seriesId, {
      active: false,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function disableSeriesForTask(taskId: string): Promise<void> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  const seriesId = task?.seriesId;
  if (!task || !seriesId) return;

  const now = new Date().toISOString();
  const standaloneTask: Task = { ...task, updatedAt: now };
  delete standaloneTask.seriesId;
  delete standaloneTask.occurrenceDateKey;

  await db.transaction("rw", db.tasks, db.recurrenceSeries, async () => {
    const seriesTasks = await db.tasks.where("seriesId").equals(seriesId).toArray();
    await db.tasks.where("seriesId").equals(seriesId).delete();
    await markTasksDeleted(seriesTasks.map((item) => item.id), now);
    await db.recurrenceSeries.delete(seriesId);
    await db.tasks.put(standaloneTask);
    await clearTaskTombstone(standaloneTask.id);
  });
}

export async function listSeriesInstances(taskId: string): Promise<Task[]> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  const seriesId = task?.seriesId;
  if (!seriesId) return [];

  const rows = await db.tasks.where("seriesId").equals(seriesId).toArray();
  return rows.sort((a, b) => (a.occurrenceDateKey ?? "").localeCompare(b.occurrenceDateKey ?? ""));
}

export async function getSeriesForTask(taskId: string): Promise<RecurrenceSeries | null> {
  const db = getDb();
  const task = await db.tasks.get(taskId);
  if (!task?.seriesId) return null;
  return (await db.recurrenceSeries.get(task.seriesId)) ?? null;
}

export async function syncAllSeriesOccurrences(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<void> {
  const db = getDb();
  const seriesList = await db.recurrenceSeries.filter((series) => series.active).toArray();

  for (const series of seriesList) {
    await syncSeriesOccurrences(series.id, rangeStart, rangeEnd);
  }
}
