import Dexie, { type EntityTable } from "dexie";
import type { FocusSession, PlannerList, RecurrenceSeries, SyncTombstone, Task, UserPreferences } from "@/types/domain";
import { emitPlannerDataChanged } from "@/lib/sync/realtimeSyncSignal";

const ACTIVE_PROFILE_KEY = "cheqlist-active-profile";
const ANON_PROFILE_ID = "anon";

function getActiveProfileId(): string {
  if (typeof window === "undefined") return ANON_PROFILE_ID;
  return localStorage.getItem(ACTIVE_PROFILE_KEY) ?? ANON_PROFILE_ID;
}

function getDbNameForProfile(profileId: string): string {
  if (profileId === ANON_PROFILE_ID) return "planner_v1";
  return `planner_v1_${profileId}`;
}

class PlannerDB extends Dexie {
  tasks!: EntityTable<Task, "id">;
  lists!: EntityTable<PlannerList, "id">;
  preferences!: EntityTable<UserPreferences, "id">;
  recurrenceSeries!: EntityTable<RecurrenceSeries, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  syncTombstones!: EntityTable<SyncTombstone, "id">;

  constructor(dbName: string) {
    super(dbName);

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
            columns: 5,
            textSize: "md",
            spacing: "roomy",
            showCompleted: true,
            bulletStyle: "none",
            weekStartMode: "MONDAY",
            showLines: true,
            theme: "dark",
            celebrations: true,
            updatedAt: new Date().toISOString(),
          } satisfies UserPreferences);
      });

    this.version(3).stores({
      tasks: "id, [containerType+containerId+order], [containerType+containerId+completed], updatedAt, seriesId, occurrenceDateKey",
      lists: "id, kind, order, archived, systemKey",
      preferences: "id, updatedAt",
      recurrenceSeries: "id, active, updatedAt",
      focusSessions: "id, startAt, weekKey, dayKey, taskId",
      syncTombstones: "id, entityType, entityId, deletedAt, updatedAt",
    });

    this.installRealtimeSyncHooks();
  }

  private installRealtimeSyncHooks(): void {
    const notify = () => emitPlannerDataChanged();
    const tableNames = [
      "tasks",
      "lists",
      "preferences",
      "recurrenceSeries",
      "focusSessions",
      "syncTombstones",
    ] as const;

    for (const tableName of tableNames) {
      const table = this.table(tableName);
      table.hook("creating", () => {
        notify();
      });
      table.hook("updating", () => {
        notify();
      });
      table.hook("deleting", () => {
        notify();
      });
    }
  }
}

let dbSingleton: PlannerDB | null = null;
let dbSingletonName: string | null = null;

export function getDb(): PlannerDB {
  const nextName = getDbNameForProfile(getActiveProfileId());
  if (!dbSingleton || dbSingletonName !== nextName) {
    if (dbSingleton) {
      dbSingleton.close();
    }
    dbSingleton = new PlannerDB(nextName);
    dbSingletonName = nextName;
  }
  return dbSingleton;
}
