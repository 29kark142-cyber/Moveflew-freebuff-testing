export const BUSINESS_MESSAGE_EVENTS = [
  "estimate.sent",
  "job.booked",
  "invoice.created",
  "invoice.paid",
  "job.dispatch",
  "crew.arrival",
  "review.requested",
] as const;

export type BusinessMessageEvent = (typeof BUSINESS_MESSAGE_EVENTS)[number];
export const MESSAGE_CHANNELS = ["email", "sms"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];
export const EMAIL_PROVIDERS = ["sendgrid", "ses"] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
export const SMS_PROVIDERS = ["twilio"] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

export const MESSAGE_STATUSES = [
  "queued",
  "submitting",
  "accepted",
  "delivered",
  "undelivered",
  "failed",
  "ambiguous",
  "blocked_automation_off",
  "blocked_no_consent",
  "blocked_not_configured",
  "suppressed_opt_out",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type MessagingTemplate = {
  id: number;
  eventType: BusinessMessageEvent;
  channel: MessageChannel;
  subject: string;
  body: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MessagingRecipient = {
  id: number;
  customerId: number;
  channel: MessageChannel;
  address: string;
  transactionalConsent: boolean;
  reviewConsent: boolean;
  optedOutAt: string | null;
  consentRecordedAt: string | null;
  consentSource: string;
  updatedAt: string;
};

export type MessagingOutboxItem = {
  id: number;
  customerId: number;
  jobId: number | null;
  eventType: BusinessMessageEvent;
  resourceId: string;
  channel: MessageChannel;
  recipient: string;
  subject: string;
  status: MessageStatus;
  provider: string | null;
  providerMessageId: string | null;
  attempts: number;
  lastError: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
};

export type MessagingSettings = {
  emailAutomationEnabled: boolean;
  smsAutomationEnabled: boolean;
  emailProvider: EmailProvider;
  smsProvider: SmsProvider;
};

/** Only documented tokens are rendered; unknown/missing values are left blank. */
export type MessageTemplateContext = {
  companyName: string;
  customerName: string;
  jobTitle: string;
  moveDate: string;
  invoiceNumber: string;
  invoiceAmount: string;
  proposalUrl: string;
  portalUrl: string;
  reviewUrl: string;
};

const TOKEN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
const escapedHtml = /[&<>"']/g;
const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function isBusinessMessageEvent(
  value: unknown
): value is BusinessMessageEvent {
  return (
    typeof value === "string" &&
    BUSINESS_MESSAGE_EVENTS.includes(value as BusinessMessageEvent)
  );
}

export function isMessageChannel(value: unknown): value is MessageChannel {
  return (
    typeof value === "string" &&
    MESSAGE_CHANNELS.includes(value as MessageChannel)
  );
}

export function isEmailProvider(value: unknown): value is EmailProvider {
  return (
    typeof value === "string" &&
    EMAIL_PROVIDERS.includes(value as EmailProvider)
  );
}

export function isSmsProvider(value: unknown): value is SmsProvider {
  return (
    typeof value === "string" && SMS_PROVIDERS.includes(value as SmsProvider)
  );
}

export function renderTransactionalTemplate(
  template: string,
  context: MessageTemplateContext
): string {
  return template.replace(
    TOKEN,
    (_match, key: keyof MessageTemplateContext) => {
      const value = context[key];
      return typeof value === "string" ? value : "";
    }
  );
}

/** Custom templates are plain text. This produces safe HTML for providers that accept it. */
export function transactionalHtml(text: string): string {
  return text
    .replace(escapedHtml, character => htmlEntities[character]!)
    .replace(/\r?\n/g, "<br>");
}

export function normalizeMessagingEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

/** E.164-ish canonical form for matching a verified Twilio callback to local consent. */
export function normalizeMessagingPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits.length === 10 ? "1" : ""}${digits}` : "";
}

export function validMessageAddress(
  channel: MessageChannel,
  value: string
): boolean {
  if (channel === "email")
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(
      normalizeMessagingEmail(value)
    );
  return /^\+\d{7,15}$/.test(normalizeMessagingPhone(value));
}

export function messageStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    submitting: "Submitting",
    accepted: "Accepted by provider",
    delivered: "Delivered",
    undelivered: "Undelivered",
    failed: "Failed",
    ambiguous: "Unknown result — do not retry automatically",
    blocked_automation_off: "Blocked — automation off",
    blocked_no_consent: "Blocked — no consent",
    blocked_not_configured: "Blocked — provider not connected",
    suppressed_opt_out: "Suppressed — recipient opted out",
  };
  return labels[status] ?? status;
}

export function eventLabel(eventType: BusinessMessageEvent): string {
  const labels: Record<BusinessMessageEvent, string> = {
    "estimate.sent": "Estimate sent",
    "job.booked": "Job booked",
    "invoice.created": "Invoice created",
    "invoice.paid": "Invoice paid",
    "job.dispatch": "Dispatch notice",
    "crew.arrival": "Crew arrival",
    "review.requested": "Review requested",
  };
  return labels[eventType];
}
