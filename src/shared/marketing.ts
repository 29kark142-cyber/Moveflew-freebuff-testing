/** Re-engagement eligibility, deduplication and campaign conversion metrics. */

export type MarketingJob = {
  id: number;
  customerId?: number | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  proposalToken?: string;
  status?: string;
  moveDate?: string;
  createdAt?: string;
  quoteExpiresAt?: string;
  quoteSentAt?: string;
  quoteAcceptedAt?: string;
  quoteToken?: string;
  quoteAcceptance?: unknown;
  convertedAt?: string;
};

export type MarketingCustomer = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
};

export type MarketingTriggerKind =
  | "expired_quote"
  | "unconfirmed_estimate"
  | "move_anniversary";

export type MarketingTrigger = {
  key: string;
  kind: MarketingTriggerKind;
  customerId: number;
  customerName: string;
  jobId: number;
  channel: "email" | "sms" | "none";
  destination: string;
  email: string;
  phone: string;
  reason: string;
};

const DAY = 86_400_000;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const date = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const dayKey = (value: Date) => value.toISOString().slice(0, 10);

function channel(customer: MarketingCustomer | undefined, job: MarketingJob) {
  if (text(customer?.email) || text(job.customerEmail)) return "email" as const;
  if (text(customer?.phone) || text(job.customerPhone)) return "sms" as const;
  return "none" as const;
}

function destination(job: MarketingJob, origin: string) {
  const base = origin.replace(/\/+$/, "");
  const token = text(job.proposalToken) || text(job.quoteToken);
  return token ? `${base}/quote/${token}` : `${base}/`;
}

/**
 * Three independent rules keep their own dedupe key so a quote can be followed
 * up once and an anniversary can be sent in a later year.
 */
export function marketingTriggers({
  jobs,
  customers,
  sentKeys = [],
  origin,
  now = new Date(),
}: {
  jobs: MarketingJob[];
  customers: MarketingCustomer[];
  sentKeys?: string[];
  origin: string;
  now?: Date;
}): MarketingTrigger[] {
  const sent = new Set(sentKeys);
  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  const found: MarketingTrigger[] = [];
  const push = (trigger: MarketingTrigger) => {
    if (!sent.has(trigger.key) && !found.some(item => item.key === trigger.key)) found.push(trigger);
  };

  for (const job of jobs) {
    const customer = customerById.get(Number(job.customerId));
    const customerId = Number(job.customerId) || Number(customer?.id) || 0;
    if (!customerId) continue;
    const name = text(customer?.name) || text(job.customerName) || "Customer";
    const common = {
      customerId,
      customerName: name,
      jobId: job.id,
      channel: channel(customer, job),
      destination: destination(job, origin),
      email: text(customer?.email) || text(job.customerEmail),
      phone: text(customer?.phone) || text(job.customerPhone),
    };
    const sentAt = date(job.quoteSentAt);
    const accepted = Boolean(text(job.quoteAcceptedAt)) || job.quoteAcceptance != null;
    const expiresAt =
      date(job.quoteExpiresAt) ?? (sentAt !== null ? sentAt + 14 * DAY : null);
    const createdAt = date(job.createdAt);
    const quoted = sentAt !== null || ["quote", "quoted"].includes(text(job.status));
    if (
      ["quote", "quoted", "estimate"].includes(text(job.status)) &&
      quoted &&
      !accepted &&
      expiresAt !== null &&
      expiresAt < now.getTime()
    ) {
      push({
        ...common,
        key: `expired_quote:${job.id}:${dayKey(new Date(expiresAt))}`,
        kind: "expired_quote",
        reason: "Quote expired without a booking",
      });
    }
    if (
      text(job.status) === "estimate" &&
      !quoted &&
      !accepted &&
      createdAt !== null &&
      now.getTime() - createdAt >= 3 * DAY
    ) {
      push({
        ...common,
        key: `unconfirmed_estimate:${job.id}`,
        kind: "unconfirmed_estimate",
        reason: "Estimate has not been confirmed",
      });
    }
    const movedAt = date(job.moveDate);
    if (text(job.status) === "completed" && movedAt !== null) {
      const moved = new Date(movedAt);
      const anniversary = new Date(now);
      anniversary.setUTCHours(0, 0, 0, 0);
      const anniversaryThisYear = Date.UTC(
        anniversary.getUTCFullYear(),
        moved.getUTCMonth(),
        moved.getUTCDate(),
      );
      if (
        moved.getUTCFullYear() < anniversary.getUTCFullYear() &&
        Math.abs(anniversaryThisYear - anniversary.getTime()) <= 7 * DAY
      ) {
        push({
          ...common,
          key: `move_anniversary:${job.id}:${anniversary.getUTCFullYear()}`,
          kind: "move_anniversary",
          reason: "Move anniversary check-in",
        });
      }
    }
  }
  return found;
}

export type MarketingTouch = {
  sent?: boolean;
  openedAt?: string | null;
  clickedAt?: string | null;
  convertedAt?: string | null;
};

export type MarketingRates = {
  sent: number;
  opened: number;
  clicked: number;
  converted: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
};

/** Rates are percentages rounded to one decimal and never exceed 100%. */
export function marketingRates(touches: MarketingTouch[]): MarketingRates {
  const sent = touches.filter(touch => touch.sent !== false).length;
  const opened = touches.filter(touch => Boolean(touch.openedAt)).length;
  const clicked = touches.filter(touch => Boolean(touch.clickedAt)).length;
  const converted = touches.filter(touch => Boolean(touch.convertedAt)).length;
  const rate = (value: number) => (sent ? Math.round((value / sent) * 1000) / 10 : 0);
  return {
    sent,
    opened,
    clicked,
    converted,
    openRate: rate(opened),
    clickRate: rate(clicked),
    conversionRate: rate(converted),
  };
}
