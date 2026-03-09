"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  exportPlannerBackup,
  getBackupTimestamp,
  importPlannerBackup,
  type PlannerBackupV1,
} from "@/lib/googleDriveStore";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const DRIVE_FOLDER_NAME = "CHEQLIST";
const DRIVE_FILE_NAME = "cheqlist-backup-v1.json";
const TOKEN_STORAGE_KEY = "cheqlist-google-access-token";
const TOKEN_EXP_STORAGE_KEY = "cheqlist-google-access-exp";
const EMAIL_STORAGE_KEY = "cheqlist-google-email";
const KEEP_SIGNED_IN_KEY = "cheqlist-google-keep-signed-in";
const PENDING_ANON_MERGE_KEY = "cheqlist-pending-anon-merge-v1";
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

interface PendingAnonMergePayload {
  targetProfileId: string;
  backup: PlannerBackupV1;
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

function toEpoch(value: string | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function mergeById<T extends { id: string }>(local: T[], remote: T[], getUpdatedAt: (item: T) => string): T[] {
  const merged = new Map<string, T>();
  for (const item of remote) merged.set(item.id, item);
  for (const item of local) {
    const prev = merged.get(item.id);
    if (!prev || toEpoch(getUpdatedAt(item)) >= toEpoch(getUpdatedAt(prev))) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

function mergePlannerBackups(local: PlannerBackupV1, remote: PlannerBackupV1): PlannerBackupV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: mergeById(local.data.tasks, remote.data.tasks, (item) => item.updatedAt),
      lists: mergeById(local.data.lists, remote.data.lists, (item) => item.updatedAt),
      preferences: mergeById(local.data.preferences, remote.data.preferences, (item) => item.updatedAt),
      recurrenceSeries: mergeById(local.data.recurrenceSeries, remote.data.recurrenceSeries, (item) => item.updatedAt),
      focusSessions: mergeById(local.data.focusSessions, remote.data.focusSessions, (item) => item.updatedAt),
    },
  };
}

function createEmptyBackup(): PlannerBackupV1 {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      tasks: [],
      lists: [],
      preferences: [],
      recurrenceSeries: [],
      focusSessions: [],
    },
  };
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
  const silentAttemptRef = useRef(false);
  const autoReconnectAttemptedRef = useRef(false);

  const disabled = useMemo(() => !clientId, [clientId]);
  const initials = (email?.trim().charAt(0) || "U").toUpperCase();

  const applyToken = async (response: GoogleTokenResponse) => {
    setConnecting(false);
    const token = response.access_token;
    if (!token) {
      if (silentAttemptRef.current) {
        silentAttemptRef.current = false;
        setStatus("Not connected");
        return;
      }
      if (response.error) setStatus(`Sign-in failed: ${response.error}`);
      return;
    }
    silentAttemptRef.current = false;
    const expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXP_STORAGE_KEY, String(expiresAt));
    const nextEmail = await getEmail(token);
    if (nextEmail) {
      setEmail(nextEmail);
      localStorage.setItem(EMAIL_STORAGE_KEY, nextEmail);
      const nextProfileId = toProfileIdFromEmail(nextEmail);
      const currentProfileId = getActiveProfileId();
      if (nextProfileId !== currentProfileId) {
        if (currentProfileId === ANON_PROFILE_ID) {
          const anonBackup = await exportPlannerBackup();
          const payload: PendingAnonMergePayload = {
            targetProfileId: nextProfileId,
            backup: anonBackup,
          };
          localStorage.setItem(PENDING_ANON_MERGE_KEY, JSON.stringify(payload));
        }
        setActiveProfileId(nextProfileId);
        setStatus("Connected. Loading account...");
        window.location.reload();
        return;
      }
    }
    tokenRef.current = token;
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
    if (keepSignedIn) {
      autoReconnectAttemptedRef.current = false;
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

      const existingToken = localStorage.getItem(TOKEN_STORAGE_KEY);
      const existingExp = Number(localStorage.getItem(TOKEN_EXP_STORAGE_KEY) ?? "0");
      const existingEmail = localStorage.getItem(EMAIL_STORAGE_KEY);
      if (existingEmail) setEmail(existingEmail);
      if (existingToken && existingExp > Date.now()) {
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
  }, [clientId]);

  useEffect(() => {
    if (!ready || signedIn || !keepSignedIn || autoReconnectAttemptedRef.current) return;
    if (!tokenClientRef.current) return;
    autoReconnectAttemptedRef.current = true;
    silentAttemptRef.current = true;
    setConnecting(true);
    tokenClientRef.current.requestAccessToken({ prompt: "" });
  }, [ready, signedIn, keepSignedIn]);

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
    setSyncing(true);
    try {
      const folderId = await ensureFolder(accessToken);
      const local = await exportPlannerBackup();
      const remoteMeta = await findBackupFile(accessToken, folderId);
      if (!remoteMeta?.id) {
        await uploadBackup(accessToken, local, folderId);
        setStatus(`Synced ${new Date().toLocaleTimeString()}`);
        return;
      }
      const remote = await downloadBackup(accessToken, remoteMeta.id);
      const merged = mergePlannerBackups(local, remote);
      await importPlannerBackup(merged);
      await uploadBackup(accessToken, merged, folderId, remoteMeta.id);
      setStatus(`Synced ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setStatus(`Sync failed: ${summarizeError(error)}`);
    } finally {
      setSyncing(false);
    }
  };

  const initialMerge = async () => {
    const accessToken = tokenRef.current;
    if (!accessToken) return;
    setSyncing(true);
    try {
      const folderId = await ensureFolder(accessToken);
      let local = await exportPlannerBackup();
      const currentProfileId = getActiveProfileId();
      const pendingRaw = localStorage.getItem(PENDING_ANON_MERGE_KEY);
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw) as PendingAnonMergePayload;
          if (pending?.targetProfileId === currentProfileId && pending.backup?.version === 1) {
            local = mergePlannerBackups(local, pending.backup);
            await importPlannerBackup(local);
            localStorage.removeItem(PENDING_ANON_MERGE_KEY);
          }
        } catch {
          localStorage.removeItem(PENDING_ANON_MERGE_KEY);
        }
      }
      const remoteMeta = await findBackupFile(accessToken, folderId);
      if (!remoteMeta) {
        await uploadBackup(accessToken, local, folderId);
        setStatus("Connected and synced");
        return;
      }
      const remote = await downloadBackup(accessToken, remoteMeta.id);
      const remoteTs = getBackupTimestamp(remote) || Date.parse(remoteMeta.modifiedTime ?? "");
      const localTs = getBackupTimestamp(local);
      const merged = mergePlannerBackups(local, remote);
      await importPlannerBackup(merged);
      await uploadBackup(accessToken, merged, folderId, remoteMeta.id);
      setStatus(remoteTs > localTs ? "Connected and restored" : "Connected and synced");
    } catch (error) {
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
    const id = window.setInterval(() => {
      void syncNow();
    }, 60000);
    return () => window.clearInterval(id);
  }, [signedIn]);

  const onConnect = () => {
    if (!tokenClientRef.current || connecting) return;
    silentAttemptRef.current = false;
    setConnecting(true);
    tokenClientRef.current.requestAccessToken({ prompt: keepSignedIn ? "select_account" : "consent select_account" });
  };

  const onDisconnect = () => {
    tokenRef.current = null;
    setSignedIn(false);
    setConnecting(false);
    setStatus("Not connected");
    setEmail(null);
    setActiveProfileId(ANON_PROFILE_ID);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXP_STORAGE_KEY);
    localStorage.removeItem(EMAIL_STORAGE_KEY);
    window.location.reload();
  };

  const onResetData = async () => {
    const confirmed = window.confirm("Reset all data for this profile? This cannot be undone.");
    if (!confirmed) return;
    setSyncing(true);
    try {
      const empty = createEmptyBackup();
      await importPlannerBackup(empty);
      const accessToken = tokenRef.current;
      if (signedIn && accessToken) {
        const folderId = await ensureFolder(accessToken);
        const remoteMeta = await findBackupFile(accessToken, folderId);
        await uploadBackup(accessToken, empty, folderId, remoteMeta?.id);
      }
      setStatus("Data reset");
      window.location.reload();
    } catch (error) {
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
