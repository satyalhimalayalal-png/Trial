"use client";

import type { ContainerRef, Task } from "@/types/domain";
import * as tasksRepo from "@/lib/db/repos/tasksRepo";

export function useTaskActions() {
  return {
    addTask: (container: ContainerRef, title: string, options?: { parentTaskId?: string }) =>
      tasksRepo.createTask(container, title, options),
    editTask: (taskId: string, title: string) => tasksRepo.updateTitle(taskId, title),
    toggleTask: (taskId: string) => tasksRepo.toggleComplete(taskId),
    deleteTask: (taskId: string) => tasksRepo.deleteTask(taskId),
    getTask: (taskId: string) => tasksRepo.getTask(taskId),
    restoreTask: (task: Task) => tasksRepo.restoreTask(task),
    restoreTasks: (tasks: Task[]) => tasksRepo.restoreTasks(tasks),
    moveTask: (taskId: string, to: ContainerRef, newOrder: number) =>
      tasksRepo.moveTask({ taskId, to, newOrder }),
    reorderTask: (taskId: string, container: ContainerRef, newOrder: number) =>
      tasksRepo.reorderTask({ taskId, container, newOrder }),
  };
}
