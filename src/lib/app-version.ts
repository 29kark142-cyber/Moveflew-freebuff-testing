// Release housekeeping: a one-time cleanup of saved app settings per release,
// and a "stale tab" signal raised when an old open tab hits removed files/endpoints.

declare const __APP_BUILD_ID__: string;

export const BUILD_ID: string =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";

export const VERSION_KEY = "nwcrewcrm.app-version";
/** Settings the app owns and may safely reset on a new release. */
export const APP_SETTINGS_PREFIX = "nwcrewcrm.";

/** Sign-in, theme and language preferences are never removed. */
export function isProtectedKey(key: string) {
  return (
    key === VERSION_KEY ||
    key.startsWith("sb-") ||
    key.includes("auth-token") ||
    key === "theme" ||
    key === "northwest-crew-language"
  );
}

export function clearAppSettings(storage: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(APP_SETTINGS_PREFIX) && !isProtectedKey(key)) keys.push(key);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys;
}

/** Returns true when a cleanup ran (first visit after a new release). No reload. */
export function runReleaseCleanup(storage: Storage, buildId = BUILD_ID) {
  if (storage.getItem(VERSION_KEY) === buildId) return false;
  clearAppSettings(storage);
  storage.setItem(VERSION_KEY, buildId);
  return true;
}

const STALE_EVENT = "nwcrewcrm:stale-client";

export function reportStaleClient(reason: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STALE_EVENT, { detail: reason }));
}

export function onStaleClient(cb: (reason: string) => void) {
  const handler = (e: Event) => cb(String((e as CustomEvent).detail ?? ""));
  window.addEventListener(STALE_EVENT, handler);
  return () => window.removeEventListener(STALE_EVENT, handler);
}

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i;

export function isChunkLoadError(error: unknown) {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return CHUNK_ERROR.test(message);
}
