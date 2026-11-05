import type {
  AccessKey,
  Campaign,
  Communication,
  ReviewRequest,
  Webhook,
} from "@shared/expansion";
import { crmFetch } from "@/lib/crm";

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});
const rows = <T,>(value: T[] | { rows: T[] }) =>
  Array.isArray(value) ? value : value.rows;

export type CustomerPreferences = {
  emailConsent: boolean;
  smsConsent: boolean;
  optedOut: boolean;
  tags: string[];
  assignedUserId?: number | null;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    keyword?: string;
    adGroup?: string;
    customTracking?: string;
  };
};

export type EngageReport = {
  kpis: {
    leads: number;
    booked: number;
    completed: number;
    estimatedRevenueCents: number;
    collectedRevenueCents: number;
    expenseCents: number;
    netContributionCents: number;
  };
  funnel: Array<{ stage: string; count: number }>;
  sources: Array<{
    source: string;
    leads: number;
    booked: number;
    collectedCents: number;
    spendCents: number;
    costPerLeadCents: number | null;
    roas: number | null;
  }>;
  months: Array<{ month: string; bookedCents: number; collectedCents: number }>;
  records?: Array<Record<string, unknown>>;
  attributionBasis?: string;
  basis?: { attribution?: string };
};

export type IntegrationProvider = {
  name: string;
  category: string;
  status: string;
  detail: string;
  documentationUrl?: string;
};
export type Integrations = {
  providers: IntegrationProvider[];
  paymentMode: "test" | "live";
  emailConnected: boolean;
  smsConnected: boolean;
};

export type CatalogItem = {
  id: number;
  itemKey: string;
  name: string;
  room: string;
  cuft: number;
  weight: number;
  active: boolean;
};

export type WebhookDelivery = {
  id: number;
  webhookId?: number;
  status: string;
  event?: string;
  attemptedAt?: string;
  createdAt?: string;
  httpStatus?: number | null;
  responseCode?: number;
  error?: string;
};

export type ApiDocs = Record<string, unknown>;

export type QuoteSettings = {
  company?: { name?: string; phone?: string; email?: string };
  display?: Record<string, unknown>;
};
export type QuoteSubmission = {
  name: string;
  email: string;
  phone: string;
  origin: string;
  destination: string;
  moveDate: string;
  moveSize: string;
  notes: string;
  consent: boolean;
  utm?: Record<string, string>;
  website?: string;
};
export type PortalData = {
  company?: { name?: string; phone?: string; email?: string };
  customer?: { name?: string; email?: string; phone?: string };
  jobs: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  storageAccounts: Array<Record<string, any>>;
  storageItems: Array<Record<string, any>>;
  communications?: Array<Record<string, any>>;
  documents?: Array<Record<string, any>>;
};
export type PublicReview = {
  company?: { name?: string };
  status?: string;
  rating?: number | null;
  feedback?: string;
  publicReviewUrl?: string;
};

export const engage = {
  communications: () => crmFetch<Communication[]>("/engage/communications"),
  createCommunication: (value: {
    customerId: number;
    jobId?: number;
    channel: "note" | "call" | "email" | "sms";
    direction: "inbound" | "outbound";
    body: string;
  }) => crmFetch<Communication>("/engage/communications", json("POST", value)),

  preferences: (customerId: number) =>
    crmFetch<CustomerPreferences>(`/engage/customer-preferences/${customerId}`),
  updatePreferences: (customerId: number, value: CustomerPreferences) =>
    crmFetch<CustomerPreferences>(
      `/engage/customer-preferences/${customerId}`,
      json("PUT", value)
    ),

  campaigns: () => crmFetch<Campaign[]>("/engage/campaigns"),
  createCampaign: (value: Omit<Campaign, "id">) =>
    crmFetch<Campaign>("/engage/campaigns", json("POST", value)),
  updateCampaign: (id: number, value: Partial<Omit<Campaign, "id">>) =>
    crmFetch<Campaign>(`/engage/campaigns/${id}`, json("PATCH", value)),
  runFollowups: () =>
    crmFetch<Record<string, unknown>>("/engage/followups/run", json("POST")),

  reviews: () => crmFetch<ReviewRequest[]>("/engage/reviews"),
  createReview: (value: { customerId: number; jobId?: number }) =>
    crmFetch<ReviewRequest & { token?: string; publicReviewUrl?: string }>(
      "/engage/reviews",
      json("POST", value)
    ),

  reports: (from: string, to: string) =>
    crmFetch<EngageReport>(
      `/engage/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    ),
  integrations: () => crmFetch<Integrations>("/engage/integrations"),

  keys: async () =>
    rows(
      await crmFetch<AccessKey[] | { rows: AccessKey[] }>("/engage/keys")
    ),
  createKey: (value: {
    name: string;
    kind: "api" | "widget" | "portal";
    scopes: string[];
    customerId?: number;
    expiresAt?: string;
  }) =>
    crmFetch<{ key: AccessKey; token: string }>(
      "/engage/keys",
      json("POST", value)
    ),
  revokeKey: (id: number) =>
    crmFetch<AccessKey>(`/engage/keys/${id}`, json("PATCH", { revoked: true })),

  webhooks: () => crmFetch<Webhook[]>("/engage/webhooks"),
  createWebhook: (value: { url: string; events: string[]; enabled: boolean }) =>
    crmFetch<{ webhook: Webhook; secret: string }>(
      "/engage/webhooks",
      json("POST", value)
    ),
  updateWebhook: (
    id: number,
    value: Partial<Pick<Webhook, "url" | "events" | "enabled">>
  ) => crmFetch<Webhook>(`/engage/webhooks/${id}`, json("PATCH", value)),
  testWebhook: (id: number) =>
    crmFetch<Record<string, unknown>>(
      `/engage/webhooks/${id}/test`,
      json("POST")
    ),
  webhookDeliveries: async () =>
    rows(
      await crmFetch<WebhookDelivery[] | { rows: WebhookDelivery[] }>(
        "/engage/webhook-deliveries"
      )
    ),

  catalog: () => crmFetch<CatalogItem[]>("/engage/inventory-catalog"),
  createCatalogItem: (value: Omit<CatalogItem, "id">) =>
    crmFetch<CatalogItem>("/engage/inventory-catalog", json("POST", value)),
  updateCatalogItem: (id: number, value: Partial<Omit<CatalogItem, "id">>) =>
    crmFetch<CatalogItem>(
      `/engage/inventory-catalog/${id}`,
      json("PATCH", value)
    ),

  apiDocs: () => crmFetch<ApiDocs>("/engage/api-docs", {}, true),

  quoteSettings: (token: string) =>
    crmFetch<QuoteSettings>(
      `/engage/public/quote/${encodeURIComponent(token)}`,
      {},
      true
    ),
  submitQuote: (token: string, value: QuoteSubmission) =>
    crmFetch<{ received: true; reference?: string }>(
      `/engage/public/quote/${encodeURIComponent(token)}`,
      json("POST", value),
      true
    ),
  portal: (token: string) =>
    crmFetch<PortalData>(
      `/engage/public/portal/${encodeURIComponent(token)}`,
      {},
      true
    ),
  submitPortalInventory: (
    token: string,
    value: {
      jobId: number;
      items: Array<{ key?: string; name: string; quantity: number }>;
    }
  ) =>
    crmFetch<Record<string, unknown>>(
      `/engage/public/portal/${encodeURIComponent(token)}/inventory`,
      json("POST", value),
      true
    ),
  portalCheckout: (
    token: string,
    invoiceId: number,
    value: { origin: string; amountCents?: number }
  ) =>
    crmFetch<{ url: string }>(
      `/engage/public/portal/${encodeURIComponent(token)}/invoices/${invoiceId}/checkout`,
      json("POST", value),
      true
    ),
  publicReview: (token: string) =>
    crmFetch<PublicReview>(
      `/engage/public/review/${encodeURIComponent(token)}`,
      {},
      true
    ),
  submitPublicReview: (
    token: string,
    value: { rating: number; feedback: string }
  ) =>
    crmFetch<PublicReview>(
      `/engage/public/review/${encodeURIComponent(token)}`,
      json("POST", value),
      true
    ),
};
