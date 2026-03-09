import { NextResponse } from "next/server";
import { authenticateViewer, upsertSharedStatsSnapshot } from "@/lib/server/socialService";
import { jsonError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const payload = (await request.json()) as {
      total_focus_minutes_7d?: number;
      total_focus_minutes_30d?: number;
      total_focus_minutes_all_time?: number;
      pomodoros_completed_7d?: number;
      pomodoros_completed_30d?: number;
      current_streak_days?: number;
      longest_streak_days?: number;
      last_active_at?: string | null;
    };
    const snapshot = await upsertSharedStatsSnapshot(viewer.user.id, payload);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return jsonError(error);
  }
}
