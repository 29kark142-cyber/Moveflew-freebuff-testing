import type {
  CrewMember,
  Customer,
  Damage,
  Job,
  Pricing,
  Reminder,
  Sequence,
  Truck,
  WorkspaceRole,
} from "@shared/crm";
import { reportStaleClient } from "@/lib/app-version";
import type { WorkspaceAppearance } from "@/lib/workspace-appearance";

const API_ROOT = "/api/crm";
const WORKSPACE_KEY = "nwcrewcrm.workspace-id";

export type Workspace = {
  id: number; name: string; role: WorkspaceRole;
  planId?: string; subscriptionStatus?: "beta" | "trialing" | "active" | "past_due" | "canceled";
  onboardingCompleted?: boolean; pricingDefaults?: boolean;
  appearance?: WorkspaceAppearance;
};
export type Bootstrap = {
  user: { id: number; name: string; email: string };
  workspaces: Workspace[];
  workspace: Workspace | null;
  pricing: Pricing;
};
export type DashboardData = {
  customers: Customer[];
  jobs: Job[];
  reminders: Reminder[];
  trucks: Truck[];
  crew: CrewMember[];
  payments: Array<Record<string, unknown>>;
};
export type Member = {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: WorkspaceRole;
};
export type Payment = Record<string, unknown> & {
  id?: number;
  status?: string;
  amount?: number;
  createdAt?: string;
  jobId?: number;
};

export class CrmApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CrmApiError";
    this.status = status;
  }
}

export function getWorkspaceId() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw && !/^[1-9]\d*$/.test(raw)) {
      // Corrupt or outdated value: drop it so the server picks a valid workspace.
      localStorage.removeItem(WORKSPACE_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function setWorkspaceId(id: number | string | null) {
  try {
    if (id === null) localStorage.removeItem(WORKSPACE_KEY);
    else localStorage.setItem(WORKSPACE_KEY, String(id));
  } catch {
    /* storage blocked */
  }
}

export async function sessionAuthorization(): Promise<Record<string, string>> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function crmFetch<T>(
  path: string,
  init: RequestInit = {},
  publicRequest = false
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (!publicRequest) {
    const selected = getWorkspaceId();
    if (selected) headers.set("x-workspace-id", selected);
  }
  for (const [key, value] of Object.entries(await sessionAuthorization()))
    headers.set(key, value);
  const response = await fetch(`${API_ROOT}${path}`, {
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
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  if (!response.ok && !isJson && (response.status === 404 || response.status === 405)) {
    // The endpoint this open tab expects no longer exists: it is running an old release.
    reportStaleClient(`endpoint ${path}`);
  }
  if (!response.ok && !publicRequest && response.status === 403 && getWorkspaceId()) {
    // Saved workspace is no longer accessible; forget it so the next load falls back.
    setWorkspaceId(null);
  }
  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status})`;
    throw new CrmApiError(message, response.status);
  }
  return body as T;
}

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});

export const crm = {
  bootstrap: () => crmFetch<Bootstrap>("/bootstrap"),
  createWorkspace: (name: string) =>
    crmFetch<Workspace>("/workspaces", json("POST", { name })),
  dashboard: () => crmFetch<DashboardData>("/dashboard"),
  customers: () => crmFetch<Customer[]>("/customers"),
  createCustomer: (value: Partial<Customer>) =>
    crmFetch<Customer>("/customers", json("POST", value)),
  updateCustomer: (id: number, value: Partial<Customer>) =>
    crmFetch<Customer>(`/customers/${id}`, json("PATCH", value)),
  reminders: () => crmFetch<Reminder[]>("/reminders"),
  createReminder: (value: {
    customerId?: number;
    title: string;
    dueAt: string;
  }) => crmFetch<Reminder>("/reminders", json("POST", value)),
  updateReminder: (id: number, value: { completed: boolean }) =>
    crmFetch<Reminder>(`/reminders/${id}`, json("PATCH", value)),
  jobs: () => crmFetch<Job[]>("/jobs"),
  job: (id: number) => crmFetch<Job>(`/jobs/${id}`),
  createJob: (value: Record<string, unknown>) =>
    crmFetch<Job>("/jobs", json("POST", value)),
  updateJob: (id: number, value: Partial<Job> & Record<string, unknown>) =>
    crmFetch<Job>(`/jobs/${id}`, json("PATCH", value)),
  assignJob: (
    id: number,
    value: {
      truckId: number | null;
      crewIds: number[];
      startHour: number;
      moveDate: string;
      duration: number;
    }
  ) => crmFetch<Job>(`/jobs/${id}/assign`, json("POST", value)),
  distance: (origin: string, destination: string) =>
    crmFetch<{
      distanceMiles: number;
      travelMinutes: number;
      travelFee: number;
    }>("/distance", json("POST", { origin, destination })),
  trucks: () => crmFetch<Truck[]>("/trucks"),
  createTruck: (value: Omit<Truck, "id">) =>
    crmFetch<Truck>("/trucks", json("POST", value)),
  updateTruck: (id: number, value: Partial<Truck>) =>
    crmFetch<Truck>(`/trucks/${id}`, json("PATCH", value)),
  crew: () => crmFetch<CrewMember[]>("/crew"),
  createCrew: (value: Omit<CrewMember, "id">) =>
    crmFetch<CrewMember>("/crew", json("POST", value)),
  updateCrew: (id: number, value: Partial<CrewMember>) =>
    crmFetch<CrewMember>(`/crew/${id}`, json("PATCH", value)),
  damage: (id: number) => crmFetch<Damage[]>(`/jobs/${id}/damage`),
  createDamage: (
    id: number,
    value: { phase: "pre" | "post"; note: string; photoData?: string }
  ) => crmFetch<Damage>(`/jobs/${id}/damage`, json("POST", value)),
  clock: (id: number, action: "in" | "out") =>
    crmFetch<Job>(`/jobs/${id}/clock`, json("POST", { action })),
  complete: (id: number, signature: string) =>
    crmFetch<Job>(`/jobs/${id}/complete`, json("POST", { signature })),
  pricing: () => crmFetch<Pricing>("/pricing"),
  updatePricing: (value: Pricing) =>
    crmFetch<Pricing>("/pricing", json("PUT", value)),
  members: () => crmFetch<Member[]>("/members"),
  createMember: (email: string, role: WorkspaceRole) =>
    crmFetch<Member>("/members", json("POST", { email, role })),
  updateMember: (id: number, role: WorkspaceRole) =>
    crmFetch<Member>(`/members/${id}`, json("PATCH", { role })),
  sequences: () => crmFetch<Sequence[]>("/sequences"),
  createSequence: (value: Omit<Sequence, "id" | "deliveryStatus">) =>
    crmFetch<Sequence>("/sequences", json("POST", value)),
  updateSequence: (id: number, value: Partial<Sequence>) =>
    crmFetch<Sequence>(`/sequences/${id}`, json("PATCH", value)),
  outbox: () => crmFetch<Array<Record<string, unknown>>>("/outbox"),
  payments: () => crmFetch<Payment[]>("/payments"),
  checkout: (id: number, origin: string) =>
    crmFetch<{ url: string }>(`/jobs/${id}/checkout`, json("POST", { origin })),
  proposal: (token: string) =>
    crmFetch<{
      job: Job;
      company: { name: string; phone: string; email: string };
      pricing: Pricing;
      tariff?: {
        profileVersion: string;
        totalCents: number;
        lines: Array<{ key: string; description: string; amountCents: number }>;
      } | null;
    }>(`/proposals/${token}`, {}, true),
  signProposal: (token: string, signature: string) =>
    crmFetch<Job>(
      `/proposals/${token}/sign`,
      json("POST", { signature, acceptedTerms: true }),
      true
    ),
};
