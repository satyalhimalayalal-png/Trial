"use client";

export const GOOGLE_TOKEN_STORAGE_KEY = "cheqlist-google-access-token";
export const GOOGLE_TOKEN_EXP_STORAGE_KEY = "cheqlist-google-access-exp";
export const GOOGLE_EMAIL_STORAGE_KEY = "cheqlist-google-email";

export const GOOGLE_SESSION_TOKEN_STORAGE_KEY = "cheqlist-google-access-token-session";
export const GOOGLE_SESSION_TOKEN_EXP_STORAGE_KEY = "cheqlist-google-access-exp-session";
export const GOOGLE_SESSION_EMAIL_STORAGE_KEY = "cheqlist-google-email-session";

type TokenBundle = {
  token: string;
  expiresAt: number;
  email: string | null;
  persistent: boolean;
};

function safeNumber(value: string | null): number {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function readBundle(
  tokenKey: string,
  expKey: string,
  emailKey: string,
  persistent: boolean,
): TokenBundle | null {
  if (typeof window === "undefined") return null;
  const storage = persistent ? localStorage : sessionStorage;
  const token = storage.getItem(tokenKey);
  const expiresAt = safeNumber(storage.getItem(expKey));
  const email = storage.getItem(emailKey);

  if (!token) return null;
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    storage.removeItem(tokenKey);
    storage.removeItem(expKey);
    return null;
  }

  return { token, expiresAt, email, persistent };
}

export function readGoogleSession(): { token: string; email: string | null } | null {
  if (typeof window === "undefined") return null;
  const localBundle = readBundle(
    GOOGLE_TOKEN_STORAGE_KEY,
    GOOGLE_TOKEN_EXP_STORAGE_KEY,
    GOOGLE_EMAIL_STORAGE_KEY,
    true,
  );
  if (localBundle) return { token: localBundle.token, email: localBundle.email };

  const sessionBundle = readBundle(
    GOOGLE_SESSION_TOKEN_STORAGE_KEY,
    GOOGLE_SESSION_TOKEN_EXP_STORAGE_KEY,
    GOOGLE_SESSION_EMAIL_STORAGE_KEY,
    false,
  );
  if (sessionBundle) return { token: sessionBundle.token, email: sessionBundle.email };
  return null;
}

export function readGoogleEmailHint(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(GOOGLE_EMAIL_STORAGE_KEY) ??
    sessionStorage.getItem(GOOGLE_SESSION_EMAIL_STORAGE_KEY) ??
    null
  );
}

export function writeGoogleSession({
  token,
  expiresAt,
  email,
  keepSignedIn,
}: {
  token: string;
  expiresAt: number;
  email?: string | null;
  keepSignedIn: boolean;
}): void {
  if (typeof window === "undefined") return;

  // Always keep a session token for current-tab UX.
  sessionStorage.setItem(GOOGLE_SESSION_TOKEN_STORAGE_KEY, token);
  sessionStorage.setItem(GOOGLE_SESSION_TOKEN_EXP_STORAGE_KEY, String(expiresAt));
  if (email) sessionStorage.setItem(GOOGLE_SESSION_EMAIL_STORAGE_KEY, email);
  else sessionStorage.removeItem(GOOGLE_SESSION_EMAIL_STORAGE_KEY);

  if (keepSignedIn) {
    localStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(GOOGLE_TOKEN_EXP_STORAGE_KEY, String(expiresAt));
    if (email) localStorage.setItem(GOOGLE_EMAIL_STORAGE_KEY, email);
    else localStorage.removeItem(GOOGLE_EMAIL_STORAGE_KEY);
  } else {
    localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_EXP_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_EMAIL_STORAGE_KEY);
  }
}

export function clearGoogleSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
  localStorage.removeItem(GOOGLE_TOKEN_EXP_STORAGE_KEY);
  localStorage.removeItem(GOOGLE_EMAIL_STORAGE_KEY);
  sessionStorage.removeItem(GOOGLE_SESSION_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(GOOGLE_SESSION_TOKEN_EXP_STORAGE_KEY);
  sessionStorage.removeItem(GOOGLE_SESSION_EMAIL_STORAGE_KEY);
}
