"use client";

import { FocusWindowLayout } from "@/components/planner/PlannerLayout";
import { usePlannerBoard } from "@/hooks/usePlannerBoard";

export default function FocusPage() {
  const { tasks } = usePlannerBoard();
  return <FocusWindowLayout tasks={tasks} />;
}
