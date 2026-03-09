import { getDb } from "@/lib/db/dexie";
import type { UserPreferences } from "@/types/domain";

export const defaultPreferences: UserPreferences = {
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
};

export async function getPreferences(): Promise<UserPreferences> {
  const db = getDb();
  const prefs = await db.preferences.get("prefs");

  if (prefs) return prefs;
  await db.preferences.put(defaultPreferences);
  return defaultPreferences;
}

export async function patchPreferences(patch: Partial<UserPreferences>): Promise<void> {
  const db = getDb();
  const current = await getPreferences();
  await db.preferences.put({
    ...current,
    ...patch,
    id: "prefs",
    updatedAt: new Date().toISOString(),
  });
}
