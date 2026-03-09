"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PrivacySettings, SharedStatsSnapshot, SocialUser } from "@/types/social";

const TOKEN_STORAGE_KEY = "cheqlist-google-access-token";
const EMAIL_STORAGE_KEY = "cheqlist-google-email";
const SOCIAL_CACHE_PREFIX = "cheqlist-social-cache-v1";
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

type UserSuggestion = {
  user: SocialUser;
  relation: "none" | "friend" | "incoming" | "outgoing";
  request_id: number | null;
};

type UsernameState = "idle" | "checking" | "valid" | "invalid" | "taken" | "unchanged";

interface SocialCachePayload {
  viewer: SocialUser;
  friends: FriendWithSnapshot[];
  incoming: PendingIncoming[];
  outgoing: PendingOutgoing[];
  privacy: Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests">;
  cachedAt: number;
}

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

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function initials(user: SocialUser): string {
  const source = user.display_name?.trim() || user.username;
  return source.charAt(0).toUpperCase();
}

function socialCacheKey(email: string): string {
  return `${SOCIAL_CACHE_PREFIX}:${email.trim().toLowerCase()}`;
}

function Chevron({ open }: { open: boolean }) {
  return <span className="text-[13px] leading-none">{open ? "▴" : "▾"}</span>;
}

export function FriendsPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [viewer, setViewer] = useState<SocialUser | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameState, setUsernameState] = useState<UsernameState>("idle");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [friends, setFriends] = useState<FriendWithSnapshot[]>([]);
  const [incoming, setIncoming] = useState<PendingIncoming[]>([]);
  const [outgoing, setOutgoing] = useState<PendingOutgoing[]>([]);
  const [privacy, setPrivacy] = useState<Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests">>(
    DEFAULT_PRIVACY,
  );
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(true);
  const [friendsOpen, setFriendsOpen] = useState(true);

  const authenticated = useMemo(() => Boolean(token), [token]);
  const canUseFriends = Boolean(viewer?.username_is_custom);
  const normalizedRecipient = useMemo(() => normalizeUsername(recipientUsername), [recipientUsername]);

  const hydrateFromCache = useCallback((emailRaw: string | null) => {
    if (!emailRaw) return false;
    const key = socialCacheKey(emailRaw);
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as SocialCachePayload;
      setViewer(parsed.viewer);
      setUsernameDraft(parsed.viewer.username);
      setFriends(parsed.friends ?? []);
      setIncoming(parsed.incoming ?? []);
      setOutgoing(parsed.outgoing ?? []);
      setPrivacy(parsed.privacy ?? DEFAULT_PRIVACY);
      return true;
    } catch {
      return false;
    }
  }, []);

  const writeCache = useCallback((payload: SocialCachePayload) => {
    const key = socialCacheKey(payload.viewer.google_email);
    localStorage.setItem(key, JSON.stringify(payload));
  }, []);

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

  const refreshSocial = useCallback(
    async (showLoading = true) => {
      if (!token) return;
      if (showLoading) setLoading(true);
      try {
        const meRes = await socialFetch<{ user: SocialUser }>("/api/social/me");
        const [friendsRes, requestsRes, privacyRes] = await Promise.all([
          socialFetch<{ friends: FriendWithSnapshot[] }>("/api/social/friends"),
          socialFetch<{ incoming: PendingIncoming[]; outgoing: PendingOutgoing[] }>("/api/social/requests"),
          socialFetch<{ privacy: PrivacySettings }>("/api/social/privacy"),
        ]);

        const nextPrivacy = {
          profile_visibility: privacyRes.privacy?.profile_visibility ?? "friends_only",
          stats_visibility: privacyRes.privacy?.stats_visibility ?? "friends_only",
          allow_friend_requests: privacyRes.privacy?.allow_friend_requests ?? "everyone",
        } satisfies Pick<PrivacySettings, "profile_visibility" | "stats_visibility" | "allow_friend_requests">;

        setViewer(meRes.user);
        if (!usernameEditing) setUsernameDraft(meRes.user.username);
        setFriends(friendsRes.friends ?? []);
        setIncoming(requestsRes.incoming ?? []);
        setOutgoing(requestsRes.outgoing ?? []);
        setPrivacy(nextPrivacy);
        setStatus("");
        writeCache({
          viewer: meRes.user,
          friends: friendsRes.friends ?? [],
          incoming: requestsRes.incoming ?? [],
          outgoing: requestsRes.outgoing ?? [],
          privacy: nextPrivacy,
          cachedAt: Date.now(),
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load friends data");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [socialFetch, token, usernameEditing, writeCache],
  );

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    setToken(storedToken);
    if (storedToken) {
      const email = localStorage.getItem(EMAIL_STORAGE_KEY);
      const hit = hydrateFromCache(email);
      if (hit) setLoading(false);
    }
  }, [hydrateFromCache]);

  useEffect(() => {
    if (!token) return;
    void refreshSocial(false);
  }, [token, refreshSocial]);

  useEffect(() => {
    if (!token || !canUseFriends) {
      setSuggestions([]);
      return;
    }
    if (normalizedRecipient.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setSearchingUsers(true);
      void socialFetch<{ results: UserSuggestion[] }>(
        `/api/social/users?query=${encodeURIComponent(normalizedRecipient)}&limit=8`,
      )
        .then((response) => {
          if (cancelled) return;
          setSuggestions(response.results ?? []);
        })
        .catch((error) => {
          if (cancelled) return;
          setSuggestions([]);
          setStatus(error instanceof Error ? error.message : "Failed to search users");
        })
        .finally(() => {
          if (!cancelled) setSearchingUsers(false);
        });
    }, 170);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [canUseFriends, normalizedRecipient, socialFetch, token]);

  useEffect(() => {
    if (!usernameEditing || !viewer || !token) return;
    const candidate = normalizeUsername(usernameDraft);
    if (!candidate) {
      setUsernameState("invalid");
      return;
    }
    if (candidate === viewer.username) {
      setUsernameState("unchanged");
      return;
    }
    if (!/^[a-z0-9._-]{3,32}$/.test(candidate)) {
      setUsernameState("invalid");
      return;
    }

    let cancelled = false;
    setUsernameState("checking");
    const timeoutId = window.setTimeout(() => {
      void socialFetch<{ normalized: string; valid: boolean; available: boolean }>(
        `/api/social/users/availability?username=${encodeURIComponent(candidate)}`,
      )
        .then((result) => {
          if (cancelled) return;
          if (!result.valid) {
            setUsernameState("invalid");
            return;
          }
          setUsernameState(result.available ? "valid" : "taken");
        })
        .catch(() => {
          if (cancelled) return;
          setUsernameState("invalid");
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [socialFetch, token, usernameDraft, usernameEditing, viewer]);

  const sendRequest = async (explicitUsername?: string) => {
    if (!canUseFriends) {
      setStatus("Set your custom username first.");
      return;
    }
    const target = normalizeUsername(explicitUsername ?? recipientUsername);
    if (!target) return;
    setBusy(true);
    try {
      await socialFetch<{ autoAccepted?: boolean }>("/api/social/requests", {
        method: "POST",
        body: JSON.stringify({ action: "send", recipientUsername: target }),
      });
      setRecipientUsername("");
      setSuggestions([]);
      setStatus(`Friend request sent to @${target}.`);
      await refreshSocial(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to send friend request");
    } finally {
      setBusy(false);
    }
  };

  const commitUsername = async () => {
    if (!viewer) return;
    const candidate = normalizeUsername(usernameDraft);
    if (candidate === viewer.username) {
      setUsernameEditing(false);
      setUsernameState("idle");
      return;
    }
    if (usernameState !== "valid") return;

    setBusy(true);
    try {
      const res = await socialFetch<{ user: SocialUser }>("/api/social/me", {
        method: "PATCH",
        body: JSON.stringify({ username: candidate }),
      });
      setViewer(res.user);
      setUsernameDraft(res.user.username);
      setUsernameEditing(false);
      setUsernameState("idle");
      setStatus(`Username updated: @${res.user.username}`);
      await refreshSocial(false);
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
      await refreshSocial(false);
      setStatus(action === "accept" ? "Friend request accepted." : action === "decline" ? "Friend request declined." : "Friend request cancelled.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update friend request");
    } finally {
      setBusy(false);
    }
  };

  const removeFriend = async (friendId: string, username: string) => {
    const confirmed = window.confirm(`Remove @${username} from your friends?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await socialFetch<{ removed: boolean }>(`/api/social/friendships/${friendId}`, {
        method: "DELETE",
      });
      setStatus("Friend removed.");
      await refreshSocial(false);
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
      await refreshSocial(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update privacy settings");
    } finally {
      setBusy(false);
    }
  };

  const usernameIcon = usernameState === "checking" ? "…" : usernameState === "valid" || usernameState === "unchanged" ? "✓" : "✕";
  const usernamePositive = usernameState === "valid" || usernameState === "unchanged";

  return (
    <section className="mt-3 rounded-md border border-theme p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="uppercase text-muted">Friends & sharing</p>
        <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => void refreshSocial(true)} disabled={busy || !authenticated}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {!authenticated ? (
        <p className="mt-2 text-muted">Sign in with Google in Account to enable friends.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-theme">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-2 text-left"
              onClick={() => setPrivacyOpen((prev) => !prev)}
            >
              <span className="font-semibold">Privacy</span>
              <Chevron open={privacyOpen} />
            </button>
            {privacyOpen ? (
              <div className="border-t border-theme px-2 py-2">
                <div className="mb-2">
                  <p className="text-muted">Username</p>
                  {!usernameEditing ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">@{viewer?.username ?? "username"}</span>
                      <button type="button" className="rounded border border-theme px-2 py-1" onClick={() => {
                        setUsernameDraft(viewer?.username ?? "");
                        setUsernameEditing(true);
                        setUsernameState("unchanged");
                      }}>
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        value={usernameDraft}
                        onChange={(event) => setUsernameDraft(event.target.value)}
                        placeholder="username"
                        className="w-full rounded border border-theme surface px-2 py-1"
                      />
                      <button
                        type="button"
                        className={`h-8 w-8 rounded border text-sm font-semibold ${usernamePositive ? "border-green-500 text-green-500" : "border-red-500 text-red-500"}`}
                        onClick={() => void commitUsername()}
                        disabled={busy || !usernamePositive}
                        aria-label="Confirm username"
                      >
                        {usernameIcon}
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-1">
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
            ) : null}
          </div>

          <div className="rounded border border-theme">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-2 text-left"
              onClick={() => setFriendsOpen((prev) => !prev)}
            >
              <span className="font-semibold">Friends</span>
              <Chevron open={friendsOpen} />
            </button>

            {friendsOpen ? (
              <div className="border-t border-theme px-2 py-2">
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

                {normalizedRecipient.length >= 2 ? (
                  <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded border border-theme p-1">
                    {searchingUsers ? <p className="px-1 py-1 text-[11px] text-muted">Searching...</p> : null}
                    {!searchingUsers && suggestions.length === 0 ? <p className="px-1 py-1 text-[11px] text-muted">No matching usernames</p> : null}
                    {suggestions.map((item) => (
                      <div key={item.user.id} className="flex items-center gap-2 rounded border border-theme p-1.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-theme text-[11px] font-semibold">
                          {initials(item.user)}
                        </div>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setRecipientUsername(`@${item.user.username}`)}
                        >
                          <p className="truncate">@{item.user.username}</p>
                        </button>

                        {item.relation === "friend" ? <span className="rounded border border-theme px-2 py-0.5 text-[11px] text-muted">Friends</span> : null}
                        {item.relation === "none" ? (
                          <button type="button" className="rounded border border-theme px-2 py-0.5 text-[11px]" onClick={() => void sendRequest(item.user.username)} disabled={busy || !canUseFriends}>
                            Add
                          </button>
                        ) : null}
                        {item.relation === "outgoing" ? (
                          <button
                            type="button"
                            className="rounded border border-theme px-2 py-0.5 text-[11px]"
                            onClick={() => item.request_id && void resolveRequest(item.request_id, "cancel")}
                            disabled={busy || !item.request_id}
                          >
                            Cancel
                          </button>
                        ) : null}
                        {item.relation === "incoming" ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded border border-theme px-2 py-0.5 text-[11px]"
                              onClick={() => item.request_id && void resolveRequest(item.request_id, "accept")}
                              disabled={busy || !item.request_id}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="rounded border border-theme px-2 py-0.5 text-[11px]"
                              onClick={() => item.request_id && void resolveRequest(item.request_id, "decline")}
                              disabled={busy || !item.request_id}
                            >
                              ✕
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3">
                  <p className="text-muted">Incoming ({incoming.length})</p>
                  <div className="mt-1 space-y-1">
                    {incoming.length === 0 ? <p className="text-muted">None</p> : null}
                    {incoming.map((request) => (
                      <div key={request.id} className="flex items-center justify-between rounded border border-theme p-1.5">
                        <span className="truncate">@{request.sender.username}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded border border-theme px-2 py-0.5 text-[11px]" onClick={() => void resolveRequest(request.id, "accept")} disabled={busy || !canUseFriends}>
                            ✓
                          </button>
                          <button type="button" className="rounded border border-theme px-2 py-0.5 text-[11px]" onClick={() => void resolveRequest(request.id, "decline")} disabled={busy || !canUseFriends}>
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-muted">Outgoing ({outgoing.length})</p>
                  <div className="mt-1 space-y-1">
                    {outgoing.length === 0 ? <p className="text-muted">None</p> : null}
                    {outgoing.map((request) => (
                      <div key={request.id} className="flex items-center justify-between rounded border border-theme p-1.5">
                        <span className="truncate">@{request.recipient.username}</span>
                        <button type="button" className="rounded border border-theme px-2 py-0.5 text-[11px]" onClick={() => void resolveRequest(request.id, "cancel")} disabled={busy || !canUseFriends}>
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-muted">Friends ({friends.length})</p>
                  <div className="mt-1 space-y-1">
                    {friends.length === 0 ? <p className="text-muted">No friends yet</p> : null}
                    {friends.map((friend) => (
                      <div key={friend.user.id} className="relative rounded border border-theme p-2 pr-8">
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded border border-theme px-1.5 py-0.5 text-[11px]"
                          onClick={() => void removeFriend(friend.user.id, friend.user.username)}
                          disabled={busy || !canUseFriends}
                          aria-label={`Remove @${friend.user.username}`}
                        >
                          ✕
                        </button>
                        <p className="truncate font-semibold">@{friend.user.username}</p>
                        <Link href={`/analytics/friend/${friend.user.id}`} className="mt-1 inline-flex rounded border border-theme px-2 py-1">
                          View analytics
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <p className="text-[11px] text-muted">{status}</p>
        </div>
      )}
    </section>
  );
}
