// Signed download links for private job documents and workspace wallpapers.
// Field workers open these on slow mobile connections, so the lifetime has to
// survive a slow PDF render/download, and anything that re-signs a link must do
// so well before the previous one stops working.
export const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes
export const SIGNED_URL_TTL_MS = SIGNED_URL_TTL_SECONDS * 1000;
// Re-sign the signed Bill of Lading link while the job sheet stays open.
export const PDF_LINK_REFRESH_MS = 60 * 1000;
// Re-sign a stored workspace wallpaper before its link can lapse.
export const WALLPAPER_REFRESH_MS = 4 * 60 * 1000;

// A link is only safe to hand to a worker while it still has this much life left.
export function signedUrlExpiresAt(issuedAtMs: number): number {
  return issuedAtMs + SIGNED_URL_TTL_MS;
}

export function signedUrlIsUsable(issuedAtMs: number, nowMs: number): boolean {
  return nowMs < signedUrlExpiresAt(issuedAtMs);
}
