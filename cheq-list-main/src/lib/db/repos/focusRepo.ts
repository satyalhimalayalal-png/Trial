import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/dexie";
import { toDayKey } from "@/lib/domain/dates";
import { format, startOfWeek } from "date-fns";
import type { FocusSession } from "@/types/domain";

function toWeekKey(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), "yyyy-MM-dd");
}

export async function startFocusSession(taskId?: string): Promise<FocusSession> {
  const db = getDb();
  const now = new Date();
  const startAt = now.toISOString();

  const session: FocusSession = {
    id: nanoid(),
    taskId,
    startAt,
    durationSec: 0,
    dayKey: toDayKey(now),
    weekKey: toWeekKey(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    createdAt: startAt,
    updatedAt: startAt,
  };

  await db.focusSessions.add(session);
  return session;
}

export async function stopFocusSession(sessionId: string): Promise<void> {
  const db = getDb();
  const session = await db.focusSessions.get(sessionId);
  if (!session) return;

  const end = new Date();
  const durationSec = Math.max(
    0,
    Math.floor((end.getTime() - new Date(session.startAt).getTime()) / 1000),
  );

  await db.focusSessions.update(sessionId, {
    endAt: end.toISOString(),
    durationSec,
    updatedAt: end.toISOString(),
  });
}

export async function listSessionsByWeek(weekKey: string): Promise<FocusSession[]> {
  const db = getDb();
  return db.focusSessions.where("weekKey").equals(weekKey).toArray();
}
