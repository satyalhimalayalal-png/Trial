"use client";

import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/dexie";
import { defaultPreferences, getPreferences, patchPreferences } from "@/lib/db/repos/preferencesRepo";
import type { UserPreferences } from "@/types/domain";

const db = getDb();

export function usePreferences() {
  useEffect(() => {
    void getPreferences();
  }, []);

  const preferences = useLiveQuery<UserPreferences | undefined>(async () => {
    const row = await db.preferences.get("prefs");
    return row ?? defaultPreferences;
  }, []);

  return {
    preferences: preferences ?? defaultPreferences,
    ready: Boolean(preferences),
    patchPreferences,
  };
}
