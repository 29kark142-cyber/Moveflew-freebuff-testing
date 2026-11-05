// One-click quote dispatch shared by the office modal, the public quote page and the
// server, so the preview a dispatcher approves is the text that is actually sent.

/** Public quote links carry an opaque token, never a guessable job id. */
export const QUOTE_TOKEN_RE = /^qte_[a-f0-9]{32}$/;

export function newQuoteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `qte_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Status written on the job once a provider accepts at least one message. */
export const QUOTE_SENT_STATUS = "quote_sent";
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  quote_sent: "Quote Sent",
};

export const QUOTE_CHANNELS = ["email", "sms"] as const;
export type QuoteChannel = (typeof QUOTE_CHANNELS)[number];

export const isQuoteChannel = (value: unknown): value is QuoteChannel =>
  typeof value === "string" && (QUOTE_CHANNELS as readonly string[]).includes(value);

export type QuoteMessageContext = {
  customerName: string;
  companyName: string;
  reference: string;
  moveDate: string;
  total: string;
  link: string;
};

export const QUOTE_TEMPLATES = {
  email: {
    subject: "Your moving quote {reference} from {companyName}",
    body: [
      "Hi {customerName},",
      "",
      "Thank you for choosing {companyName}. Your moving quote is ready:",
      "",
      "Reference: {reference}",
      "Move date: {moveDate}",
      "Estimated total: {total}",
      "",
      "Review your quote online: {link}",
      "",
      "Questions? Reply to this email or call us and we will walk you through it.",
      "",
      "— {companyName}",
    ].join("\n"),
  },
  sms: {
    body: "Hi {customerName}, your {companyName} quote {reference} for {moveDate} is ready: {total}. View it here: {link} — reply STOP to opt out.",
  },
} as const;

/** Renders only documented tokens; anything unknown becomes an empty string. */
export function renderQuoteTemplate(template: string, context: QuoteMessageContext): string {
  return template.replace(/\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}/g, (_match, key: string) => {
    const value = (context as unknown as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  });
}

export function quoteLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/quote/${token}`;
}

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status] ?? status;
}

export const QUOTE_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
export const QUOTE_PHONE_RE = /^\+?[0-9][0-9 ().-]{5,19}$/;

export type QuoteDeliveryStatus = "accepted" | "failed" | "logged";

export type QuoteDelivery = {
  channel: QuoteChannel;
  /** Recipient the message was addressed to, kept for the job timeline. */
  target: string;
  status: QuoteDeliveryStatus;
  at: string;
  detail: string;
  providerId?: string;
};

export const QUOTE_MAX_DELIVERIES = 10;

/** Saved delivery history is untrusted: keep only well-formed entries, newest last. */
export function quoteDeliveries(value: unknown): QuoteDelivery[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .filter(
      (entry) =>
        isQuoteChannel(entry.channel) &&
        typeof entry.target === "string" &&
        typeof entry.at === "string" &&
        typeof entry.detail === "string" &&
        (entry.status === "accepted" || entry.status === "failed" || entry.status === "logged"),
    )
    .map((entry) => ({
      channel: entry.channel as QuoteChannel,
      target: String(entry.target),
      status: entry.status as QuoteDeliveryStatus,
      at: String(entry.at),
      detail: String(entry.detail),
      ...(typeof entry.providerId === "string" ? { providerId: entry.providerId } : {}),
    }))
    .slice(-QUOTE_MAX_DELIVERIES);
}

export function appendQuoteDeliveries(
  existing: unknown,
  next: readonly QuoteDelivery[],
): QuoteDelivery[] {
  return [...quoteDeliveries(existing), ...next].slice(-QUOTE_MAX_DELIVERIES);
}

/** Timeline detail naming each channel, its recipient and the provider outcome. */
export function quoteDispatchDetail(deliveries: readonly QuoteDelivery[]): string {
  return deliveries
    .map(
      (delivery) =>
        `${delivery.channel === "email" ? "Email" : "SMS"} to ${delivery.target} (${delivery.status})`,
    )
    .join(" · ")
    .slice(0, 500);
}

/** Nothing is labelled "sent" unless a provider accepted at least one message. */
export function quoteActivityTitle(deliveries: readonly QuoteDelivery[]): string {
  return deliveries.some((delivery) => delivery.status === "accepted")
    ? "Quote Sent via Email/SMS"
    : "Quote Dispatch Logged";
}
