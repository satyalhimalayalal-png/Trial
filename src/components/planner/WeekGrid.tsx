"use client";

import clsx from "clsx";
import { WeekColumn } from "@/components/planner/WeekColumn";
import type { AccentColor, BulletStyle, ContainerRef, Task } from "@/types/domain";

interface WeekGridProps {
  dates: Date[];
  dayKeys: string[];
  tasksByDay: Record<string, Task[]>;
  editingTaskId: string | null;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  motionDirection?: "left" | "right" | null;
  motionKey?: number;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string) => Promise<void>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEditRecurring?: (taskId: string) => void;
}

export function WeekGrid({
  dates,
  dayKeys,
  tasksByDay,
  editingTaskId,
  accentColor,
  bulletStyle,
  showLines,
  motionDirection = null,
  motionKey = 0,
  onSetEditingTaskId,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onEditRecurring,
}: WeekGridProps) {
  return (
    <section className="week-grid-scroll h-full overflow-x-auto overflow-y-hidden">
      <div
        key={motionKey}
        className={clsx(
          "week-grid-track grid h-full min-w-0 column-stack",
          motionDirection === "left" && "week-slide-left",
          motionDirection === "right" && "week-slide-right",
        )}
        style={
          {
            gridTemplateColumns: `repeat(${dayKeys.length}, minmax(var(--week-col-min, 0px), 1fr))`,
            ["--week-column-count"]: dayKeys.length,
          } as Record<string, string | number>
        }
      >
        {dayKeys.map((dayKey, index) => (
          <WeekColumn
            key={dayKey}
            date={dates[index]}
            dayKey={dayKey}
            tasks={tasksByDay[dayKey] ?? []}
            editingTaskId={editingTaskId}
            accentColor={accentColor}
            bulletStyle={bulletStyle}
            showLines={showLines}
            onSetEditingTaskId={onSetEditingTaskId}
            onAdd={onAdd}
            onEdit={onEdit}
            onToggle={onToggle}
            onDelete={onDelete}
            onEditRecurring={onEditRecurring}
          />
        ))}
      </div>
    </section>
  );
}
