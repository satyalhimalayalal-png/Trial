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
      hour_totals_24?: number[];
      hour_by_day_totals_7x24?: number[][];
      daily_totals_30d?: number[];
      weekly_totals_12w?: number[];
      monthly_totals_12m?: number[];
      year_heatmap_days?: Array<{ dateKey: string; value: number }>;
      last_active_at?: string | null;
    };
    const snapshot = await upsertSharedStatsSnapshot(viewer.user.id, payload);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return jsonError(error);
  }
}
