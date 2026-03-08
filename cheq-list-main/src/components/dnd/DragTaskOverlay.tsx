"use client";

import { DragOverlay } from "@dnd-kit/core";
import type { Task } from "@/types/domain";

interface DragTaskOverlayProps {
  task: Task | null;
}

export function DragTaskOverlay({ task }: DragTaskOverlayProps) {
  return (
    <DragOverlay>
      {task ? (
        <div className="task-text rounded border border-theme surface px-2 py-1 shadow-md">
          {task.title}
        </div>
      ) : null}
    </DragOverlay>
  );
}
