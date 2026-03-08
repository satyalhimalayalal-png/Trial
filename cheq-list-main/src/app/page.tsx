"use client";

import { PlannerLayout } from "@/components/planner/PlannerLayout";
import { usePlannerBoard } from "@/hooks/usePlannerBoard";

export default function HomePage() {
  const { lists, tasks, ready } = usePlannerBoard();

  if (!ready) {
    return <main className="app-shell min-h-screen p-4 text-sm text-muted">Loading planner...</main>;
  }

  return <PlannerLayout lists={lists} tasks={tasks} showBottomLists />;
}
