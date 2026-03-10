export type VisibilitySetting = "private" | "friends_only" | "public";
export type FriendRequestPermission = "everyone" | "nobody";
export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface PrivacySettings {
  user_id: string;
  profile_visibility: VisibilitySetting;
  stats_visibility: VisibilitySetting;
  allow_friend_requests: FriendRequestPermission;
  updated_at: string;
}

export interface SharedStatsSnapshot {
  user_id: string;
  total_focus_minutes_7d: number;
  total_focus_minutes_30d: number;
  total_focus_minutes_all_time: number;
  pomodoros_completed_7d: number;
  pomodoros_completed_30d: number;
  current_streak_days: number;
  longest_streak_days: number;
  hour_totals_24: number[];
  hour_by_day_totals_7x24?: number[][];
  daily_totals_30d: number[];
  weekly_totals_12w: number[];
  monthly_totals_12m: number[];
  year_heatmap_days: Array<{ dateKey: string; value: number }>;
  last_active_at: string | null;
  updated_at: string;
}

export interface SocialUser {
  id: string;
  username: string;
  username_is_custom: boolean;
  google_email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface FriendRequest {
  id: number;
  sender_id: string;
  recipient_id: string;
  status: FriendRequestStatus;
  created_at: string;
  resolved_at: string | null;
}
