"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { orderForDrop, sortByOrder } from "@/lib/domain/ordering";
import { parseContainerDndId, parseTaskDndId } from "@/lib/domain/dnd";
import type { ContainerRef, Task } from "@/types/domain";

interface PlannerDndProviderProps {
  tasks: Task[];
  children: React.ReactNode;
  onDragStartTask: (taskId: string | null) => void;
  onMoveTask: (taskId: string, to: ContainerRef, newOrder: number) => Promise<void>;
  allowCrossTypeMoves?: boolean;
}

function findTask(tasks: Task[], taskId: string): Task | undefined {
  return tasks.find((task) => task.id === taskId);
}

function tasksInContainer(tasks: Task[], container: ContainerRef): Task[] {
  return sortByOrder(
    tasks.filter(
      (task) =>
        task.containerType === container.containerType &&
        task.containerId === container.containerId,
    ),
  );
}

function getOverContainer(tasks: Task[], overId: string): ContainerRef | null {
  const container = parseContainerDndId(overId);
  if (container) return container;

  const overTaskId = parseTaskDndId(overId);
  if (!overTaskId) return null;

  const overTask = findTask(tasks, overTaskId);
  if (!overTask) return null;

  return {
    containerType: overTask.containerType,
    containerId: overTask.containerId,
  };
}

function getInsertIndex(tasks: Task[], overId: string): number {
  const overTaskId = parseTaskDndId(overId);
  if (!overTaskId) return tasks.length;

  const index = tasks.findIndex((task) => task.id === overTaskId);
  if (index < 0) return tasks.length;
  return Math.max(0, index);
}

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  if (pointer.length > 0) return pointer;
  return closestCenter(args);
};

export function PlannerDndProvider({
  tasks,
  children,
  onDragStartTask,
  onMoveTask,
  allowCrossTypeMoves = false,
}: PlannerDndProviderProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 170, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = parseTaskDndId(String(event.active.id));
    onDragStartTask(taskId);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    onDragStartTask(null);

    const activeTaskId = parseTaskDndId(String(event.active.id));
    if (!activeTaskId || !event.over) return;

    const activeTask = findTask(tasks, activeTaskId);
    if (!activeTask) return;

    const toContainer = getOverContainer(tasks, String(event.over.id));
    if (!toContainer) return;

    if (!allowCrossTypeMoves && toContainer.containerType !== activeTask.containerType) {
      return;
    }

    const toTasks = tasksInContainer(tasks, toContainer).filter((task) => task.id !== activeTaskId);
    const targetIndex = getInsertIndex(toTasks, String(event.over.id));
    const newOrder = orderForDrop({ orderedTasks: toTasks, targetIndex });

    if (
      activeTask.containerType === toContainer.containerType &&
      activeTask.containerId === toContainer.containerId &&
      Math.abs(activeTask.order - newOrder) < 0.0001
    ) {
      return;
    }

    await onMoveTask(activeTaskId, toContainer, newOrder);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}
    </DndContext>
  );
}
