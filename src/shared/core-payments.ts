export const PAYMENT_METHOD_TYPES = ["card", "us_bank_account"] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PREAUTHORIZATION_STATUSES = [
  "draft",
  "awaiting_customer_consent",
  "ready_for_hold",
  "held",
  "capture_due",
  "captured",
  "released",
  "expired",
  "blocked_not_connected",
  "requires_customer_action",
] as const;
export type PreauthorizationStatus = (typeof PREAUTHORIZATION_STATUSES)[number];

export type PaymentProviderState =
  | "inactive"
  | "test_ready"
  | "live_locked"
  | "live_ready";

export type CorePaymentSettings = {
  provider: "stripe";
  providerState: PaymentProviderState;
  liveEnabled: boolean;
  achEnabled: boolean;
  preauthorizationsEnabled: boolean;
  businessTimeZone: string;
  holdWindowHours: number;
  holdBufferBps: number;
  webhookRefundGap: true;
};

export type PaymentMethodConsent = {
  id: number;
  customerId: number;
  customerName?: string;
  methodType: PaymentMethodType;
  status: "pending_setup" | "active" | "revoked" | "failed";
  consentText: string;
  consentedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type Preauthorization = {
  id: number;
  jobId: number;
  customerId: number;
  customerName?: string;
  paymentMethodConsentId: number | null;
  requestedCents: number;
  heldCents: number;
  capturedCents: number;
  status: PreauthorizationStatus;
  holdAfter: string;
  captureBefore: string | null;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_HOLD_BUFFER_BPS = 1_500;
export const MIN_HOLD_WINDOW_HOURS = 24;
export const MAX_HOLD_WINDOW_HOURS = 48;

/** Ceil protects the requested authorization from fractional-cent buffer loss. */
export function calculateHoldCents(
  baseCents: number,
  bufferBps = DEFAULT_HOLD_BUFFER_BPS
): number {
  if (!Number.isSafeInteger(baseCents) || baseCents < 50)
    throw new RangeError("baseCents must be an integer of at least 50 cents");
  if (
    !Number.isSafeInteger(bufferBps) ||
    bufferBps < 0 ||
    bufferBps > 10_000
  )
    throw new RangeError("bufferBps must be an integer from 0 through 10000");
  const amount = Math.ceil((baseCents * (10_000 + bufferBps)) / 10_000);
  if (!Number.isSafeInteger(amount) || amount > 2_000_000_000)
    throw new RangeError("Hold amount is outside the supported range");
  return amount;
}

export function validateHoldWindowHours(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_HOLD_WINDOW_HOURS ||
    value > MAX_HOLD_WINDOW_HOURS
  )
    throw new RangeError("Hold window must be a whole number from 24 through 48");
  return value;
}

export function validateBusinessTimeZone(value: string): string {
  if (!value || value.length > 64) throw new RangeError("Business timezone is invalid");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new RangeError("Business timezone must be a valid IANA timezone");
  }
  return value;
}

function zonedParts(instant: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
}

/**
 * Converts the scheduling UI's business-local YYYY-MM-DD/decimal hour to UTC.
 * A nonexistent wall time (the spring DST gap) is rejected instead of silently
 * moving a hold. For the repeated fall hour, Intl resolves to the later standard
 * time, which keeps the authorization no earlier than shown to the customer.
 */
export function businessMoveStartUtc(
  moveDate: string,
  startHour: number,
  timeZone: string
): Date {
  validateBusinessTimeZone(timeZone);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(moveDate);
  if (!match || !Number.isFinite(startHour) || startHour < 0 || startHour >= 24)
    throw new RangeError("Move date or start hour is invalid");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Math.floor(startHour);
  const minute = Math.round((startHour - hour) * 60);
  if (minute >= 60) throw new RangeError("Move start hour must be precise to the minute");
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetAt = (instantMs: number) => {
    const parts = zonedParts(new Date(instantMs), timeZone);
    return Date.UTC(
      parts.year!,
      parts.month! - 1,
      parts.day!,
      parts.hour!,
      parts.minute!,
      parts.second!
    ) - instantMs;
  };
  let instant = wallTime - offsetAt(wallTime);
  instant = wallTime - offsetAt(instant);
  const resolved = zonedParts(new Date(instant), timeZone);
  if (
    resolved.year !== year ||
    resolved.month !== month ||
    resolved.day !== day ||
    resolved.hour !== hour ||
    resolved.minute !== minute
  )
    throw new RangeError("Move start falls in a nonexistent local time");
  return new Date(instant);
}

export function canUseManualCapture(methodType: PaymentMethodType): boolean {
  // ACH cannot be used for separate authorization/capture in Stripe.
  return methodType === "card";
}

export function isInPreauthorizationWindow(
  moveAt: Date,
  now: Date,
  holdWindowHours: number
): boolean {
  validateHoldWindowHours(holdWindowHours);
  const diff = moveAt.getTime() - now.getTime();
  return diff >= 0 && diff <= holdWindowHours * 60 * 60 * 1000;
}

export function providerStateForKey(
  key: string | undefined,
  liveEnabled: boolean
): PaymentProviderState {
  if (!key) return "inactive";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_"))
    return "test_ready";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_"))
    return liveEnabled ? "live_ready" : "live_locked";
  return "inactive";
}

export function preauthorizationStatusLabel(
  status: PreauthorizationStatus): string {
  return {
    draft: "Draft",
    awaiting_customer_consent: "Awaiting customer consent",
    ready_for_hold: "Ready for hold",
    held: "Held — not a payment",
    capture_due: "Capture due",
    captured: "Captured",
    released: "Released",
    expired: "Expired",
    blocked_not_connected: "Blocked — provider not connected",
    requires_customer_action: "Customer action required",
  }[status];
}
