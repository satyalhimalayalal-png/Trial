"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { exportPlannerBackup, getBackupTimestamp, importPlannerBackup, type PlannerBackupV1 } from "@/lib/googleDriveStore";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";
const DRIVE_FOLDER_NAME = "CHEQLIST";
const DRIVE_FILE_NAME = "cheqlist-backup-v1.json";
const TOKEN_STORAGE_KEY = "cheqlist-google-access-token";
const TOKEN_EXP_STORAGE_KEY = "cheqlist-google-access-exp";
const EMAIL_STORAGE_KEY = "cheqlist-google-email";

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
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
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
  if (!res.ok) throw new Error(`Drive folder create failed (${res.status})`);
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
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const json = (await res.json()) as { files?: DriveFileMeta[] };
  return json.files?.[0] ?? null;
}

async function downloadBackup(accessToken: string, fileId: string): Promise<PlannerBackupV1> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
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
  if (!res.ok) throw new Error(`Drive upload failed (${res.status})`);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState<string>("Not connected");
  const [email, setEmail] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const disabled = useMemo(() => !clientId, [clientId]);
  const initials = (email?.trim().charAt(0) || "U").toUpperCase();

  const saveToken = (token: string, expiresIn?: number) => {
    tokenRef.current = token;
    setSignedIn(true);
    const expiresAt = Date.now() + (expiresIn ?? 3600) * 1000;
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXP_STORAGE_KEY, String(expiresAt));
  };

  const applyToken = async (response: GoogleTokenResponse) => {
    const token = response.access_token;
    if (!token) {
      if (response.error) setStatus(`Sign-in failed: ${response.error}`);
      return;
    }
    saveToken(token, response.expires_in);
    const nextEmail = await getEmail(token);
    if (nextEmail) {
      setEmail(nextEmail);
      localStorage.setItem(EMAIL_STORAGE_KEY, nextEmail);
    }
    setStatus("Connected");
  };

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
      await uploadBackup(accessToken, local, folderId, remoteMeta?.id);
      setStatus(`Synced ${new Date().toLocaleTimeString()}`);
    } catch {
      setStatus("Sync failed");
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
      const local = await exportPlannerBackup();
      const remoteMeta = await findBackupFile(accessToken, folderId);
      if (!remoteMeta) {
        await uploadBackup(accessToken, local, folderId);
        setStatus("Connected and synced");
        return;
      }
      const remote = await downloadBackup(accessToken, remoteMeta.id);
      const remoteTs = getBackupTimestamp(remote) || Date.parse(remoteMeta.modifiedTime ?? "");
      const localTs = getBackupTimestamp(local);
      if (remoteTs > localTs) {
        await importPlannerBackup(remote);
        setStatus("Connected and restored");
      } else {
        await uploadBackup(accessToken, local, folderId, remoteMeta.id);
        setStatus("Connected and synced");
      }
    } catch {
      setStatus("Connected, merge failed");
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
    if (!tokenClientRef.current) return;
    tokenClientRef.current.requestAccessToken({ prompt: "consent select_account" });
  };

  const onDisconnect = () => {
    tokenRef.current = null;
    setSignedIn(false);
    setStatus("Not connected");
    setEmail(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXP_STORAGE_KEY);
    localStorage.removeItem(EMAIL_STORAGE_KEY);
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
            <p className="text-[11px] text-muted">{status}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted">Not logged in</p>
            <button type="button" className="rounded border border-theme px-2 py-1" onClick={onConnect} disabled={!ready}>
              {ready ? "Sign in with Google" : "Loading..."}
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
              <p className="text-[11px] text-muted">{status}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-muted">Not logged in</p>
              <button type="button" className="rounded border border-theme px-2 py-1" onClick={onConnect} disabled={!ready}>
                {ready ? "Sign in with Google" : "Loading..."}
              </button>
              <p className="text-[11px] text-muted">{status}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
