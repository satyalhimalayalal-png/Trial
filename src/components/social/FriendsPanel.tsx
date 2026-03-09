"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PrivacySettings, SharedStatsSnapshot, SocialUser } from "@/types/social";

const TOKEN_STORAGE_KEY = "cheqlist-google-access-token";
const DEFAULT_PRIVACY: Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests"> = {
  profile_visibility: "friends_only",
  stats_visibility: "friends_only",
  allow_friend_requests: "everyone",
};

type FriendWithSnapshot = {
  user: SocialUser;
  stats: SharedStatsSnapshot | null;
  privacy: PrivacySettings;
  connected_at: string;
};

type PendingIncoming = {
  id: number;
  sender: SocialUser;
  created_at: string;
};

type PendingOutgoing = {
  id: number;
  recipient: SocialUser;
  created_at: string;
};

async function parseResponseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `HTTP ${res.status}`;
    const body = JSON.parse(text) as { error?: string };
    return body.error ?? text;
  } catch {
    return `HTTP ${res.status}`;
  }
}

function formatMinutes(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function FriendsPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [viewer, setViewer] = useState<SocialUser | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [friends, setFriends] = useState<FriendWithSnapshot[]>([]);
  const [incoming, setIncoming] = useState<PendingIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<PendingOutgoing[]>([]);
  const [privacy, setPrivacy] = useState<Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests">>(
    DEFAULT_PRIVACY,
  );

  const authenticated = useMemo(() => Boolean(token), [token]);
  const canUseFriends = Boolean(viewer?.username_is_custom);

  const socialFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!token) throw new Error("Please sign in with Google first.");
      const res = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        throw new Error(await parseResponseError(res));
      }
      return (await res.json()) as T;
    },
    [token],
  );

  const refreshSocial = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const meRes = await socialFetch<{ user: SocialUser }>("/api/social/me");
      setViewer(meRes.user);
      setUsernameDraft(meRes.user.username);

      const [friendsRes, requestsRes, privacyRes] = await Promise.all([
        socialFetch<{ friends: FriendWithSnapshot[] }>("/api/social/friends"),
        socialFetch<{ incoming: PendingIncoming[]; outgoing: PendingOutgoing[] }>("/api/social/requests"),
        socialFetch<{ privacy: PrivacySettings }>("/api/social/privacy"),
      ]);

      setFriends(friendsRes.friends ?? []);
      setIncoming(requestsRes.incoming ?? []);
      setOutgoing(requestsRes.outgoing ?? []);
      setPrivacy({
        profile_visibility: privacyRes.privacy?.profile_visibility ?? "friends_only",
        stats_visibility: privacyRes.privacy?.stats_visibility ?? "friends_only",
        allow_friend_requests: privacyRes.privacy?.allow_friend_requests ?? "everyone",
      });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load friends data");
    } finally {
      setLoading(false);
    }
  }, [socialFetch, token]);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    setToken(stored);
  }, []);

  useEffect(() => {
    if (!token) return;
    void refreshSocial();
  }, [token, refreshSocial]);

  const sendRequest = async () => {
    if (!canUseFriends) {
      setStatus("Set your custom username first.");
      return;
    }
    if (!recipientUsername.trim()) return;
    setBusy(true);
    try {
      const payload = { action: "send", recipientUsername: recipientUsername.trim() };
      await socialFetch<{ autoAccepted?: boolean }>("/api/social/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRecipientUsername("");
      setStatus("Friend request sent.");
      await refreshSocial();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send friend request");
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = async () => {
    if (!usernameDraft.trim()) return;
    setBusy(true);
    try {
      const res = await socialFetch<{ user: SocialUser }>("/api/social/me", {
        method: "PATCH",
        body: JSON.stringify({ username: usernameDraft.trim() }),
      });
      setViewer(res.user);
      setUsernameDraft(res.user.username);
      setStatus(`Username updated: @${res.user.username}`);
      await refreshSocial();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update username");
    } finally {
      setBusy(false);
    }
  };

  const resolveRequest = async (id: number, action: "accept" | "decline" | "cancel") => {
    setBusy(true);
    try {
      await socialFetch("/api/social/requests", {
        method: "POST",
        body: JSON.stringify({ action, requestId: id }),
      });
      setStatus(action === "accept" ? "Friend request accepted." : action === "decline" ? "Friend request declined." : "Friend request cancelled.");
      await refreshSocial();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update friend request");
    } finally {
      setBusy(false);
    }
  };

  const removeFriend = async (friendId: string) => {
    setBusy(true);
    try {
      await socialFetch<{ removed: boolean }>(`/api/social/friendships/${friendId}`, {
        method: "DELETE",
      });
      setStatus("Friend removed.");
      await refreshSocial();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to remove friend");
    } finally {
      setBusy(false);
    }
  };

  const updatePrivacy = async (patch: Partial<typeof privacy>) => {
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    setBusy(true);
    try {
      const response = await socialFetch<{ privacy: PrivacySettings }>("/api/social/privacy", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setPrivacy({
        profile_visibility: response.privacy.profile_visibility,
        stats_visibility: response.privacy.stats_visibility,
        allow_friend_requests: response.privacy.allow_friend_requests,
      });
      setStatus("Privacy settings updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update privacy settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-3 rounded border border-theme p-2 text-xs">
      <p className="uppercase text-muted">Friends</p>

      {!authenticated ? (
        <p className="mt-2 text-muted">Sign in with Google in Account to enable friends.</p>
      ) : (
        <div className="mt-2 space-y-3">
          <div>
            <p className="text-muted">Your username</p>
            <div className="mt-1 flex items-center gap-1">
              <input
                value={usernameDraft}
                onChange={(event) => setUsernameDraft(event.target.value)}
                placeholder="choose_username"
                className="w-full rounded border border-theme surface px-2 py-1"
              />
              <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void saveUsername()} disabled={busy || loading}>
                Save
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Visible as @{viewer?.username ?? "username"}. Allowed: a-z 0-9 . _ - (3-32 chars)
            </p>
            {!canUseFriends ? <p className="mt-1 text-[11px] text-red-400">Set a custom username to start using friends.</p> : null}
          </div>

          <div>
            <p className="text-muted">Add friend by username</p>
            <div className="mt-1 flex items-center gap-1">
              <input
                value={recipientUsername}
                onChange={(event) => setRecipientUsername(event.target.value)}
                placeholder="@username"
                className="w-full rounded border border-theme surface px-2 py-1"
              />
              <button
                type="button"
                className="rounded border border-theme px-2 py-1"
                onClick={() => void sendRequest()}
                disabled={busy || loading || !canUseFriends}
              >
                Send
              </button>
            </div>
          </div>

          <div>
            <p className="text-muted">Privacy</p>
            <div className="mt-1 grid grid-cols-1 gap-1">
              <label className="flex items-center justify-between gap-2">
                <span>Profile</span>
                <select
                  className="rounded border border-theme surface px-2 py-1"
                  value={privacy.profile_visibility}
                  onChange={(event) => void updatePrivacy({ profile_visibility: event.target.value as typeof privacy.profile_visibility })}
                  disabled={busy || loading}
                >
                  <option value="private">private</option>
                  <option value="friends_only">friends only</option>
                  <option value="public">public</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Stats</span>
                <select
                  className="rounded border border-theme surface px-2 py-1"
                  value={privacy.stats_visibility}
                  onChange={(event) => void updatePrivacy({ stats_visibility: event.target.value as typeof privacy.stats_visibility })}
                  disabled={busy || loading}
                >
                  <option value="private">private</option>
                  <option value="friends_only">friends only</option>
                  <option value="public">public</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Requests</span>
                <select
                  className="rounded border border-theme surface px-2 py-1"
                  value={privacy.allow_friend_requests}
                  onChange={(event) => void updatePrivacy({ allow_friend_requests: event.target.value as typeof privacy.allow_friend_requests })}
                  disabled={busy || loading}
                >
                  <option value="everyone">everyone</option>
                  <option value="nobody">nobody</option>
                </select>
              </label>
            </div>
          </div>

          <div>
            <p className="text-muted">Incoming ({incoming.length})</p>
            <div className="mt-1 space-y-1">
              {incoming.length === 0 ? <p className="text-muted">None</p> : null}
              {incoming.map((request) => (
                <div key={request.id} className="rounded border border-theme p-2">
                  <p className="truncate">{request.sender.display_name ?? `@${request.sender.username}`}</p>
                  <p className="truncate text-muted">@{request.sender.username}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void resolveRequest(request.id, "accept")} disabled={busy || !canUseFriends}>
                      Accept
                    </button>
                    <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void resolveRequest(request.id, "decline")} disabled={busy || !canUseFriends}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted">Outgoing ({outgoing.length})</p>
            <div className="mt-1 space-y-1">
              {outgoing.length === 0 ? <p className="text-muted">None</p> : null}
              {outgoing.map((request) => (
                <div key={request.id} className="rounded border border-theme p-2">
                  <p className="truncate">{request.recipient.display_name ?? `@${request.recipient.username}`}</p>
                  <p className="truncate text-muted">@{request.recipient.username}</p>
                  <div className="mt-1">
                    <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void resolveRequest(request.id, "cancel")} disabled={busy || !canUseFriends}>
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-muted">Friends ({friends.length})</p>
            <div className="mt-1 space-y-1">
              {friends.length === 0 ? <p className="text-muted">No friends yet</p> : null}
              {friends.map((friend) => (
                <div key={friend.user.id} className="rounded border border-theme p-2">
                  <p className="truncate">{friend.user.display_name ?? `@${friend.user.username}`}</p>
                  <Link href={`/analytics/friend/${friend.user.id}`} className="truncate text-[var(--custom-color)] hover:underline">
                    @{friend.user.username}
                  </Link>
                  <p className="text-muted">
                    7d: {formatMinutes(friend.stats?.total_focus_minutes_7d)} | 30d: {formatMinutes(friend.stats?.total_focus_minutes_30d)}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    <Link href={`/analytics/friend/${friend.user.id}`} className="rounded border border-theme px-2 py-1">
                      View analytics
                    </Link>
                    <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void removeFriend(friend.user.id)} disabled={busy || !canUseFriends}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void refreshSocial()} disabled={busy || loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <span className="text-[11px] text-muted">{status}</span>
          </div>
        </div>
      )}
    </section>
  );
}
