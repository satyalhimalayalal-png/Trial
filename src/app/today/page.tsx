"use client";

import { TodayLayout } from "@/components/planner/PlannerLayout";
import { usePlannerBoard } from "@/hooks/usePlannerBoard";

export default function TodayPage() {
  const { tasks, ready } = usePlannerBoard();
  if (!ready) {
    return <main className="app-shell min-h-screen p-4 text-sm text-muted">Loading planner...</main>;
  }
  return <TodayLayout tasks={tasks} />;
}
