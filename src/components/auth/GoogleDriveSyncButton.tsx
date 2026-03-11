"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyBackup,
  exportPlannerBackup,
  getBackupTimestamp,
  importPlannerBackup,
  mergePlannerBackups,
  type PlannerBackupV1,
} from "@/lib/googleDriveStore";
import {
  GOOGLE_EMAIL_STORAGE_KEY,
  GOOGLE_TOKEN_EXP_STORAGE_KEY,
  GOOGLE_TOKEN_STORAGE_KEY,
  clearGoogleSession,
  readGoogleSession,
  writeGoogleSession,
} from "@/lib/auth/googleSession";
import { PLANNER_DATA_CHANGED_EVENT } from "@/lib/sync/realtimeSyncSignal";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const DRIVE_FOLDER_NAME = "CHEQLIST";
const DRIVE_FILE_NAME = "cheqlist-backup-v1.json";
const KEEP_SIGNED_IN_KEY = "cheqlist-google-keep-signed-in";
const ACTIVE_PROFILE_KEY = "cheqlist-active-profile";
const ANON_PROFILE_ID = "anon";

type GoogleTokenClient = {
  requestAccessToken: (args?: { prompt?: string }) => void;
};

interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface DriveFileMeta {
  id: string;
  modifiedTime?: string;
}

function normalizeProfileValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

function toProfileIdFromEmail(email: string): string {
  return `acct_${normalizeProfileValue(email)}`;
}

function getActiveProfileId(): string {
  if (typeof window === "undefined") return ANON_PROFILE_ID;
  return localStorage.getItem(ACTIVE_PROFILE_KEY) ?? ANON_PROFILE_ID;
}

function setActiveProfileId(profileId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
}

async function readApiError(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    if (!text) return fallback;
    const parsed = JSON.parse(text) as unknown;
    let message: string | undefined;
    let status: string | undefined;

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const errorValue = record.error;
      if (errorValue && typeof errorValue === "object") {
        const errorRecord = errorValue as Record<string, unknown>;
        message = typeof errorRecord.message === "string" ? errorRecord.message : undefined;
        status = typeof errorRecord.status === "string" ? errorRecord.status : undefined;
      }
      if (!message && typeof record.message === "string") {
        message = record.message;
      }
    }

    return status ? `${fallback} ${status}: ${message ?? "Unknown error"}` : `${fallback}: ${message ?? text}`;
  } catch {
    return fallback;
  }
}

function summarizeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown error";
}

function getGoogleTokenClient(clientId: string, callback: (token: GoogleTokenResponse) => void): GoogleTokenClient | null {
  const googleRef = (window as Window & { google?: unknown }).google as
    | {
        accounts?: {
          oauth2?: {
            initTokenClient?: (config: {
              client_id: string;
              scope: string;
              callback: (response: GoogleTokenResponse) => void;
            }) => GoogleTokenClient;
          };
        };
      }
    | undefined;

  return googleRef?.accounts?.oauth2?.initTokenClient?.({
    client_id: clientId,
    scope: DRIVE_SCOPE,
    callback,
  }) ?? null;
}

async function findFolder(accessToken: string): Promise<DriveFileMeta | null> {
  const q = encodeURIComponent(
    `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive list failed: ${await readApiError(res)}`);
  const json = (await res.json()) as { files?: DriveFileMeta[] };
  return json.files?.[0] ?? null;
}

async function createFolder(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    }),
  });
  if (!res.ok) throw new Error(`Drive folder create failed: ${await readApiError(res)}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

async function ensureFolder(accessToken: string): Promise<string> {
  const folder = await findFolder(accessToken);
  if (folder?.id) return folder.id;
  return createFolder(accessToken);
}

async function findBackupFile(accessToken: string, folderId: string): Promise<DriveFileMeta | null> {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,modifiedTime)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Drive list failed: ${await readApiError(res)}`);
  const json = (await res.json()) as { files?: DriveFileMeta[] };
  return json.files?.[0] ?? null;
}

async function downloadBackup(accessToken: string, fileId: string): Promise<PlannerBackupV1> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${await readApiError(res)}`);
  return (await res.json()) as PlannerBackupV1;
}

async function uploadBackup(accessToken: string, payload: PlannerBackupV1, folderId: string, fileId?: string): Promise<void> {
  const boundary = `cheqlist_${Math.random().toString(36).slice(2)}`;
  const metadata = fileId
    ? { name: DRIVE_FILE_NAME, mimeType: "application/json" }
    : { name: DRIVE_FILE_NAME, parents: [folderId], mimeType: "application/json" };

  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    `${JSON.stringify(payload)}\r\n` +
    `--${boundary}--`;

  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const method = fileId ? "PATCH" : "POST";

  const res = await fetch(endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive upload failed: ${await readApiError(res)}`);
}

async function getEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export function GoogleDriveSyncButton({
  align = "left",
  variant = "menu",
}: {
  align?: "left" | "right";
  variant?: "menu" | "panel";
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<string>("Not connected");
  const [email, setEmail] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastMergedTsRef = useRef(0);
  const lastRemoteModifiedRef = useRef<string>("");
  const syncingRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const suppressRealtimeSyncRef = useRef(false);
  const realtimeSyncTimerRef = useRef<number | null>(null);

  const disabled = useMemo(() => !clientId, [clientId]);
  const initials = (email?.trim().charAt(0) || "U").toUpperCase();

  const applyToken = async (response: GoogleTokenResponse) => {
    setConnecting(false);
    const token = response.access_token;
    if (!token) {
      if (response.error) setStatus(`Sign-in failed: ${response.error}`);
      return;
    }
    const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
    const nextEmail = await getEmail(token);
    writeGoogleSession({
      token,
      expiresAt,
      email: nextEmail,
      keepSignedIn,
    });
    if (nextEmail) {
      setEmail(nextEmail);
      const nextProfileId = toProfileIdFromEmail(nextEmail);
      const currentProfileId = getActiveProfileId();
      if (nextProfileId !== currentProfileId) {
        setActiveProfileId(nextProfileId);
        setStatus("Connected. Loading account...");
        window.location.reload();
        return;
      }
    }
    tokenRef.current = token;
    lastMergedTsRef.current = 0;
    lastRemoteModifiedRef.current = "";
    setSignedIn(true);
    setStatus("Connected");
  };

  useEffect(() => {
    const saved = localStorage.getItem(KEEP_SIGNED_IN_KEY);
    if (saved === null) return;
    setKeepSignedIn(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem(KEEP_SIGNED_IN_KEY, keepSignedIn ? "1" : "0");
    if (!keepSignedIn) {
      localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
      localStorage.removeItem(GOOGLE_TOKEN_EXP_STORAGE_KEY);
      localStorage.removeItem(GOOGLE_EMAIL_STORAGE_KEY);
    }
  }, [keepSignedIn]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const waitForGoogle = window.setInterval(() => {
      if (cancelled) return;
      const client = getGoogleTokenClient(clientId, (resp) => {
        void applyToken(resp);
      });
      if (!client) return;
      tokenClientRef.current = client;
      setReady(true);
      window.clearInterval(waitForGoogle);

      const existingSession = readGoogleSession();
      const existingToken = existingSession?.token ?? null;
      const existingEmail = existingSession?.email ?? null;
      if (existingEmail) setEmail(existingEmail);
      if (existingToken) {
        if (existingEmail) {
          const desiredProfileId = toProfileIdFromEmail(existingEmail);
          const activeProfileId = getActiveProfileId();
          if (desiredProfileId !== activeProfileId) {
            setActiveProfileId(desiredProfileId);
            window.location.reload();
            return;
          }
        }
        tokenRef.current = existingToken;
        setSignedIn(true);
        setStatus("Connected");
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearInterval(waitForGoogle);
    };
  }, [clientId, keepSignedIn]);

  useEffect(() => {
    syncingRef.current = syncing;
  }, [syncing]);

  const scheduleRealtimeSync = (delayMs = 250) => {
    if (realtimeSyncTimerRef.current) {
      window.clearTimeout(realtimeSyncTimerRef.current);
    }
    realtimeSyncTimerRef.current = window.setTimeout(() => {
      realtimeSyncTimerRef.current = null;
      if (!signedIn || !tokenRef.current) return;
      pendingSyncRef.current = false;
      void syncNow();
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (realtimeSyncTimerRef.current) {
        window.clearTimeout(realtimeSyncTimerRef.current);
        realtimeSyncTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClickOutside);
    return () => window.removeEventListener("mousedown", onClickOutside);
  }, []);

  const syncNow = async () => {
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    if (syncingRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    setSyncing(true);
    try {
      const folderId = await ensureFolder(accessToken);
      const local = await exportPlannerBackup();
      const localTs = getBackupTimestamp(local);
      const remoteMeta = await findBackupFile(accessToken, folderId);
      if (!remoteMeta?.id) {
        await uploadBackup(accessToken, local, folderId);
        lastMergedTsRef.current = localTs;
        lastRemoteModifiedRef.current = remoteMeta?.modifiedTime ?? "";
        setStatus(`Synced ${new Date().toLocaleTimeString()}`);
        return;
      }

      const remoteModified = remoteMeta.modifiedTime ?? "";
      if (localTs <= lastMergedTsRef.current && remoteModified && remoteModified === lastRemoteModifiedRef.current) {
        setStatus("Up to date");
        return;
      }

      const remote = await downloadBackup(accessToken, remoteMeta.id);
      const remoteTs = getBackupTimestamp(remote) || Date.parse(remoteModified);
      const merged = mergePlannerBackups(local, remote);
      const mergedTs = getBackupTimestamp(merged);
      suppressRealtimeSyncRef.current = true;
      await importPlannerBackup(merged);
      suppressRealtimeSyncRef.current = false;
      if (localTs > remoteTs || mergedTs > remoteTs) {
        await uploadBackup(accessToken, merged, folderId, remoteMeta.id);
      }
      lastMergedTsRef.current = mergedTs;
      lastRemoteModifiedRef.current = remoteModified;
      setStatus(`Synced ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      suppressRealtimeSyncRef.current = false;
      setStatus(`Sync failed: ${summarizeError(error)}`);
    } finally {
      setSyncing(false);
      if (pendingSyncRef.current) {
        scheduleRealtimeSync(350);
      }
    }
  };

  const initialMerge = async () => {
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    setSyncing(true);
    try {
      const folderId = await ensureFolder(accessToken);
      const local = await exportPlannerBackup();
      const remoteMeta = await findBackupFile(accessToken, folderId);
      if (!remoteMeta) {
        await uploadBackup(accessToken, local, folderId);
        lastMergedTsRef.current = getBackupTimestamp(local);
        setStatus("Connected and synced");
        return;
      }
      const remote = await downloadBackup(accessToken, remoteMeta.id);
      const remoteTs = getBackupTimestamp(remote) || Date.parse(remoteMeta.modifiedTime ?? "");
      const localTs = getBackupTimestamp(local);
      const merged = mergePlannerBackups(local, remote);
      const mergedTs = getBackupTimestamp(merged);
      suppressRealtimeSyncRef.current = true;
      await importPlannerBackup(merged);
      suppressRealtimeSyncRef.current = false;
      if (localTs > remoteTs || mergedTs > remoteTs) {
        await uploadBackup(accessToken, merged, folderId, remoteMeta.id);
      }
      lastMergedTsRef.current = mergedTs;
      lastRemoteModifiedRef.current = remoteMeta.modifiedTime ?? "";
      setStatus(remoteTs > localTs ? "Connected and restored" : "Connected and synced");
    } catch (error) {
      suppressRealtimeSyncRef.current = false;
      setStatus(`Connected, merge failed: ${summarizeError(error)}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!signedIn || !tokenRef.current) return;
    void initialMerge();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !tokenRef.current) return;
    const onDataChanged = () => {
      if (suppressRealtimeSyncRef.current) return;
      pendingSyncRef.current = true;
      scheduleRealtimeSync(250);
    };
    const onFocusSync = () => {
      if (!tokenRef.current || !signedIn) return;
      void syncNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        onFocusSync();
      }
    };

    window.addEventListener(PLANNER_DATA_CHANGED_EVENT, onDataChanged as EventListener);
    window.addEventListener("focus", onFocusSync);
    window.addEventListener("online", onFocusSync);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener(PLANNER_DATA_CHANGED_EVENT, onDataChanged as EventListener);
      window.removeEventListener("focus", onFocusSync);
      window.removeEventListener("online", onFocusSync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [signedIn]);

  const onConnect = () => {
    if (!tokenClientRef.current || connecting) return;
    setConnecting(true);
    tokenClientRef.current.requestAccessToken({ prompt: "consent select_account" });
  };

  const onDisconnect = () => {
    tokenRef.current = null;
    lastMergedTsRef.current = 0;
    lastRemoteModifiedRef.current = "";
    setSignedIn(false);
    setConnecting(false);
    setStatus("Not connected");
    setEmail(null);
    setActiveProfileId(ANON_PROFILE_ID);
    clearGoogleSession();
    window.location.reload();
  };

  const onResetData = async () => {
    const confirmed = window.confirm("Reset all data for this profile? This cannot be undone.");
    if (!confirmed) return;
    setSyncing(true);
    try {
      const empty = createEmptyBackup();
      suppressRealtimeSyncRef.current = true;
      await importPlannerBackup(empty);
      suppressRealtimeSyncRef.current = false;
      const accessToken = tokenRef.current;
      if (signedIn && accessToken) {
        const folderId = await ensureFolder(accessToken);
        const remoteMeta = await findBackupFile(accessToken, folderId);
        await uploadBackup(accessToken, empty, folderId, remoteMeta?.id);
      }
      setStatus("Data reset");
      window.location.reload();
    } catch (error) {
      suppressRealtimeSyncRef.current = false;
      setStatus(`Reset failed: ${summarizeError(error)}`);
    } finally {
      setSyncing(false);
    }
  };

  if (variant === "panel") {
    return (
      <div className="rounded border border-theme p-2 text-xs">
        {disabled ? (
          <p className="text-muted">Google login unavailable. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.</p>
        ) : signedIn ? (
          <div className="space-y-2">
            <p className="text-muted">Logged in as</p>
            <p className="truncate font-semibold">{email ?? "Google user"}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-theme px-2 py-1"
                onClick={() => void syncNow()}
                disabled={syncing}
              >
                {syncing ? "Syncing..." : "Sync now"}
              </button>
              <button type="button" className="rounded border border-theme px-2 py-1" onClick={onDisconnect}>
                Logout
              </button>
            </div>
            <button type="button" className="rounded border border-red-500 px-2 py-1 text-red-500" onClick={() => void onResetData()} disabled={syncing}>
              Reset Data
            </button>
            <p className="text-[11px] text-muted">{status}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted">Not logged in</p>
            <button type="button" className="rounded border border-theme px-2 py-1" onClick={onConnect} disabled={!ready || connecting}>
              {!ready ? "Loading..." : connecting ? "Opening..." : "Sign in with Google"}
            </button>
            <label className="flex items-center gap-2 text-[11px] text-muted">
              <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} />
              Keep me signed in
            </label>
            <button type="button" className="rounded border border-red-500 px-2 py-1 text-red-500" onClick={() => void onResetData()} disabled={syncing}>
              Reset Data
            </button>
            <p className="text-[11px] text-muted">{status}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        className="ui-app-btn user-account-btn"
        onClick={() => setMenuOpen((prev) => !prev)}
        title="User account"
        aria-label="User account"
      >
        {signedIn ? initials : "👤"}
      </button>

      {menuOpen ? (
        <div
          className={`absolute top-[calc(100%+6px)] z-50 min-w-[220px] rounded border border-theme surface p-2 text-xs shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {disabled ? (
            <p className="text-muted">Google login unavailable. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.</p>
          ) : signedIn ? (
            <div className="space-y-2">
              <p className="text-muted">Logged in as</p>
              <p className="truncate font-semibold">{email ?? "Google user"}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded border border-theme px-2 py-1"
                  onClick={() => void syncNow()}
                  disabled={syncing}
                >
                  {syncing ? "Syncing..." : "Sync now"}
                </button>
                <button type="button" className="rounded border border-theme px-2 py-1" onClick={onDisconnect}>
                  Logout
                </button>
              </div>
              <button type="button" className="rounded border border-red-500 px-2 py-1 text-red-500" onClick={() => void onResetData()} disabled={syncing}>
                Reset Data
              </button>
              <p className="text-[11px] text-muted">{status}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted">Not logged in</p>
              <button type="button" className="rounded border border-theme px-2 py-1" onClick={onConnect} disabled={!ready || connecting}>
                {!ready ? "Loading..." : connecting ? "Opening..." : "Sign in with Google"}
              </button>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <input type="checkbox" checked={keepSignedIn} onChange={(event) => setKeepSignedIn(event.target.checked)} />
                Keep me signed in
              </label>
              <button type="button" className="rounded border border-red-500 px-2 py-1 text-red-500" onClick={() => void onResetData()} disabled={syncing}>
                Reset Data
              </button>
              <p className="text-[11px] text-muted">{status}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
