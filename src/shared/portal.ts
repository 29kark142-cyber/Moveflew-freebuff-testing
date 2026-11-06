// Customer self-service portal rules shared by the public API, the portal page and tests.
// Everything here treats the URL token as the only credential and never exposes internal
// notes, crew data or pricing inputs.

export type PortalRequestKind = "date_change" | "address";
export type PortalRequestStatus = "pending" | "approved" | "declined";

export type PortalRequest = {
  id: string;
  kind: PortalRequestKind;
  status: PortalRequestStatus;
  at: string;
  requestedDate?: string;
  origin?: string;
  destination?: string;
  notes?: string;
  notification?: { status: string; detail: string };
};

export type PortalPhoto = {
  id: string;
  name: string;
  at: string;
  dataUrl: string;
};

export type PortalPhotoMeta = Omit<PortalPhoto, "dataUrl">;

export type PortalClaim = {
  id: number;
  jobId: number;
  type: string;
  status: string;
  description: string;
  claimedCents: number;
  approvedCents: number;
  payoutCents: number;
  resolution: string;
  at: string;
};

export type PortalInvoice = {
  id: number;
  invoiceNumber: string;
  amountCents: number;
  balanceCents: number;
  status: string;
};

export const MAX_PORTAL_REQUESTS = 20;
export const MAX_PORTAL_PHOTOS = 12;
export const MAX_PORTAL_PHOTO_BYTES = 400_000;
const MAX_PHOTO_DATA_URL = 600_000;
const PORTAL_PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function portalRequests(value: unknown): PortalRequest[] {
  if (!Array.isArray(value)) return [];
  const out: PortalRequest[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const kind =
      row["kind"] === "date_change" ? "date_change" : row["kind"] === "address" ? "address" : null;
    if (!kind) continue;
    const at = text(row["at"]);
    if (!Number.isFinite(Date.parse(at))) continue;
    const status =
      row["status"] === "approved"
        ? "approved"
        : row["status"] === "declined"
          ? "declined"
          : "pending";
    out.push({
      id: text(row["id"]) || `request-${out.length + 1}`,
      kind,
      status,
      at,
      ...(text(row["requestedDate"]) ? { requestedDate: text(row["requestedDate"]) } : {}),
      ...(text(row["origin"]) ? { origin: text(row["origin"]).slice(0, 300) } : {}),
      ...(text(row["destination"]) ? { destination: text(row["destination"]).slice(0, 300) } : {}),
      ...(text(row["notes"]) ? { notes: text(row["notes"]).slice(0, 500) } : {}),
      ...(row["notification"] && typeof row["notification"] === "object"
        ? {
            notification: {
              status: text((row["notification"] as Record<string, unknown>)["status"]),
              detail: text((row["notification"] as Record<string, unknown>)["detail"]).slice(
                0,
                200,
              ),
            },
          }
        : {}),
    });
    if (out.length >= MAX_PORTAL_REQUESTS) break;
  }
  return out;
}

export function appendPortalRequest(value: unknown, request: PortalRequest): PortalRequest[] {
  const current = portalRequests(value);
  if (current.some((entry) => entry.id === request.id)) return current;
  return [request, ...current].slice(0, MAX_PORTAL_REQUESTS);
}

export function isValidPortalDate(value: unknown, now = new Date()): boolean {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return false;
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return parsed.getTime() >= today.getTime();
}

export function portalPhotos(value: unknown): PortalPhoto[] {
  if (!Array.isArray(value)) return [];
  const out: PortalPhoto[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const dataUrl = text(row["dataUrl"]);
    if (!isPortalPhotoDataUrl(dataUrl)) continue;
    out.push({
      id: text(row["id"]) || `photo-${out.length + 1}`,
      name: text(row["name"]).slice(0, 120) || "Inventory photo",
      at: Number.isFinite(Date.parse(text(row["at"])))
        ? text(row["at"])
        : new Date(0).toISOString(),
      dataUrl,
    });
    if (out.length >= MAX_PORTAL_PHOTOS) break;
  }
  return out;
}

export function photoMeta(photos: PortalPhoto[]): PortalPhotoMeta[] {
  return photos.map(({ dataUrl: _dataUrl, ...meta }) => meta);
}

export function isPortalPhotoDataUrl(value: string): boolean {
  if (value.length > MAX_PHOTO_DATA_URL || !PORTAL_PHOTO_RE.test(value)) return false;
  return photoBytes(value) <= MAX_PORTAL_PHOTO_BYTES;
}

export function photoBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return (
    Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
  );
}

export function appendPortalPhotos(
  value: unknown,
  photos: Array<{ name?: string; dataUrl: string }>,
  now = new Date(),
): PortalPhoto[] {
  const current = portalPhotos(value);
  const fresh: PortalPhoto[] = [];
  for (const photo of photos) {
    if (current.length + fresh.length >= MAX_PORTAL_PHOTOS) break;
    if (!isPortalPhotoDataUrl(photo.dataUrl)) continue;
    fresh.push({
      id: crypto.randomUUID(),
      name: text(photo.name).slice(0, 120) || "Inventory photo",
      at: now.toISOString(),
      dataUrl: photo.dataUrl,
    });
  }
  return [...fresh, ...current].slice(0, MAX_PORTAL_PHOTOS);
}

/** Amount the customer should see, in cents, and what is still owed. */
export function invoiceForJob(job: {
  id: number;
  total?: unknown;
  finalTotal?: unknown;
  invoiceStatus?: unknown;
}): PortalInvoice | null {
  const amount = Number(job.finalTotal ?? job.total ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountCents = Math.round(amount * 100);
  const status = text(job.invoiceStatus) || "draft";
  return {
    id: job.id,
    invoiceNumber: `INV-${String(job.id).padStart(5, "0")}`,
    amountCents,
    balanceCents: status === "paid" ? 0 : amountCents,
    status,
  };
}
