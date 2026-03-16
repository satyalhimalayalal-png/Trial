"use client";

import type { ContainerRef, Task } from "@/types/domain";
import * as tasksRepo from "@/lib/db/repos/tasksRepo";

export function useTaskActions() {
  return {
    addTask: async (container: ContainerRef, title: string): Promise<void> => {
      await tasksRepo.createTask(container, title);
    },
    editTask: (taskId: string, title: string) => tasksRepo.updateTitle(taskId, title),
    toggleTask: (taskId: string) => tasksRepo.toggleComplete(taskId),
    deleteTask: (taskId: string) => tasksRepo.deleteTask(taskId),
    getTask: (taskId: string) => tasksRepo.getTask(taskId),
    restoreTask: (task: Task) => tasksRepo.restoreTask(task),
    moveTask: (taskId: string, to: ContainerRef, newOrder: number) =>
      tasksRepo.moveTask({ taskId, to, newOrder }),
    reorderTask: (taskId: string, container: ContainerRef, newOrder: number) =>
      tasksRepo.reorderTask({ taskId, container, newOrder }),
  };
}
