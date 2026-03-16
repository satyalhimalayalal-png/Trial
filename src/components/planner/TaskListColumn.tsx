"use client";

import { type FormEvent, type HTMLAttributes, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { SortableTaskContext } from "@/components/dnd/SortableTaskContext";
import { TaskItem } from "@/components/planner/TaskItem";
import { sortTasksForDisplay } from "@/lib/domain/ordering";
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
  headerDragProps?: HTMLAttributes<HTMLElement>;
  onSetEditingTaskId: (taskId: string | null) => void;
  onAdd: (container: ContainerRef, title: string, options?: { parentTaskId?: string }) => Promise<Task>;
  onEdit: (taskId: string, title: string) => Promise<void>;
  onToggle: (taskId: string) => Promise<void>;
  onDelete: (taskId: string) => Promise<unknown>;
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
  headerDragProps,
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
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);
  const emptyLineCount = useMemo(() => {
    const target = variant === "day" ? 12 : 10;
    return Math.max(1, target - tasks.length);
  }, [tasks.length, variant]);
  const displayTasks = useMemo(() => sortTasksForDisplay(tasks), [tasks]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const subtaskParent = subtaskParentId ? taskById.get(subtaskParentId) ?? null : null;

  const focusTopLine = () => {
    requestAnimationFrame(() => {
      lineInputRefs.current[0]?.focus();
    });
  };

  useEffect(() => {
    if (subtaskParentId && !subtaskParent) {
      setSubtaskParentId(null);
    }
  }, [subtaskParentId, subtaskParent]);

  const setLineRef = (index: number, node: HTMLInputElement | null) => {
    lineInputRefs.current[index] = node;
  };

  const submitLine = async (
    lineIndex: number,
    mode: "normal" | "start-subtasks" | "continue-subtasks" = "normal",
  ) => {
    const next = (lineDrafts[lineIndex] ?? "").trim();
    if (!next) return;

    const createdTask = await onAdd(container, next, subtaskParentId ? { parentTaskId: subtaskParentId } : undefined);
    setLineDrafts({});
    if (mode === "start-subtasks") {
      setSubtaskParentId(createdTask.id);
    } else if (mode === "normal" && !subtaskParentId) {
      setSubtaskParentId(null);
    }
    focusTopLine();
  };

  const handleLineSubmit = async (
    event: FormEvent,
    lineIndex: number,
    mode: "normal" | "start-subtasks" | "continue-subtasks" = "normal",
  ) => {
    event.preventDefault();
    await submitLine(lineIndex, mode);
  };

  const handleLinesClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-task-item='true']")) return;
    if (target.closest("[data-no-compose='true']")) return;
    setSubtaskParentId(null);
    focusTopLine();
  };

  return (
    <section
      className="checklist-pane flex h-full min-h-0 flex-col border-x border-theme px-2"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-no-compose='true']")) return;
        setSubtaskParentId(null);
      }}
    >
      <header
        className={
          variant === "day"
            ? "mb-2 shrink-0 pb-1 pt-5"
            : `mb-2 shrink-0 pb-1 pt-4 ${headerDragProps ? "cursor-grab select-none active:cursor-grabbing" : ""}`
        }
        {...(variant === "list" ? headerDragProps : undefined)}
      >
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
        <SortableTaskContext container={container} tasks={displayTasks}>
          {displayTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              indentLevel={task.indentLevel ?? 0}
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
          <form key={`${containerId}-line-${index}`} onSubmit={(event) => void handleLineSubmit(event, index, subtaskParentId ? "continue-subtasks" : "normal")}>
            <input
              ref={(node) => setLineRef(index, node)}
              value={lineDrafts[index] ?? ""}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) =>
                setLineDrafts((prev) => ({ ...prev, [index]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Tab" && (lineDrafts[index] ?? "").trim()) {
                  event.preventDefault();
                  void submitLine(index, subtaskParentId ? "continue-subtasks" : "start-subtasks");
                }
              }}
              placeholder={index === 0 ? (subtaskParent ? "Write subtask..." : "Write on line...") : ""}
              data-no-compose="true"
              className="quick-add-input quick-add-line w-full border-0 bg-transparent outline-none"
              style={subtaskParent ? { paddingLeft: `${Math.min((subtaskParent.indentLevel ?? 0) + 1, 6) * 0.9}rem` } : undefined}
            />
          </form>
        ))}
      </div>
    </section>
  );
}
