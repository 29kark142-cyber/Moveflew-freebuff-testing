export const INVITE_INTENT_STORAGE_KEY = "nw-crew-invite-intent";
/** Invitation secrets are 32 random bytes encoded as unpadded base64url. */
export const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Save only a valid token, and only for this browser tab. */
export function saveInviteIntent(token: string | null | undefined): boolean {
  if (!isInviteToken(token)) return false;
  try {
    storage()?.setItem(INVITE_INTENT_STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Read a valid tab-scoped invite token, removing stale or malformed values. */
export function readInviteIntent(): string | null {
  try {
    const token = storage()?.getItem(INVITE_INTENT_STORAGE_KEY) ?? null;
    if (isInviteToken(token)) return token;
    if (token) storage()?.removeItem(INVITE_INTENT_STORAGE_KEY);
  } catch {
    // Storage is optional; callers can still use an invite token in the URL.
  }
  return null;
}

export function clearBrowserInvite() {
  try {
    storage()?.removeItem(INVITE_INTENT_STORAGE_KEY);
  } catch {
    // Storage is optional.
  }
}

/** Pure URL helper, intentionally independent from the browser location. */
export function inviteTokenFromSearch(search: string): string | null {
  const value =
    new URLSearchParams(search).get("token") ??
    new URLSearchParams(search).get("inviteToken");
  return isInviteToken(value) ? value : null;
}

export function activeInviteToken(search?: string): string | null {
  const fromUrl =
    search === undefined && typeof window !== "undefined"
      ? inviteTokenFromSearch(window.location.search)
      : inviteTokenFromSearch(search ?? "");
  if (fromUrl) {
    saveInviteIntent(fromUrl);
    return fromUrl;
  }
  return readInviteIntent();
}
