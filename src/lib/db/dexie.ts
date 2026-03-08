import Dexie, { type EntityTable } from "dexie";
import type { FocusSession, PlannerList, RecurrenceSeries, Task, UserPreferences } from "@/types/domain";

class PlannerDB extends Dexie {
  tasks!: EntityTable<Task, "id">;
  lists!: EntityTable<PlannerList, "id">;
  preferences!: EntityTable<UserPreferences, "id">;
  recurrenceSeries!: EntityTable<RecurrenceSeries, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;

  constructor() {
    super("planner_v1");

    this.version(1).stores({
      tasks: "id, [containerType+containerId+order], [containerType+containerId+completed], updatedAt",
      lists: "id, kind, order, archived, systemKey",
    });

    this.version(2)
      .stores({
        tasks: "id, [containerType+containerId+order], [containerType+containerId+completed], updatedAt, seriesId, occurrenceDateKey",
        lists: "id, kind, order, archived, systemKey",
        preferences: "id, updatedAt",
        recurrenceSeries: "id, active, updatedAt",
        focusSessions: "id, startAt, weekKey, dayKey, taskId",
      })
      .upgrade((tx) => {
        return tx
          .table("preferences")
          .put({
            id: "prefs",
            accentColor: "coral",
            columns: 7,
            textSize: "md",
            spacing: "cozy",
            showCompleted: true,
            bulletStyle: "dot",
            weekStartMode: "MONDAY",
            showLines: true,
            theme: "light",
            celebrations: true,
            updatedAt: new Date().toISOString(),
          } satisfies UserPreferences);
      });
  }
}

let dbSingleton: PlannerDB | null = null;

export function getDb(): PlannerDB {
  if (!dbSingleton) {
    dbSingleton = new PlannerDB();
  }
  return dbSingleton;
}
