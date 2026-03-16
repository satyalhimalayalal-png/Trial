"use client";

import { useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import clsx from "clsx";
import { taskDndId } from "@/lib/domain/dnd";
import type { AccentColor, BulletStyle, Task } from "@/types/domain";

const accentColorMap: Record<AccentColor, string> = {
  coral: "#c4312b",
  blue: "#1d63c9",
  green: "#168d61",
  amber: "#af7200",
  rose: "#b8366b",
};

interface TaskItemProps {
  task: Task;
  indentLevel?: number;
  editing: boolean;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  onStartEdit: (taskId: string) => void;
  onFinishEdit: () => void;
  onTitleCommit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEditRecurring?: (taskId: string) => void;
}

export function TaskItem({
  task,
  indentLevel = 0,
  editing,
  accentColor,
  bulletStyle,
  showLines,
  onStartEdit,
  onFinishEdit,
  onTitleCommit,
  onToggle,
  onDelete,
  onEditRecurring,
}: TaskItemProps) {
  const [draft, setDraft] = useState(task.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    disabled: editing,
    data: {
      type: "task",
      taskId: task.id,
      containerType: task.containerType,
      containerId: task.containerId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const bullet = bulletStyle === "none" ? null : bulletStyle === "dash" ? "-" : "•";

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, paddingLeft: `${Math.max(0, indentLevel) * 0.9}rem` }}
      data-task-item="true"
      data-completed={task.completed ? "true" : "false"}
      className={clsx("task-row group", !showLines && "task-row-no-lines", isDragging && "opacity-50")}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void onToggle(task.id)}
        className={clsx("task-checkbox", task.completed && "is-complete")}
        style={task.completed ? { color: accentColorMap[accentColor] } : undefined}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      />

      {bullet ? <span className="task-text text-muted">{bullet}</span> : null}

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={async () => {
              const next = draft.trim();
              if (next && next !== task.title) {
                await onTitleCommit(task.id, next);
              }
              onFinishEdit();
            }}
            onKeyDown={async (event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                const next = draft.trim();
                if (next && next !== task.title) {
                  await onTitleCommit(task.id, next);
                }
                onFinishEdit();
              }
              if (event.key === "Escape") {
                setDraft(task.title);
                onFinishEdit();
              }
            }}
            className="task-input w-full border-b border-theme bg-transparent outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(task.title);
              onStartEdit(task.id);
            }}
            className="task-text w-full text-left"
          >
            {task.title}
          </button>
        )}
      </div>

      {onEditRecurring ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onEditRecurring(task.id)}
          className={clsx("task-action-btn", task.seriesId && "task-recurring-indicator opacity-100 visible")}
          aria-label="Edit recurring"
          title="Edit task"
        >
          ↻
        </button>
      ) : null}

      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => void onDelete(task.id)}
        className="task-action-btn"
        aria-label="Delete task"
      >
        ×
      </button>
    </div>
  );
}
