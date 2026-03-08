import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/dexie";
import type { PlannerList, SystemListKey } from "@/types/domain";

const DEFAULT_SYSTEM_LISTS: Array<{ name: string; systemKey: SystemListKey }> = [
  { name: "This Week", systemKey: "THIS_WEEK" },
  { name: "This Month", systemKey: "THIS_MONTH" },
  { name: "This Year", systemKey: "THIS_YEAR" },
];

const ACTIVE_SYSTEM_KEYS = new Set(DEFAULT_SYSTEM_LISTS.map((entry) => entry.systemKey));

export async function ensureDefaultLists(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const systemLists = await db.lists.filter((list) => list.kind === "SYSTEM").toArray();
  const byKey = new Map(systemLists.map((list) => [list.systemKey, list]));

  await db.transaction("rw", db.lists, async () => {
    let orderCursor = 1024;

    for (const entry of DEFAULT_SYSTEM_LISTS) {
      const existing = byKey.get(entry.systemKey);

      if (existing) {
        await db.lists.update(existing.id, {
          name: entry.name,
          order: orderCursor,
          archived: false,
          updatedAt: now,
        });
      } else {
        const row: PlannerList = {
          id: nanoid(),
          name: entry.name,
          kind: "SYSTEM",
          systemKey: entry.systemKey,
          order: orderCursor,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.lists.add(row);
      }

      orderCursor += 1024;
    }

    for (const list of systemLists) {
      if (!ACTIVE_SYSTEM_KEYS.has(list.systemKey ?? "INBOX")) {
        await db.lists.update(list.id, {
          archived: true,
          updatedAt: now,
        });
      }
    }
  });
}
