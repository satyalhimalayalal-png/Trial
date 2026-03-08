"use client";

import { TaskListColumn } from "@/components/planner/TaskListColumn";
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
}

export function BottomListColumn({ list, onDeleteList, ...rest }: BottomListColumnProps) {
  return (
    <TaskListColumn
      variant="list"
      containerType="LIST"
      containerId={list.id}
      title={list.name}
      headerAction={
        list.kind === "CUSTOM" && onDeleteList ? (
          <button
            type="button"
            className="rounded px-1 text-[14px] leading-none text-muted hover:text-[var(--custom-color)]"
            title="Delete list"
            aria-label={`Delete list ${list.name}`}
            onClick={() => void onDeleteList(list)}
          >
            ×
          </button>
        ) : undefined
      }
      {...rest}
    />
  );
}
