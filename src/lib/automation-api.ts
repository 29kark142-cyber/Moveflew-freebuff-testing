import { crmFetch } from "@/lib/crm";

const json = (method: string, value?: unknown): RequestInit => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});

export type AutomationConfiguration = {
  registered: true;
  status: "active" | "paused";
  cronExpression: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastError: string | null;
};

export type AutomationStatus = {
  state: "not_activated" | "active" | "paused";
  configuration: AutomationConfiguration | null;
  activation: {
    ready: boolean;
    reason: string | null;
    canonicalPublishedOrigin: string | null;
  };
  runner: {
    cronExpression: string;
    callbackPath: string;
    currentPeriod: string;
    invoices: "invoice_generation_only";
    leadFollowups: "crm_reminders_only";
    emailSms: "blocked_no_provider";
    webhooks: "bounded_owner_configured_targets";
  };
};

/** Management calls remain workspace-scoped through crmFetch's authenticated header. */
export const automation = {
  status: () => crmFetch<AutomationStatus>("/automation/status"),
  activate: (publishedOrigin: string) =>
    crmFetch<AutomationStatus>(
      "/automation/activate",
      json("POST", { publishedOrigin })
    ),
  pause: () => crmFetch<AutomationStatus>("/automation/pause", json("PATCH")),
  resume: () => crmFetch<AutomationStatus>("/automation/resume", json("PATCH")),
};
