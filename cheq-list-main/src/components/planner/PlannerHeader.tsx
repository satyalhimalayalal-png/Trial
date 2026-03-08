"use client";

import Link from "next/link";
import { format } from "date-fns";

interface PlannerHeaderProps {
  rangeLabel: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onExport?: () => void;
  onImport?: (file: File) => void;
}

export function PlannerHeader({
  rangeLabel,
  searchQuery,
  onSearchChange,
  onPrevWeek,
  onNextWeek,
  onToday,
  onExport,
  onImport,
}: PlannerHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-theme pb-4 pl-12">
      <div>
        <h1 className="text-[26px] uppercase tracking-[0.04em]" style={{ fontFamily: "var(--font-heading)" }}>
          Teux Planner
        </h1>
        <p className="text-sm text-muted">{rangeLabel}</p>
      </div>

      <div className="flex items-center gap-2">
        <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={onPrevWeek} aria-label="Previous range">
          Prev
        </button>
        <button className="rounded border btn-accent surface px-2 py-1 text-sm text-accent" onClick={onToday} aria-label="Go to today">
          Today
        </button>
        <button className="rounded border border-theme surface px-2 py-1 text-sm" onClick={onNextWeek} aria-label="Next range">
          Next
        </button>
        <Link href="/today" className="rounded border border-theme surface px-2 py-1 text-sm">
          Today View
        </Link>
        <Link href="/focus" className="rounded border border-theme surface px-2 py-1 text-sm">
          Focus
        </Link>
        <Link href="/analytics" className="rounded border border-theme surface px-2 py-1 text-sm">
          Analytics
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tasks (/)..."
          className="task-text rounded border border-theme surface px-2 py-1 outline-none"
          aria-label="Search tasks"
        />
        {onExport ? (
          <button type="button" onClick={onExport} className="rounded border border-theme surface px-2 py-1 text-xs">
            Export
          </button>
        ) : null}
        {onImport ? (
          <label className="rounded border border-theme surface px-2 py-1 text-xs">
            Import
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </header>
  );
}

export function formatRangeLabel(start: Date, end: Date): string {
  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
}
