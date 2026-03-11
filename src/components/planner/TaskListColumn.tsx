"use client";

import { type FormEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { SortableTaskContext } from "@/components/dnd/SortableTaskContext";
import { TaskItem } from "@/components/planner/TaskItem";
import type { AccentColor, BulletStyle, ContainerRef, Task } from "@/types/domain";

interface TaskListColumnProps {
  containerType: ContainerRef["containerType"];
  containerId: string;
  title: string;
  subtitle?: string;
  tasks: Task[];
  variant?: "day" | "list";
  highlightTitle?: boolean;
  editingTaskId: string | null;
  accentColor: AccentColor;
  bulletStyle: BulletStyle;
  showLines: boolean;
  headerAction?: React.ReactNode;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string) => Promise<void>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onEditRecurring?: (taskId: string) => void;
}

export function TaskListColumn({
  containerType,
  containerId,
  title,
  subtitle,
  tasks,
  variant = "day",
  highlightTitle = false,
  editingTaskId,
  accentColor,
  bulletStyle,
  showLines,
  headerAction,
  onSetEditingTaskId,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  onEditRecurring,
}: TaskListColumnProps) {
  const container = { containerType, containerId } as const;
  const lineInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [lineDrafts, setLineDrafts] = useState<Record<number, string>>({});
  const emptyLineCount = useMemo(() => {
    const target = variant === "day" ? 12 : 10;
    return Math.max(1, target - tasks.length);
  }, [tasks.length, variant]);

  const focusTopLine = () => {
    requestAnimationFrame(() => {
      lineInputRefs.current[0]?.focus();
    });
  };

  const setLineRef = (index: number, node: HTMLInputElement | null) => {
    lineInputRefs.current[index] = node;
  };

  const handleLineSubmit = async (event: FormEvent, lineIndex: number) => {
    event.preventDefault();
    const next = (lineDrafts[lineIndex] ?? "").trim();
    if (!next) return;

    await onAdd(container, next);
    setLineDrafts({});
    focusTopLine();
  };

  const handleLinesClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-task-item='true']")) return;
    if (target.closest("[data-no-compose='true']")) return;
    focusTopLine();
  };

  return (
    <section className="checklist-pane flex h-full min-h-0 flex-col border-x border-theme px-2">
      <header className={variant === "day" ? "mb-2 shrink-0 pb-1 pt-5" : "mb-2 shrink-0 pb-1 pt-4"}>
        <div className={variant === "day" ? "flex items-start justify-between gap-1" : "relative min-h-[1.8rem]"}>
          <div className={variant === "day" ? "w-full text-center" : "w-full text-center"}>
            {variant === "day" ? (
              <h3 className="day-title" style={highlightTitle ? { color: "var(--custom-color-highlight)" } : undefined}>
                {title}
              </h3>
            ) : (
              <h3 className="list-title">{title}</h3>
            )}
            {subtitle ? <p className="day-subtitle">{subtitle}</p> : null}
          </div>
          {headerAction ? (
            <div className={variant === "day" ? "mt-0.5" : "absolute right-0 top-0"}>{headerAction}</div>
          ) : null}
        </div>
      </header>

      <div
        className={`checklist-inner-pane min-h-[220px] min-w-0 flex-1 overflow-y-auto ${showLines ? "lines-backdrop" : "lines-backdrop-off"}`}
        onClick={handleLinesClick}
      >
        <SortableTaskContext container={container} tasks={tasks}>
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              editing={editingTaskId === task.id}
              accentColor={accentColor}
              bulletStyle={bulletStyle}
              showLines={showLines}
              onStartEdit={onSetEditingTaskId}
              onFinishEdit={() => onSetEditingTaskId(null)}
              onTitleCommit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
              onEditRecurring={onEditRecurring}
            />
          ))}
        </SortableTaskContext>
        {Array.from({ length: emptyLineCount }, (_, index) => (
          <form key={`${containerId}-line-${index}`} onSubmit={(event) => void handleLineSubmit(event, index)}>
            <input
              ref={(node) => setLineRef(index, node)}
              value={lineDrafts[index] ?? ""}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) =>
                setLineDrafts((prev) => ({ ...prev, [index]: event.target.value }))
              }
              placeholder={index === 0 ? "Write on line..." : ""}
              data-no-compose="true"
              className="quick-add-input quick-add-line w-full border-0 bg-transparent outline-none"
            />
          </form>
        ))}
      </div>
    </section>
  );
}
