import { NextResponse } from "next/server";
import { authenticateViewer, updatePrivacySettings } from "@/lib/server/socialService";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { jsonError } from "@/lib/server/http";

export async function PATCH(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const patch = (await request.json()) as {
      profile_visibility?: "private" | "friends_only" | "public";
      stats_visibility?: "private" | "friends_only" | "public";
      allow_friend_requests?: "everyone" | "nobody";
    };
    const settings = await updatePrivacySettings(viewer.user.id, patch);
    return NextResponse.json({ privacy: settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    const viewer = await authenticateViewer(request);
    const { data, error } = await supabaseAdmin
      .from("privacy_settings")
      .select("*")
      .eq("user_id", viewer.user.id)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      privacy:
        data ?? {
          user_id: viewer.user.id,
          profile_visibility: "friends_only",
          stats_visibility: "friends_only",
          allow_friend_requests: "everyone",
          updated_at: new Date().toISOString(),
        },
    });
  } catch (error) {
    return jsonError(error);
  }
}
