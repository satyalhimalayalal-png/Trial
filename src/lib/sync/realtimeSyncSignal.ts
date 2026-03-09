export const PLANNER_DATA_CHANGED_EVENT = "cheqlist:planner-data-changed";

export function emitPlannerDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLANNER_DATA_CHANGED_EVENT));
}

