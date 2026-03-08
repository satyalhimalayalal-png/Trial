"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { RecurrenceFreq, RecurrenceRule, Task } from "@/types/domain";

interface RecurrenceEditorModalProps {
  open: boolean;
  task: Task | null;
  initialRule?: RecurrenceRule;
  instances: Task[];
  onClose: () => void;
  onSave: (
    taskId: string,
    payload: {
      title: string;
      recurringEnabled: boolean;
      rule?: RecurrenceRule;
    },
  ) => Promise<void>;
  onDeleteAll: (taskId: string) => Promise<void>;
}

const weekdayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function RecurrenceEditorModal({
  open,
  task,
  initialRule,
  instances,
  onClose,
  onSave,
  onDeleteAll,
}: RecurrenceEditorModalProps) {
  const defaultStartDate = useMemo(() => {
    if (task?.occurrenceDateKey) return task.occurrenceDateKey;
    if (task?.containerType === "DAY") return task.containerId;
    return format(new Date(), "yyyy-MM-dd");
  }, [task]);

  const [title, setTitle] = useState(task?.title ?? "");
  const [recurringEnabled, setRecurringEnabled] = useState(Boolean(initialRule || task?.seriesId));
  const [every, setEvery] = useState(initialRule?.every ?? 1);
  const [freq, setFreq] = useState<RecurrenceFreq>(initialRule?.freq ?? "week");
  const [startDate, setStartDate] = useState(initialRule?.startDate ?? defaultStartDate);
  const [weekdays, setWeekdays] = useState<number[]>(
    initialRule?.weekdays ?? [new Date(`${defaultStartDate}T00:00:00`).getDay()],
  );

  if (!open || !task) return null;
  const recurringAllowed = task.containerType === "DAY";
  const hasExistingSeries = Boolean(task.seriesId || initialRule);
  const canSaveRule = recurringAllowed && recurringEnabled;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg border border-theme surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Task</h3>
          <button onClick={onClose} className="rounded border border-theme px-2 py-1">Close</button>
        </div>

        <div className="grid gap-3">
          <label className="text-sm">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded border border-theme px-2 py-1"
              placeholder="Task title"
            />
          </label>

          <div className="flex items-center justify-between rounded border border-theme px-3 py-2">
            <p className="text-sm">Recurring</p>
            <button
              type="button"
              role="switch"
              aria-checked={recurringEnabled}
              className={`ios-switch ${recurringEnabled ? "ios-switch-on" : ""}`}
              onClick={() => setRecurringEnabled((prev) => !prev)}
              disabled={!recurringAllowed}
            >
              <span className="ios-switch-thumb" />
            </button>
          </div>

          {!recurringAllowed ? (
            <p className="text-xs text-muted">Recurring is only available for day tasks.</p>
          ) : null}
        </div>

        {canSaveRule ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Repeat every
              <input
                type="number"
                min={1}
                value={every}
                onChange={(event) => setEvery(Math.max(1, Number(event.target.value) || 1))}
                className="mt-1 w-full rounded border border-theme px-2 py-1"
              />
            </label>

            <label className="text-sm">
              Unit
              <select value={freq} onChange={(event) => setFreq(event.target.value as RecurrenceFreq)} className="mt-1 w-full rounded border border-theme px-2 py-1">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>

            <label className="text-sm sm:col-span-2">
              Starting on
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 w-full rounded border border-theme px-2 py-1"
              />
            </label>
          </div>
        ) : null}

        {canSaveRule && freq === "week" ? (
          <div className="mt-3">
            <p className="text-sm">Repeat on</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {weekdayOptions.map((option) => {
                const selected = weekdays.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setWeekdays((prev) =>
                        prev.includes(option.value)
                          ? prev.filter((day) => day !== option.value)
                          : [...prev, option.value],
                      );
                    }}
                    className={
                      selected
                        ? "rounded border btn-accent bg-accent px-2 py-1 text-xs text-white"
                        : "rounded border border-theme px-2 py-1 text-xs"
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rounded border border-theme px-2 py-1 text-sm"
            onClick={() =>
              void onSave(task.id, {
                title: title.trim() || task.title,
                recurringEnabled: canSaveRule,
                rule: canSaveRule
                  ? { every, freq, startDate, weekdays }
                  : undefined,
              })
            }
          >
            Save
          </button>

          {hasExistingSeries ? (
            <button
              type="button"
              className="rounded border border-theme px-2 py-1 text-sm"
              onClick={() => void onDeleteAll(task.id)}
            >
              Delete all instances
            </button>
          ) : null}
        </div>

        {canSaveRule ? (
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-theme p-2 text-sm">
            {instances.length === 0 ? (
              <p className="text-muted">View all instances: none yet.</p>
            ) : (
              instances.map((instance) => (
                <div key={instance.id} className="flex justify-between border-b border-theme py-1 last:border-b-0">
                  <span>{instance.title}</span>
                  <span className="text-muted">{instance.occurrenceDateKey ?? instance.containerId}</span>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
