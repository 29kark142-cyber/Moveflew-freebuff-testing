// Client read for the public tracking portal. Deliberately unauthenticated: the
// opaque token in the URL is the credential, so no Authorization header is sent.
import type { PublicTrackingPayload } from "@shared/tracking";

export type TrackingLookup = { found: true; payload: PublicTrackingPayload } | { found: false };

export async function readTracking(token: string): Promise<TrackingLookup> {
  const response = await fetch(`/api/public/v1/track/${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) return { found: false };
  if (!response.ok) throw new Error("Could not load this move right now.");
  return { found: true, payload: (await response.json()) as PublicTrackingPayload };
}
