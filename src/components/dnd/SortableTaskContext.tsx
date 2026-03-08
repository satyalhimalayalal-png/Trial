"use client";

import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task } from "@/types/domain";
import { containerDndId, taskDndId } from "@/lib/domain/dnd";
import type { ContainerRef } from "@/types/domain";

interface SortableTaskContextProps {
  container: ContainerRef;
  tasks: Task[];
  children: React.ReactNode;
}

export function SortableTaskContext({ container, tasks, children }: SortableTaskContextProps) {
  const droppableId = containerDndId(container);
  const itemIds = useMemo(() => tasks.map((task) => taskDndId(task.id)), [tasks]);
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: "container", container },
  });

  return (
    <div
      ref={setNodeRef}
      className="min-h-[220px] rounded-sm"
      style={isOver ? { background: "color-mix(in oklab, var(--custom-color) 9%, transparent)" } : undefined}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  );
}
