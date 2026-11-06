import type { PortalClaim, PortalInvoice, PortalPhotoMeta, PortalRequest } from "@shared/portal";

export type PortalJob = {
  id: number;
  title: string;
  moveDate: string;
  startHour: number;
  origin: string;
  destination: string;
  status: string;
  invoiceStatus: string;
  total: number;
  finalTotal: number | null;
  requests: PortalRequest[];
  photos: PortalPhotoMeta[];
};

export type PortalPayload = {
  company: { name: string; phone: string; email: string };
  customer: { name: string; email: string; phone: string };
  jobs: PortalJob[];
  claims: PortalClaim[];
  invoices: PortalInvoice[];
  documents: Array<{ id: string; name: string; kind: "estimate" | "invoice"; url: string }>;
};

export class PortalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PortalApiError";
  }
}

const base = (token: string) => `/api/public/portal/${encodeURIComponent(token)}`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new PortalApiError(
      typeof body["error"] === "string" ? body["error"] : "The customer portal is unavailable",
      response.status,
    );
  return body as T;
}

export const portalApi = {
  read: (token: string) => call<PortalPayload>(base(token)),
  request: (
    token: string,
    value: {
      jobId: number;
      kind: "date_change" | "address";
      requestedDate?: string;
      origin?: string;
      destination?: string;
      notes?: string;
    },
  ) =>
    call<{ request: PortalRequest }>(`${base(token)}/requests`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  claim: (
    token: string,
    value: {
      jobId: number;
      type: "damage" | "missing" | "other";
      description: string;
      claimedCents?: number;
    },
  ) =>
    call<{ claim: PortalClaim }>(`${base(token)}/claims`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
  uploadPhotos: (
    token: string,
    value: { jobId: number; photos: Array<{ name?: string; dataUrl: string }> },
  ) =>
    call<{ photos: PortalPhotoMeta[]; rejected: number }>(`${base(token)}/photos`, {
      method: "POST",
      body: JSON.stringify(value),
    }),
};
