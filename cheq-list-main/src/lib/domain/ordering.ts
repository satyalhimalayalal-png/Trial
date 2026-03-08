import type { Task } from "@/types/domain";

export const ORDER_STEP = 1024;
export const ORDER_GAP_EPSILON = 0.0001;

export function sortByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export function nextOrder(tasks: Task[]): number {
  if (tasks.length === 0) return ORDER_STEP;
  return sortByOrder(tasks)[tasks.length - 1].order + ORDER_STEP;
}

export function orderForDrop(params: {
  orderedTasks: Task[];
  targetIndex: number;
}): number {
  const { orderedTasks, targetIndex } = params;

  if (orderedTasks.length === 0) return ORDER_STEP;

  const prev = orderedTasks[targetIndex - 1];
  const next = orderedTasks[targetIndex];

  if (!prev && next) return next.order - ORDER_STEP;
  if (prev && !next) return prev.order + ORDER_STEP;
  if (!prev || !next) return ORDER_STEP;

  return (prev.order + next.order) / 2;
}

export function needsRebalance(orderedTasks: Task[]): boolean {
  for (let i = 1; i < orderedTasks.length; i += 1) {
    if (orderedTasks[i].order - orderedTasks[i - 1].order < ORDER_GAP_EPSILON) {
      return true;
    }
  }
  return false;
}

export function rebalanceOrders(orderedTasks: Task[]): Array<Pick<Task, "id" | "order">> {
  return orderedTasks.map((task, index) => ({
    id: task.id,
    order: (index + 1) * ORDER_STEP,
  }));
}
