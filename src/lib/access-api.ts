import { COOKIE_NAME } from "@shared/const";
import type {
  AccessResult,
  AuthCapabilities,
  EnrollmentResult,
  InvitationCreation,
  InvitationPreview,
  WorkerInvitation,
} from "@shared/access";
import type { WorkspaceRole } from "@shared/crm";
import { crmFetch } from "./crm";
import { isInviteToken } from "./invite-intent";

export class AccessApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AccessApiError";
  }
}

/** Mirrors the existing CRM request convention for Preview session fallback. */
function platformSessionHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    const prefix = `${COOKIE_NAME}=`;
    const pair = raw?.split(";").find(value => value.trim().startsWith(prefix));
    const token = pair?.trim().slice(prefix.length);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function errorMessage(body: unknown, status: number) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.message === "string") return record.message;
  }
  return `Request failed (${status})`;
}

/** Minimal JSON fetcher for access endpoints outside /api/crm. */
export async function accessFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (
    (init.body || (init.method && init.method !== "GET")) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(platformSessionHeaders()))
    headers.set(key, value);

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok)
    throw new AccessApiError(
      errorMessage(body, response.status),
      response.status
    );
  if (
    body &&
    typeof body === "object" &&
    "user" in body &&
    "enrollment" in body
  ) {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {
      /* optional browser hint */
    }
  }
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function googleStartUrl(inviteToken?: string | null) {
  const query = new URLSearchParams();
  if (isInviteToken(inviteToken)) query.set("inviteToken", inviteToken);
  const suffix = query.toString();
  return `/api/auth/google/start${suffix ? `?${suffix}` : ""}`;
}

export type InvitationInput = {
  kind: "link" | "email";
  email?: string;
  role?: WorkspaceRole;
  hourlyRateCents: number;
  workerId?: number;
  publicOrigin?: string;
};

export const accessApi = {
  capabilities: () => accessFetch<AuthCapabilities>("/api/auth/capabilities"),
  register: (input: {
    name: string;
    email: string;
    password: string;
    inviteToken?: string;
  }) => accessFetch<AccessResult>("/api/auth/register", json("POST", input)),
  login: (input: { email: string; password: string; inviteToken?: string }) =>
    accessFetch<AccessResult>("/api/auth/login", json("POST", input)),
  magicLink: (input: { email: string; inviteToken?: string }) =>
    accessFetch<{ message: string }>(
      "/api/auth/magic-link",
      json("POST", input)
    ),
  verifyEmail: (token: string) =>
    accessFetch<AccessResult>(
      "/api/auth/verify-email",
      json("POST", { token })
    ),
  requestEmailVerification: (email?: string) =>
    accessFetch<{ message?: string }>(
      "/api/auth/request-email-verification",
      json("POST", email ? { email } : {})
    ),
  phoneStart: (input: { phone: string; inviteToken?: string }) =>
    accessFetch<{ message: string }>(
      "/api/auth/phone/start",
      json("POST", input)
    ),
  phoneVerify: (input: {
    phone: string;
    code: string;
    name?: string;
    inviteToken?: string;
  }) =>
    accessFetch<AccessResult>("/api/auth/phone/verify", json("POST", input)),
  logout: () => accessFetch<void>("/api/auth/logout", json("POST")),
};

/** Staff invitations are workspace-scoped and therefore deliberately use crmFetch. */
export const invitationsApi = {
  list: () => crmFetch<WorkerInvitation[]>("/invitations"),
  create: (input: InvitationInput) =>
    crmFetch<InvitationCreation>("/invitations", json("POST", input)),
  resend: (id: number, publicOrigin?: string) =>
    crmFetch<InvitationCreation>(
      `/invitations/${id}/resend`,
      json("POST", publicOrigin ? { publicOrigin } : {})
    ),
  revoke: (id: number) =>
    crmFetch<{ revoked: boolean; status: WorkerInvitation["status"] }>(`/invitations/${id}/revoke`, json("POST")),
  preview: (token: string) =>
    accessFetch<InvitationPreview>(
      `/api/invitations/preview?${new URLSearchParams({ token })}`
    ),
  persistIntent: (token: string) =>
    accessFetch<{ ok: true }>(
      "/api/invitations/intent",
      json("POST", { token })
    ),
  accept: (token?: string | null) =>
    accessFetch<EnrollmentResult>(
      "/api/invitations/accept",
      json("POST", isInviteToken(token) ? { token } : {})
    ),
};
