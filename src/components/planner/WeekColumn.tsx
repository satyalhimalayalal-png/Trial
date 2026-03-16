"use client";

import { format, isToday } from "date-fns";
import { TaskListColumn } from "@/components/planner/TaskListColumn";
import type { AccentColor, BulletStyle, ContainerRef, Task } from "@/types/domain";

interface WeekColumnProps {
  date: Date;
  dayKey: string;
  tasks: Task[];
  editingTaskId: string | null;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string, options?: { parentTaskId?: string }) => Promise<Task>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<unknown>;
  onEditRecurring?: (taskId: string) => void;
}

export function WeekColumn(props: WeekColumnProps) {
  const { date, dayKey, ...rest } = props;

  return (
    <TaskListColumn
      variant="day"
      highlightTitle={isToday(date)}
      containerType="DAY"
      containerId={dayKey}
      title={format(date, "EEEE")}
      subtitle={format(date, "MMMM dd, yyyy")}
      {...rest}
    />
  );
}
