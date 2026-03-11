import type { ContainerRef } from "@/types/domain";

const TASK_PREFIX = "task:";
const CONTAINER_PREFIX = "container:";
const LIST_COLUMN_PREFIX = "list-column:";

export function taskDndId(taskId: string): string {
  return `${TASK_PREFIX}${taskId}`;
}

export function containerDndId(container: ContainerRef): string {
  return `${CONTAINER_PREFIX}${container.containerType}:${container.containerId}`;
}

export function parseTaskDndId(id: string): string | null {
  if (!id.startsWith(TASK_PREFIX)) return null;
  return id.slice(TASK_PREFIX.length);
}

export function parseContainerDndId(id: string): ContainerRef | null {
  if (!id.startsWith(CONTAINER_PREFIX)) return null;
  const payload = id.slice(CONTAINER_PREFIX.length);
  const [containerType, ...rest] = payload.split(":");
  const containerId = rest.join(":");

  if ((containerType !== "DAY" && containerType !== "LIST") || !containerId) {
    return null;
  }

  return {
    containerType,
    containerId,
  };
}

export function listColumnDndId(listId: string): string {
  return `${LIST_COLUMN_PREFIX}${listId}`;
}

export function parseListColumnDndId(id: string): string | null {
  if (!id.startsWith(LIST_COLUMN_PREFIX)) return null;
  const payload = id.slice(LIST_COLUMN_PREFIX.length);
  return payload || null;
}
