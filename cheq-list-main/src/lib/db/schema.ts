import type { PlannerList, Task } from "@/types/domain";

export interface PlannerDbSchema {
  tasks: Task;
  lists: PlannerList;
}
