"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useAnalyticsHistory } from "@/hooks/useAnalyticsHistory";
import { useWeekRange } from "@/hooks/useWeekRange";
import { usePlannerUiStore } from "@/state/usePlannerUiStore";
import { PlannerDndProvider } from "@/components/dnd/PlannerDndProvider";
import { DragTaskOverlay } from "@/components/dnd/DragTaskOverlay";
import { BottomListsRow } from "@/components/planner/BottomListsRow";
import { formatRangeLabel } from "@/components/planner/PlannerHeader";
import { WeekGrid } from "@/components/planner/WeekGrid";
import { PreferencesSidebar } from "@/components/planner/PreferencesSidebar";
import { AccountSidebar } from "@/components/account/AccountSidebar";
import { TaskListColumn } from "@/components/planner/TaskListColumn";
import { TopAccentBar } from "@/components/planner/TopAccentBar";
import { usePreferences } from "@/hooks/usePreferences";
import { RecurrenceEditorModal } from "@/components/recurrence/RecurrenceEditorModal";
import {
  createOrUpdateSeriesForTask,
  disableSeriesForTask,
  deleteAllSeriesInstances,
  getSeriesForTask,
  listSeriesInstances,
  syncAllSeriesOccurrences,
} from "@/lib/db/repos/recurrenceRepo";
import { createCustomList, deleteCustomList, reorderActiveLists } from "@/lib/db/repos/listsRepo";
import { FocusTimer } from "@/components/focus/FocusTimer";
import { toDayKey } from "@/lib/domain/dates";
import type { ContainerRef, PlannerList, RecurrenceRule, Task } from "@/types/domain";

interface PlannerLayoutProps {
  lists: PlannerList[];
  tasks: Task[];
  showBottomLists?: boolean;
}

interface UndoAction {
  label: string;
  run: () => Promise<void>;
}

type ShellMode = "planner" | "focus" | "today" | "analytics";

function matchesSearch(task: Task, query: string): boolean {
  if (!query.trim()) return true;
  return task.title.toLowerCase().includes(query.trim().toLowerCase());
}

function triggerCelebration() {
  if (typeof window === "undefined") return;
  for (let i = 0; i < 8; i += 1) {
    window.setTimeout(() => {
      const node = document.createElement("div");
      node.textContent = "✦";
      node.style.position = "fixed";
      node.style.left = `${15 + Math.random() * 70}%`;
      node.style.top = `${20 + Math.random() * 40}%`;
      node.style.color = "var(--custom-color)";
      node.style.fontSize = "18px";
      node.style.pointerEvents = "none";
      node.style.opacity = "0.85";
      node.style.transition = "transform 800ms ease, opacity 800ms ease";
      document.body.appendChild(node);
      requestAnimationFrame(() => {
        node.style.transform = "translateY(-24px)";
        node.style.opacity = "0";
      });
      window.setTimeout(() => node.remove(), 900);
    }, i * 80);
  }
}

function useKeyboardShortcuts(actions: {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSearchFocus: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "[") {
        event.preventDefault();
        actions.onPrev();
      }
      if (event.key === "]") {
        event.preventDefault();
        actions.onNext();
      }
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        actions.onToday();
      }
      if (event.key === "/") {
        event.preventDefault();
        actions.onSearchFocus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}

function PlannerChrome({
  children,
  mode,
  rangeLabel,
  searchQuery,
  onSearchChange,
  preferences,
  onPatchPreferences,
}: {
  children: React.ReactNode;
  mode: ShellMode;
  rangeLabel?: string;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  preferences: ReturnType<typeof usePreferences>["preferences"];
  onPatchPreferences: ReturnType<typeof usePreferences>["patchPreferences"];
}) {
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(event.target as Node)) return;
      setPrefsOpen(false);
      setAccountOpen(false);
    };

    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div
      data-theme={preferences.theme}
      data-accent={preferences.accentColor}
      data-text-size={preferences.textSize}
      data-spacing={preferences.spacing}
      data-columns={preferences.columns}
      className="app-shell h-[100dvh] overflow-hidden"
    >
      <TopAccentBar
        mode={mode}
        rangeLabel={rangeLabel}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onTogglePrefs={() => {
          setPrefsOpen((prev) => !prev);
          setAccountOpen(false);
        }}
        onToggleAccount={() => {
          setAccountOpen((prev) => !prev);
          setPrefsOpen(false);
        }}
        prefsOpen={prefsOpen}
        accountOpen={accountOpen}
      />

      <div
        ref={popoverRef}
        className="fixed inset-x-2 z-50 max-h-[calc(100dvh-var(--ui-toolbar-height)-0.75rem)] w-auto overflow-hidden sm:inset-x-auto sm:right-3 sm:w-[290px]"
        style={{ top: "calc(var(--ui-toolbar-height) + var(--ui-top-border-width) + 0.3333333333rem)" }}
      >
        {prefsOpen ? <PreferencesSidebar preferences={preferences} onPatch={onPatchPreferences} /> : null}
        {accountOpen ? <AccountSidebar /> : null}
      </div>

      <div className="planner-main-shell">{children}</div>
    </div>
  );
}

function DayNavRail({
  side,
  onStep,
  onJump,
}: {
  side: "left" | "right";
  onStep: () => void;
  onJump: () => void;
}) {
  const isRight = side === "right";
  return (
    <div className={`day-nav-rail day-nav-rail-${side}`}>
      <button
        type="button"
        className="day-nav-btn day-nav-btn-primary"
        onClick={onStep}
        aria-label={isRight ? "Next day" : "Previous day"}
        title={isRight ? "Next day" : "Previous day"}
      >
        {isRight ? "›" : "‹"}
      </button>
      <button
        type="button"
        className="day-nav-btn day-nav-btn-secondary"
        onClick={onJump}
        aria-label={isRight ? "Next week" : "Previous week"}
        title={isRight ? "Next week" : "Previous week"}
      >
        {isRight ? "»" : "«"}
      </button>
    </div>
  );
}

export function PlannerLayout({ lists, tasks, showBottomLists = true }: PlannerLayoutProps) {
  useAnalyticsHistory();

  const {
    currentAnchorDate,
    editingTaskId,
    draggingTaskId,
    searchQuery,
    setCurrentAnchorDate,
    setEditingTaskId,
    setDraggingTaskId,
    setSearchQuery,
    goToToday,
  } = usePlannerUiStore();

  const { preferences, patchPreferences } = usePreferences();
  const taskActions = useTaskActions();

  const { dayKeys, dates, startDate } = useWeekRange(
    currentAnchorDate,
    preferences.columns,
    preferences.weekStartMode,
  );

  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [recurringTaskId, setRecurringTaskId] = useState<string | null>(null);
  const [recurrenceInstances, setRecurrenceInstances] = useState<Task[]>([]);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | undefined>(undefined);
  const [weekMotion, setWeekMotion] = useState<"left" | "right" | null>(null);
  const [weekMotionKey, setWeekMotionKey] = useState(0);

  useEffect(() => {
    void syncAllSeriesOccurrences(addDays(startDate, -7), addDays(startDate, 365));
  }, [startDate]);

  useEffect(() => {
    if (!undoAction) return;
    const id = window.setTimeout(() => setUndoAction(null), 5000);
    return () => window.clearTimeout(id);
  }, [undoAction]);

  useEffect(() => {
    if (!weekMotion) return;
    const id = window.setTimeout(() => setWeekMotion(null), 260);
    return () => window.clearTimeout(id);
  }, [weekMotion]);

  const shiftDay = (delta: number) => {
    setWeekMotion(delta > 0 ? "right" : "left");
    setWeekMotionKey((prev) => prev + 1);
    setCurrentAnchorDate(addDays(currentAnchorDate, delta));
  };

  useKeyboardShortcuts({
    onPrev: () => shiftDay(-1),
    onNext: () => shiftDay(1),
    onToday: goToToday,
    onSearchFocus: () => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Search tasks"]');
      el?.focus();
    },
  });

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!preferences.showCompleted && task.completed) return false;
      return matchesSearch(task, searchQuery);
    });
  }, [tasks, preferences.showCompleted, searchQuery]);

  const weekTasksByDay = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const dayKey of dayKeys) grouped[dayKey] = [];

    for (const task of visibleTasks) {
      if (task.containerType === "DAY" && grouped[task.containerId]) {
        grouped[task.containerId].push(task);
      }
    }
    return grouped;
  }, [visibleTasks, dayKeys]);

  const listTasksById = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const list of lists) grouped[list.id] = [];
    for (const task of visibleTasks) {
      if (task.containerType === "LIST" && grouped[task.containerId]) {
        grouped[task.containerId].push(task);
      }
    }
    return grouped;
  }, [visibleTasks, lists]);

  const draggingTask = visibleTasks.find((task) => task.id === draggingTaskId) ?? null;
  const recurrenceTask = tasks.find((task) => task.id === recurringTaskId) ?? null;

  const handleDelete = async (taskId: string) => {
    const deletedTasks = await taskActions.deleteTask(taskId);
    if (deletedTasks.length === 0) return;

    setUndoAction({
      label: deletedTasks.length > 1 ? "Task group deleted" : "Task deleted",
      run: async () => {
        await taskActions.restoreTasks(deletedTasks);
      },
    });
  };

  const handleMove = async (taskId: string, to: ContainerRef, newOrder: number) => {
    const previous = tasks.find((task) => task.id === taskId);
    await taskActions.moveTask(taskId, to, newOrder);

    if (previous) {
      setUndoAction({
        label: "Task moved",
        run: async () => {
          await taskActions.moveTask(
            taskId,
            { containerType: previous.containerType, containerId: previous.containerId },
            previous.order,
          );
        },
      });
    }
  };

  const handleToggle = async (taskId: string) => {
    const target = tasks.find((task) => task.id === taskId);
    await taskActions.toggleTask(taskId);
    if (target && !target.completed && preferences.celebrations) {
      triggerCelebration();
    }
  };

  const handleEditRecurring = async (taskId: string) => {
    setRecurringTaskId(taskId);
    const [series, instances] = await Promise.all([
      getSeriesForTask(taskId),
      listSeriesInstances(taskId),
    ]);
    setRecurrenceRule(series?.rule);
    setRecurrenceInstances(instances);
  };

  const handleAddList = async () => {
    const name = window.prompt("New Someday list name");
    if (!name) return;
    await createCustomList(name);
  };

  const handleDeleteList = async (list: PlannerList) => {
    const ok = window.confirm(`Delete "${list.name}" and all tasks in it?`);
    if (!ok) return;
    await deleteCustomList(list.id);
  };

  const handleMoveList = async (listId: string, toIndex: number) => {
    const currentIds = lists.map((list) => list.id);
    const fromIndex = currentIds.indexOf(listId);
    if (fromIndex < 0 || toIndex < 0 || toIndex >= currentIds.length || fromIndex === toIndex) {
      return;
    }

    const reorderedIds = [...currentIds];
    const [moved] = reorderedIds.splice(fromIndex, 1);
    if (!moved) return;
    reorderedIds.splice(toIndex, 0, moved);
    await reorderActiveLists(reorderedIds);
  };

  return (
    <PlannerChrome
      mode="planner"
      rangeLabel={formatRangeLabel(startDate, dates[dates.length - 1] ?? startDate)}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      preferences={preferences}
      onPatchPreferences={patchPreferences}
    >
      <div className="planner-canvas">
        <PlannerDndProvider
          tasks={visibleTasks}
          listIds={lists.map((list) => list.id)}
          onDragStartTask={setDraggingTaskId}
          onMoveTask={handleMove}
          onMoveList={handleMoveList}
          allowCrossTypeMoves
        >
          <section className="planner-top">
            <WeekGrid
              dates={dates}
              dayKeys={dayKeys}
              tasksByDay={weekTasksByDay}
              editingTaskId={editingTaskId}
              accentColor={preferences.accentColor}
              bulletStyle={preferences.bulletStyle}
              showLines
              motionDirection={weekMotion}
              motionKey={weekMotionKey}
              onSetEditingTaskId={setEditingTaskId}
              onAdd={taskActions.addTask}
              onEdit={taskActions.editTask}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEditRecurring={handleEditRecurring}
            />
            <DayNavRail side="left" onStep={() => shiftDay(-1)} onJump={() => shiftDay(-7)} />
            <DayNavRail side="right" onStep={() => shiftDay(1)} onJump={() => shiftDay(7)} />
          </section>

          {showBottomLists ? (
            <>
              <div className="someday-bar">
                <h2 className="someday-title">Someday</h2>
                <button type="button" className="someday-add" onClick={() => void handleAddList()}>
                  +
                </button>
              </div>
              <section className="planner-bottom">
                <BottomListsRow
                  lists={lists}
                  tasksByListId={listTasksById}
                  editingTaskId={editingTaskId}
                  accentColor={preferences.accentColor}
                  bulletStyle={preferences.bulletStyle}
                  showLines
                  onSetEditingTaskId={setEditingTaskId}
                  onAdd={taskActions.addTask}
                  onEdit={taskActions.editTask}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onDeleteList={handleDeleteList}
                />
              </section>
            </>
          ) : null}

          <DragTaskOverlay task={draggingTask} />
        </PlannerDndProvider>
      </div>

      <RecurrenceEditorModal
        key={recurrenceTask?.id ?? "none"}
        open={Boolean(recurrenceTask)}
        task={recurrenceTask}
        initialRule={recurrenceRule}
        instances={recurrenceInstances}
        onClose={() => {
          setRecurringTaskId(null);
          setRecurrenceInstances([]);
        }}
        onSave={async (taskId, payload) => {
          if (payload.title.trim()) {
            await taskActions.editTask(taskId, payload.title);
          }

          if (payload.recurringEnabled && payload.rule) {
            await createOrUpdateSeriesForTask(taskId, payload.rule);
            setRecurrenceRule(payload.rule);
            setRecurrenceInstances(await listSeriesInstances(taskId));
          } else {
            await disableSeriesForTask(taskId);
            setRecurrenceRule(undefined);
            setRecurrenceInstances([]);
          }

          setRecurringTaskId(null);
        }}
        onDeleteAll={async (taskId) => {
          await deleteAllSeriesInstances(taskId);
          setRecurringTaskId(null);
          setRecurrenceInstances([]);
        }}
      />

      {undoAction ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded border border-theme surface px-3 py-2 text-sm shadow">
          <span>{undoAction.label}</span>
          <button
            type="button"
            className="rounded border border-theme px-2 py-1"
            onClick={async () => {
              await undoAction.run();
              setUndoAction(null);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </PlannerChrome>
  );
}

export function TodayLayout({ tasks }: { tasks: Task[] }) {
  useAnalyticsHistory();

  const taskActions = useTaskActions();
  const editingTaskId = usePlannerUiStore((state) => state.editingTaskId);
  const setEditingTaskId = usePlannerUiStore((state) => state.setEditingTaskId);
  const setDraggingTaskId = usePlannerUiStore((state) => state.setDraggingTaskId);
  const draggingTaskId = usePlannerUiStore((state) => state.draggingTaskId);
  const { preferences, patchPreferences } = usePreferences();

  const todayKey = toDayKey(new Date());
  const dayTasks = useMemo(
    () => tasks.filter((task) => task.containerType === "DAY" && task.containerId === todayKey),
    [tasks, todayKey],
  );

  return (
    <PlannerChrome
      mode="today"
      rangeLabel={formatRangeLabel(new Date(), new Date())}
      preferences={preferences}
      onPatchPreferences={patchPreferences}
    >
      <div className="h-full overflow-y-auto px-4 py-2">
        <PlannerDndProvider
          tasks={dayTasks}
          onDragStartTask={setDraggingTaskId}
          onMoveTask={taskActions.moveTask}
          allowCrossTypeMoves
        >
          <div className="mx-auto max-w-4xl">
            <FocusTimer />

            <WeekGrid
              dates={[new Date()]}
              dayKeys={[todayKey]}
              tasksByDay={{ [todayKey]: dayTasks }}
              editingTaskId={editingTaskId}
              accentColor={preferences.accentColor}
              bulletStyle={preferences.bulletStyle}
              showLines
              onSetEditingTaskId={setEditingTaskId}
              onAdd={taskActions.addTask}
              onEdit={taskActions.editTask}
              onToggle={taskActions.toggleTask}
              onDelete={taskActions.deleteTask}
            />
          </div>

          <DragTaskOverlay task={dayTasks.find((task) => task.id === draggingTaskId) ?? null} />
        </PlannerDndProvider>
      </div>
    </PlannerChrome>
  );
}

export function FocusWindowLayout({ tasks }: { tasks: Task[] }) {
  useAnalyticsHistory();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedKey = toDayKey(selectedDate);

  const { preferences, patchPreferences } = usePreferences();
  const taskActions = useTaskActions();
  const editingTaskId = usePlannerUiStore((state) => state.editingTaskId);
  const setEditingTaskId = usePlannerUiStore((state) => state.setEditingTaskId);
  const setDraggingTaskId = usePlannerUiStore((state) => state.setDraggingTaskId);
  const draggingTaskId = usePlannerUiStore((state) => state.draggingTaskId);

  const dayTasks = useMemo(
    () => tasks.filter((task) => task.containerType === "DAY" && task.containerId === selectedKey),
    [tasks, selectedKey],
  );

  return (
    <PlannerChrome
      mode="focus"
      rangeLabel={formatRangeLabel(selectedDate, selectedDate)}
      preferences={preferences}
      onPatchPreferences={patchPreferences}
    >
      <div className="h-full overflow-y-auto px-4 py-2">
        <PlannerDndProvider tasks={dayTasks} onDragStartTask={setDraggingTaskId} onMoveTask={taskActions.moveTask} allowCrossTypeMoves>
          <div className="mx-auto max-w-3xl">
            <header className="mb-2 flex items-center justify-between">
              <div>
                <h1 className="day-title">{format(selectedDate, "EEEE")}</h1>
                <p className="day-subtitle">{format(selectedDate, "MMMM dd, yyyy")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={() => setSelectedDate((d) => addDays(d, -1))}>Prev</button>
                <button className="rounded border btn-accent surface px-2 py-1 text-sm text-accent" onClick={() => setSelectedDate(new Date())}>Today</button>
                <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={() => setSelectedDate((d) => addDays(d, 1))}>Next</button>
              </div>
            </header>

            <FocusTimer />

            <TaskListColumn
              variant="day"
              containerType="DAY"
              containerId={selectedKey}
              title={format(selectedDate, "EEEE")}
              subtitle={format(selectedDate, "MMMM dd, yyyy")}
              tasks={dayTasks}
              editingTaskId={editingTaskId}
              accentColor={preferences.accentColor}
              bulletStyle={preferences.bulletStyle}
              showLines
              onSetEditingTaskId={setEditingTaskId}
              onAdd={taskActions.addTask}
              onEdit={taskActions.editTask}
              onToggle={taskActions.toggleTask}
              onDelete={taskActions.deleteTask}
            />
          </div>
          <DragTaskOverlay task={dayTasks.find((task) => task.id === draggingTaskId) ?? null} />
        </PlannerDndProvider>
      </div>
    </PlannerChrome>
  );
}
