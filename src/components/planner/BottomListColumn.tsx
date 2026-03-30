"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import clsx from "clsx";
import { TaskListColumn } from "@/components/planner/TaskListColumn";
import { listColumnDndId } from "@/lib/domain/dnd";
import type {
  AccentColor,
  BulletStyle,
  ContainerRef,
  PlannerList,
  Task,
} from "@/types/domain";

interface BottomListColumnProps {
  list: PlannerList;
  tasks: Task[];
  editingTaskId: string | null;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string) => Promise<void>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onDeleteList?: (list: PlannerList) => Promise<void>;
  onToggleDailyReset?: (list: PlannerList) => Promise<void>;
}

export function BottomListColumn({ list, onDeleteList, onToggleDailyReset, ...rest }: BottomListColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: listColumnDndId(list.id),
    data: {
      type: "list-column",
      listId: list.id,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={clsx("h-full min-h-0", isDragging && "opacity-80")}>
      <TaskListColumn
        variant="list"
        containerType="LIST"
        containerId={list.id}
        title={list.name}
        headerDragProps={{ ...attributes, ...listeners }}
        headerAction={
          <div className="flex items-center gap-1">
            {list.kind === "CUSTOM" && onToggleDailyReset ? (
              <button
                type="button"
                className={clsx(
                  "list-recurring-toggle",
                  list.resetsDaily && "list-recurring-toggle-active",
                )}
                title={list.resetsDaily ? "Daily reset on" : "Enable daily reset"}
                aria-label={list.resetsDaily ? `Disable daily reset for ${list.name}` : `Enable daily reset for ${list.name}`}
                onClick={() => void onToggleDailyReset(list)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                daily
              </button>
            ) : null}
            {list.kind === "CUSTOM" && onDeleteList ? (
              <button
                type="button"
                className="rounded px-1 text-[14px] leading-none text-muted hover:text-[var(--custom-color)]"
                title="Delete list"
                aria-label={`Delete list ${list.name}`}
                onClick={() => void onDeleteList(list)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                ×
              </button>
            ) : null}
          </div>
        }
        {...rest}
      />
    </div>
  );
}
