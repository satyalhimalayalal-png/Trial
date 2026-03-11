import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { extractBearerToken, verifyGoogleAccessToken, type GoogleIdentity } from "@/lib/server/googleIdentity";
import type {
  FriendRequest,
  FriendRequestPermission,
  FriendRequestStatus,
  PrivacySettings,
  SharedStatsSnapshot,
  SocialUser,
  VisibilitySetting,
} from "@/types/social";

const DEFAULT_PRIVACY: Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests"> = {
  profile_visibility: "friends_only",
  stats_visibility: "friends_only",
  allow_friend_requests: "everyone",
};

function normalizeUsernameSeed(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
  return cleaned || "user";
}

function ensureUsername(value: string): string {
  const username = normalizeUsernameSeed(value);
  if (username.length < 3) return `${username.padEnd(3, "x")}`;
  return username.slice(0, 32);
}

function validateUsername(value: string): string {
  const username = ensureUsername(value);
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Invalid username. Use 3-32 chars: a-z 0-9 . _ -");
  }
  return username;
}

async function generateAvailableUsername(seedRaw: string): Promise<string> {
  const seed = ensureUsername(seedRaw);
  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? seed : `${seed.slice(0, Math.max(3, 32 - String(i).length - 1))}_${i}`;
    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
  }
  throw new Error("Unable to allocate username");
}

function canonicalPair(a: string, b: string): { low: string; high: string } {
  return a < b ? { low: a, high: b } : { low: b, high: a };
}

function toSocialErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown social error";
}

function ensureVisibility(value: unknown, field: string): VisibilitySetting {
  if (value === "private" || value === "friends_only" || value === "public") return value;
  throw new Error(`Invalid ${field}`);
}

function ensureFriendRequestPermission(value: unknown): FriendRequestPermission {
  if (value === "everyone" || value === "nobody") return value;
  throw new Error("Invalid allow_friend_requests");
}

function ensureNonNegativeInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid ${field}`);
  return Math.round(n);
}

function normalizeNumberArray(
  value: unknown,
  length: number,
  field: string,
): number[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field}`);
  if (value.length !== length) throw new Error(`Invalid ${field} length`);
  return value.map((item, index) => ensureNonNegativeInt(item, `${field}[${index}]`));
}

function normalizeHourByDayTotals(value: unknown): number[][] {
  if (!Array.isArray(value)) throw new Error("Invalid hour_by_day_totals_7x24");
  if (value.length !== 7) throw new Error("Invalid hour_by_day_totals_7x24 length");
  return value.map((row, day) => normalizeNumberArray(row, 24, `hour_by_day_totals_7x24[${day}]`));
}

function normalizeYearHeatmapDays(value: unknown): Array<{ dateKey: string; value: number }> {
  if (!Array.isArray(value)) throw new Error("Invalid year_heatmap_days");
  if (value.length > 1200) throw new Error("Invalid year_heatmap_days length");
  return value
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") throw new Error(`Invalid year_heatmap_days[${index}]`);
      const row = entry as { dateKey?: unknown; value?: unknown };
      const dateKey = typeof row.dateKey === "string" ? row.dateKey : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error(`Invalid year_heatmap_days[${index}].dateKey`);
      return {
        dateKey,
        value: ensureNonNegativeInt(row.value ?? 0, `year_heatmap_days[${index}].value`),
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export interface ViewerContext {
  token: string;
  identity: GoogleIdentity;
  user: SocialUser;
}

export async function provisionAppUser(identity: GoogleIdentity): Promise<SocialUser> {
  const email = identity.email.toLowerCase();
  const fallbackSeed = email.split("@")[0] || "user";
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .eq("google_email", email)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    const patch: Partial<SocialUser> & { updated_at: string } = {
      display_name: identity.name ?? null,
      avatar_url: identity.picture ?? null,
      updated_at: nowIso,
    };
    if (!existing.username) {
      patch.username = await generateAvailableUsername(fallbackSeed);
    }
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("app_users")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError || !updated) throw new Error(updateError?.message ?? "Failed to update app user");
    const { error: privacyError } = await supabaseAdmin
      .from("privacy_settings")
      .upsert(
        {
          user_id: updated.id,
          ...DEFAULT_PRIVACY,
          updated_at: nowIso,
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (privacyError) throw new Error(privacyError.message);
    return updated;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const username = await generateAvailableUsername(fallbackSeed);
    const { data: created, error: createError } = await supabaseAdmin
      .from("app_users")
      .insert({
        google_email: email,
        username,
        username_is_custom: false,
        display_name: identity.name ?? null,
        avatar_url: identity.picture ?? null,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (!createError && created) {
      const { error: privacyError } = await supabaseAdmin
        .from("privacy_settings")
        .upsert(
          {
            user_id: created.id,
            ...DEFAULT_PRIVACY,
            updated_at: nowIso,
          },
          { onConflict: "user_id", ignoreDuplicates: true },
        );
      if (privacyError) throw new Error(privacyError.message);
      return created;
    }

    const msg = createError?.message ?? "Failed to provision app user";
    if (msg.includes("app_users_google_email_key")) {
      // raced with another request; load the winner row
      const { data: racedUser, error: racedError } = await supabaseAdmin
        .from("app_users")
        .select("*")
        .eq("google_email", email)
        .single();
      if (racedError || !racedUser) throw new Error(racedError?.message ?? msg);
      return racedUser;
    }
    if (msg.includes("app_users_username_key")) continue;
    throw new Error(msg);
  }

  throw new Error("Failed to provision app user after username retries");
}

export async function authenticateViewer(request: Request): Promise<ViewerContext> {
  const token = extractBearerToken(request);
  const identity = await verifyGoogleAccessToken(token);
  const user = await provisionAppUser(identity);
  return { token, identity, user };
}

async function getPrivacy(userId: string): Promise<PrivacySettings> {
  const { data, error } = await supabaseAdmin
    .from("privacy_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data;

  const { error: upsertError } = await supabaseAdmin
    .from("privacy_settings")
    .upsert(
      {
        user_id: userId,
        ...DEFAULT_PRIVACY,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (upsertError) throw new Error(upsertError.message);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("privacy_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (insertError || !inserted) throw new Error(insertError?.message ?? "Failed to create privacy settings");
  return inserted;
}

async function areFriends(userA: string, userB: string): Promise<boolean> {
  const pair = canonicalPair(userA, userB);
  const { data, error } = await supabaseAdmin
    .from("friendships")
    .select("user_low_id")
    .eq("user_low_id", pair.low)
    .eq("user_high_id", pair.high)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function sendFriendRequest(senderId: string, recipientIdentifierRaw: string): Promise<{
  request: FriendRequest;
  autoAccepted: boolean;
}> {
  const recipientIdentifier = recipientIdentifierRaw.trim().toLowerCase().replace(/^@+/, "");
  if (!recipientIdentifier) throw new Error("Recipient username is required");

  const recipientQuery = supabaseAdmin.from("app_users").select("*");
  const { data: recipient, error: recipientError } = recipientIdentifier.includes("@")
    ? await recipientQuery.eq("google_email", recipientIdentifier).maybeSingle()
    : await recipientQuery.eq("username", recipientIdentifier).maybeSingle();

  if (recipientError) throw new Error(recipientError.message);
  if (!recipient) throw new Error("Recipient not found. Check username.");
  if (recipient.id === senderId) throw new Error("You cannot send a friend request to yourself");

  if (await areFriends(senderId, recipient.id)) {
    throw new Error("Already friends");
  }

  const recipientPrivacy = await getPrivacy(recipient.id);
  if (recipientPrivacy.allow_friend_requests === "nobody") {
    throw new Error("This user is not accepting friend requests");
  }

  const { data: outgoingPending, error: outgoingError } = await supabaseAdmin
    .from("friend_requests")
    .select("*")
    .eq("sender_id", senderId)
    .eq("recipient_id", recipient.id)
    .eq("status", "pending")
    .maybeSingle();
  if (outgoingError) throw new Error(outgoingError.message);
  if (outgoingPending) return { request: outgoingPending, autoAccepted: false };

  const { data: reversePending, error: reverseError } = await supabaseAdmin
    .from("friend_requests")
    .select("*")
    .eq("sender_id", recipient.id)
    .eq("recipient_id", senderId)
    .eq("status", "pending")
    .maybeSingle();
  if (reverseError) throw new Error(reverseError.message);
  if (reversePending) {
    throw new Error("This user already sent you a request. Open Incoming and accept or decline.");
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("friend_requests")
    .insert({
      sender_id: senderId,
      recipient_id: recipient.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    const msg = toSocialErrorMessage(insertError);
    if (msg.toLowerCase().includes("duplicate")) {
      const { data: existing } = await supabaseAdmin
        .from("friend_requests")
        .select("*")
        .eq("sender_id", senderId)
        .eq("recipient_id", recipient.id)
        .eq("status", "pending")
        .maybeSingle();
      if (existing) return { request: existing, autoAccepted: false };
    }
    throw new Error(msg);
  }

  return { request: inserted, autoAccepted: false };
}

export async function acceptFriendRequest(actorId: string, requestId: number): Promise<FriendRequest> {
  const { data, error } = await supabaseAdmin.rpc("accept_friend_request", {
    p_request_id: requestId,
    p_actor_id: actorId,
  });
  if (!error && data) return data as FriendRequest;

  const message = error?.message ?? "Failed to accept request";
  if (message.includes("request_not_pending")) {
    const { data: request, error: requestError } = await supabaseAdmin
      .from("friend_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Friend request not found");
    if (request.recipient_id !== actorId) throw new Error("Only the recipient can accept this request");
    if (request.status === "accepted") return request as FriendRequest;
    throw new Error("Friend request has already been resolved");
  }
  if (message.includes("request_not_found")) throw new Error("Friend request not found");
  if (message.includes("not_request_recipient")) throw new Error("Only the recipient can accept this request");
  throw new Error(message);
}

async function updateRequestStatus(
  actorId: string,
  requestId: number,
  nextStatus: Extract<FriendRequestStatus, "declined" | "cancelled">,
): Promise<FriendRequest> {
  const { data: request, error: requestError } = await supabaseAdmin
    .from("friend_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Friend request not found");
  if (request.status !== "pending") {
    if (request.status === nextStatus) {
      if (nextStatus === "declined" && request.recipient_id === actorId) return request as FriendRequest;
      if (nextStatus === "cancelled" && request.sender_id === actorId) return request as FriendRequest;
    }
    throw new Error("Friend request has already been resolved");
  }

  if (nextStatus === "declined" && request.recipient_id !== actorId) {
    throw new Error("Only the recipient can decline this request");
  }
  if (nextStatus === "cancelled" && request.sender_id !== actorId) {
    throw new Error("Only the sender can cancel this request");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("friend_requests")
    .update({
      status: nextStatus,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updateError || !updated) throw new Error(updateError?.message ?? "Failed to update friend request");
  return updated;
}

export async function declineFriendRequest(actorId: string, requestId: number): Promise<FriendRequest> {
  return updateRequestStatus(actorId, requestId, "declined");
}

export async function cancelFriendRequest(actorId: string, requestId: number): Promise<FriendRequest> {
  return updateRequestStatus(actorId, requestId, "cancelled");
}

export async function removeFriend(actorId: string, friendId: string): Promise<boolean> {
  if (actorId === friendId) throw new Error("Cannot remove yourself");
  const pair = canonicalPair(actorId, friendId);
  const { error, count } = await supabaseAdmin
    .from("friendships")
    .delete({ count: "exact" })
    .eq("user_low_id", pair.low)
    .eq("user_high_id", pair.high);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function listPendingRequests(userId: string): Promise<{
  incoming: Array<FriendRequest & { sender: SocialUser }>;
  outgoing: Array<FriendRequest & { recipient: SocialUser }>;
}> {
  const { data: incomingRows, error: incomingError } = await supabaseAdmin
    .from("friend_requests")
    .select("*")
    .eq("recipient_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (incomingError) throw new Error(incomingError.message);

  const { data: outgoingRows, error: outgoingError } = await supabaseAdmin
    .from("friend_requests")
    .select("*")
    .eq("sender_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (outgoingError) throw new Error(outgoingError.message);

  const incoming = (incomingRows ?? []) as FriendRequest[];
  const outgoing = (outgoingRows ?? []) as FriendRequest[];

  const incomingSenderIds = [...new Set(incoming.map((row) => row.sender_id))];
  const outgoingRecipientIds = [...new Set(outgoing.map((row) => row.recipient_id))];
  const allUserIds = [...new Set([...incomingSenderIds, ...outgoingRecipientIds])];

  const usersById = new Map<string, SocialUser>();
  if (allUserIds.length > 0) {
    const { data: users, error: usersError } = await supabaseAdmin
      .from("app_users")
      .select("*")
      .in("id", allUserIds);
    if (usersError) throw new Error(usersError.message);
    for (const user of (users ?? []) as SocialUser[]) usersById.set(user.id, user);
  }

  return {
    incoming: incoming
      .map((row) => ({ ...row, sender: usersById.get(row.sender_id) }))
      .filter((row): row is FriendRequest & { sender: SocialUser } => Boolean(row.sender)),
    outgoing: outgoing
      .map((row) => ({ ...row, recipient: usersById.get(row.recipient_id) }))
      .filter((row): row is FriendRequest & { recipient: SocialUser } => Boolean(row.recipient)),
  };
}

export async function listFriends(userId: string): Promise<
  Array<{
    user: SocialUser;
    stats: SharedStatsSnapshot | null;
    privacy: PrivacySettings;
    connected_at: string;
  }>
> {
  const { data: edges, error: edgesError } = await supabaseAdmin
    .from("friendships")
    .select("*")
    .or(`user_low_id.eq.${userId},user_high_id.eq.${userId}`);
  if (edgesError) throw new Error(edgesError.message);

  const friendshipEdges = (edges ?? []) as Array<{
    user_low_id: string;
    user_high_id: string;
    created_at: string;
  }>;

  const friendIds = friendshipEdges.map((edge) => (edge.user_low_id === userId ? edge.user_high_id : edge.user_low_id));
  if (friendIds.length === 0) return [];

  const [{ data: users, error: usersError }, { data: privacyRows, error: privacyError }, { data: snapshots, error: snapshotsError }] =
    await Promise.all([
      supabaseAdmin.from("app_users").select("*").in("id", friendIds),
      supabaseAdmin.from("privacy_settings").select("*").in("user_id", friendIds),
      supabaseAdmin.from("shared_stats_snapshots").select("*").in("user_id", friendIds),
    ]);

  if (usersError) throw new Error(usersError.message);
  if (privacyError) throw new Error(privacyError.message);
  if (snapshotsError) throw new Error(snapshotsError.message);

  const userMap = new Map(((users ?? []) as SocialUser[]).map((user) => [user.id, user]));
  const privacyMap = new Map(((privacyRows ?? []) as PrivacySettings[]).map((row) => [row.user_id, row]));
  const snapshotMap = new Map(((snapshots ?? []) as SharedStatsSnapshot[]).map((row) => [row.user_id, row]));
  const edgeMap = new Map(
    friendshipEdges.map((edge) => [
      edge.user_low_id === userId ? edge.user_high_id : edge.user_low_id,
      edge.created_at,
    ]),
  );

  return friendIds
    .map((friendId) => {
      const user = userMap.get(friendId);
      if (!user) return null;
      const privacy = privacyMap.get(friendId) ?? {
        user_id: friendId,
        ...DEFAULT_PRIVACY,
        updated_at: new Date().toISOString(),
      };
      const stats = privacy.stats_visibility === "private" ? null : snapshotMap.get(friendId) ?? null;
      return {
        user,
        stats,
        privacy,
        connected_at: edgeMap.get(friendId) ?? new Date().toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function searchUsersByUsername(
  actorId: string,
  queryRaw: string,
  limitRaw = 8,
): Promise<
  Array<{
    user: SocialUser;
    relation: "none" | "friend" | "incoming" | "outgoing";
    request_id: number | null;
  }>
> {
  const query = queryRaw.trim().toLowerCase().replace(/^@+/, "");
  if (query.length < 2) return [];

  const limit = Math.min(20, Math.max(1, Math.trunc(limitRaw)));
  const { data: users, error: usersError } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .neq("id", actorId)
    .ilike("username", `${query}%`)
    .order("username", { ascending: true })
    .limit(limit);
  if (usersError) throw new Error(usersError.message);

  const candidates = (users ?? []) as SocialUser[];
  if (candidates.length === 0) return [];
  const userIds = candidates.map((user) => user.id);

  const [friendLowRes, friendHighRes, incomingRes, outgoingRes] = await Promise.all([
    supabaseAdmin
      .from("friendships")
      .select("user_high_id")
      .eq("user_low_id", actorId)
      .in("user_high_id", userIds),
    supabaseAdmin
      .from("friendships")
      .select("user_low_id")
      .eq("user_high_id", actorId)
      .in("user_low_id", userIds),
    supabaseAdmin
      .from("friend_requests")
      .select("id,sender_id")
      .eq("recipient_id", actorId)
      .eq("status", "pending")
      .in("sender_id", userIds),
    supabaseAdmin
      .from("friend_requests")
      .select("id,recipient_id")
      .eq("sender_id", actorId)
      .eq("status", "pending")
      .in("recipient_id", userIds),
  ]);

  if (friendLowRes.error) throw new Error(friendLowRes.error.message);
  if (friendHighRes.error) throw new Error(friendHighRes.error.message);
  if (incomingRes.error) throw new Error(incomingRes.error.message);
  if (outgoingRes.error) throw new Error(outgoingRes.error.message);

  const friendIds = new Set<string>();
  for (const row of (friendLowRes.data ?? []) as Array<{ user_high_id: string }>) friendIds.add(row.user_high_id);
  for (const row of (friendHighRes.data ?? []) as Array<{ user_low_id: string }>) friendIds.add(row.user_low_id);

  const incomingByUser = new Map<string, number>();
  for (const row of (incomingRes.data ?? []) as Array<{ id: number; sender_id: string }>) {
    incomingByUser.set(row.sender_id, row.id);
  }

  const outgoingByUser = new Map<string, number>();
  for (const row of (outgoingRes.data ?? []) as Array<{ id: number; recipient_id: string }>) {
    outgoingByUser.set(row.recipient_id, row.id);
  }

  return candidates.map((user) => {
    if (friendIds.has(user.id)) {
      return { user, relation: "friend", request_id: null };
    }
    if (incomingByUser.has(user.id)) {
      return { user, relation: "incoming", request_id: incomingByUser.get(user.id) ?? null };
    }
    if (outgoingByUser.has(user.id)) {
      return { user, relation: "outgoing", request_id: outgoingByUser.get(user.id) ?? null };
    }
    return { user, relation: "none", request_id: null };
  });
}

export async function updatePrivacySettings(
  userId: string,
  patch: Partial<Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests">>,
): Promise<PrivacySettings> {
  const next = {
    user_id: userId,
    profile_visibility:
      patch.profile_visibility === undefined
        ? undefined
        : ensureVisibility(patch.profile_visibility, "profile_visibility"),
    stats_visibility:
      patch.stats_visibility === undefined ? undefined : ensureVisibility(patch.stats_visibility, "stats_visibility"),
    allow_friend_requests:
      patch.allow_friend_requests === undefined
        ? undefined
        : ensureFriendRequestPermission(patch.allow_friend_requests),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("privacy_settings")
    .upsert(next, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update privacy settings");
  return data;
}

export async function upsertSharedStatsSnapshot(
  userId: string,
  payload: Partial<SharedStatsSnapshot>,
): Promise<SharedStatsSnapshot> {
  const now = new Date().toISOString();
  const normalized = {
    user_id: userId,
    total_focus_minutes_7d: ensureNonNegativeInt(payload.total_focus_minutes_7d ?? 0, "total_focus_minutes_7d"),
    total_focus_minutes_30d: ensureNonNegativeInt(payload.total_focus_minutes_30d ?? 0, "total_focus_minutes_30d"),
    total_focus_minutes_all_time: ensureNonNegativeInt(payload.total_focus_minutes_all_time ?? 0, "total_focus_minutes_all_time"),
    pomodoros_completed_7d: ensureNonNegativeInt(payload.pomodoros_completed_7d ?? 0, "pomodoros_completed_7d"),
    pomodoros_completed_30d: ensureNonNegativeInt(payload.pomodoros_completed_30d ?? 0, "pomodoros_completed_30d"),
    current_streak_days: ensureNonNegativeInt(payload.current_streak_days ?? 0, "current_streak_days"),
    longest_streak_days: ensureNonNegativeInt(payload.longest_streak_days ?? 0, "longest_streak_days"),
    hour_totals_24: normalizeNumberArray(payload.hour_totals_24 ?? Array.from({ length: 24 }, () => 0), 24, "hour_totals_24"),
    hour_by_day_totals_7x24: normalizeHourByDayTotals(
      payload.hour_by_day_totals_7x24 ?? Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    ),
    daily_totals_30d: normalizeNumberArray(payload.daily_totals_30d ?? Array.from({ length: 30 }, () => 0), 30, "daily_totals_30d"),
    weekly_totals_12w: normalizeNumberArray(payload.weekly_totals_12w ?? Array.from({ length: 12 }, () => 0), 12, "weekly_totals_12w"),
    monthly_totals_12m: normalizeNumberArray(payload.monthly_totals_12m ?? Array.from({ length: 12 }, () => 0), 12, "monthly_totals_12m"),
    year_heatmap_days: normalizeYearHeatmapDays(payload.year_heatmap_days ?? []),
    last_active_at: payload.last_active_at ?? null,
    updated_at: now,
  };

  let { data, error } = await supabaseAdmin
    .from("shared_stats_snapshots")
    .upsert(normalized, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error?.message?.includes("hour_by_day_totals_7x24")) {
    const legacyPayload = { ...normalized };
    delete (legacyPayload as { hour_by_day_totals_7x24?: number[][] }).hour_by_day_totals_7x24;
    const retry = await supabaseAdmin
      .from("shared_stats_snapshots")
      .upsert(legacyPayload, { onConflict: "user_id" })
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) throw new Error(error?.message ?? "Failed to upsert shared stats snapshot");
  return data;
}

export async function getProfileForViewer(viewerId: string, targetUserId: string): Promise<{
  user: SocialUser;
  privacy: PrivacySettings;
  is_owner: boolean;
  is_friend: boolean;
  can_view_profile: boolean;
  can_view_stats: boolean;
  stats: SharedStatsSnapshot | null;
}> {
  const { data: target, error: targetError } = await supabaseAdmin
    .from("app_users")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target) throw new Error("User not found");

  const privacy = await getPrivacy(targetUserId);
  const isOwner = viewerId === targetUserId;
  const isFriend = isOwner ? false : await areFriends(viewerId, targetUserId);

  const canViewProfile =
    isOwner ||
    privacy.profile_visibility === "public" ||
    (privacy.profile_visibility === "friends_only" && isFriend);
  const canViewStats =
    isOwner || privacy.stats_visibility === "public" || (privacy.stats_visibility === "friends_only" && isFriend);

  if (!canViewProfile) {
    throw new Error("Profile is not visible to this viewer");
  }

  let stats: SharedStatsSnapshot | null = null;
  if (canViewStats) {
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("shared_stats_snapshots")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (snapshotError) throw new Error(snapshotError.message);
    stats = snapshot ?? null;
  }

  return {
    user: target,
    privacy,
    is_owner: isOwner,
    is_friend: isFriend,
    can_view_profile: canViewProfile,
    can_view_stats: canViewStats,
    stats,
  };
}

export async function updateUsername(userId: string, desiredUsernameRaw: string): Promise<SocialUser> {
  const desiredUsername = validateUsername(desiredUsernameRaw.trim());

  const { data: conflict, error: conflictError } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("username", desiredUsername)
    .neq("id", userId)
    .maybeSingle();
  if (conflictError) throw new Error(conflictError.message);
  if (conflict) throw new Error("Username already taken");

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update({
      username: desiredUsername,
      username_is_custom: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to update username");
  return data;
}

export async function checkUsernameAvailability(
  userId: string,
  desiredUsernameRaw: string,
): Promise<{ normalized: string; valid: boolean; available: boolean }> {
  const normalized = desiredUsernameRaw.trim().toLowerCase().replace(/^@+/, "");
  const valid = /^[a-z0-9._-]{3,32}$/.test(normalized);
  if (!valid) {
    return { normalized, valid: false, available: false };
  }

  const { data: conflict, error } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("username", normalized)
    .neq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { normalized, valid: true, available: !conflict };
}
