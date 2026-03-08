"use client";

import { TodayLayout } from "@/components/planner/PlannerLayout";
import { usePlannerBoard } from "@/hooks/usePlannerBoard";

export default function TodayPage() {
  const { tasks } = usePlannerBoard();
  return <TodayLayout tasks={tasks} />;
}
