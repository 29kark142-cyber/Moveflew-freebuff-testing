import { describe, expect, it } from "vitest";
import {
  DEPOSIT_EVENT_TITLE,
  DEPOSIT_PAID_STATUS,
  QUOTE_CONFIRMATION_EMAIL,
  QUOTE_CONFIRMATION_SMS,
  QUOTE_TERMS_LABEL,
  acceptanceEventDetail,
  formatUsdCents,
  isQuoteTestHost,
  quoteAcceptance,
  quoteDepositCents,
  renderQuoteConfirmation,
  type QuoteAcceptance,
} from "./quote-accept";

const signature = `data:image/png;base64,iVBOR${"a".repeat(120)}`;

const acceptance: QuoteAcceptance = {
  signature,
  signedAt: "2026-05-01T10:00:00.000Z",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0",
  termsAcceptedAt: "2026-05-01T10:00:00.000Z",
  customerName: "Ana Ruiz",
  reference: "MF-0042",
  payment: {
    provider: "stripe",
    transactionId: "pi_123",
    amountCents: 25000,
    mode: "live",
    status: "paid",
  },
};

describe("quote acceptance", () => {
  it("derives the deposit from a rule or an office override, capped at the total", () => {
    expect(quoteDepositCents(1000, { mode: "percentage", value: 25 }, null)).toBe(25000);
    expect(quoteDepositCents(1000, { mode: "fixed", value: 150 }, null)).toBe(15000);
    expect(quoteDepositCents(1000, null, 99)).toBe(9900);
    expect(quoteDepositCents(1000, null, 5000)).toBe(100000);
    expect(quoteDepositCents(1000, null, null)).toBe(0);
    expect(quoteDepositCents(0, { mode: "percentage", value: 25 }, null)).toBe(0);
  });

  it("allows credential-less test deposits only on preview hosts", () => {
    expect(isQuoteTestHost("localhost")).toBe(true);
    expect(isQuoteTestHost("pv-abc.style.dev")).toBe(true);
    expect(isQuoteTestHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isQuoteTestHost("moveflew.com")).toBe(false);
    expect(isQuoteTestHost("app.northwestmovingcrew.com")).toBe(false);
  });

  it("names the booking status, terms and activity event", () => {
    expect(DEPOSIT_PAID_STATUS).toBe("booked");
    expect(DEPOSIT_EVENT_TITLE).toBe("Deposit Paid & Quote Accepted");
    expect(QUOTE_TERMS_LABEL).toContain("Terms of Service");
    expect(QUOTE_TERMS_LABEL).toContain("Cancellation Policy");
  });

  it("summarises the payment, signature and test mode in the timeline detail", () => {
    expect(acceptanceEventDetail(acceptance)).toContain("Deposit $250.00");
    expect(acceptanceEventDetail(acceptance)).toContain("payment pi_123");
    expect(acceptanceEventDetail(acceptance)).toContain("signed by Ana Ruiz");

    const test = acceptanceEventDetail({
      ...acceptance,
      payment: { ...acceptance.payment, mode: "test" },
    });
    expect(test).toContain("(test)");

    const waived = acceptanceEventDetail({
      ...acceptance,
      payment: {
        provider: "none",
        transactionId: "waived",
        amountCents: 0,
        mode: "waived",
        status: "waived",
      },
    });
    expect(waived).toContain("Deposit waived");
  });

  it("renders the confirmation email and SMS with move details and receipt", () => {
    const context = {
      customerName: "Ana Ruiz",
      companyName: "Northwest Moving Crew",
      reference: "MF-0042",
      moveDate: "2026-05-01",
      origin: "1 Pine St",
      destination: "9 Oak Ave",
      crewSize: "3",
      total: "$1,000.00",
      deposit: formatUsdCents(25000),
      receiptId: "pi_123",
    };
    const email = renderQuoteConfirmation(QUOTE_CONFIRMATION_EMAIL.body, context);
    expect(email).toContain("Ana Ruiz");
    expect(email).toContain("From: 1 Pine St");
    expect(email).toContain("Deposit paid: $250.00");
    expect(email).toContain("pi_123");
    const sms = renderQuoteConfirmation(QUOTE_CONFIRMATION_SMS.body, context);
    expect(sms).toContain("2026-05-01");
    expect(sms).toContain("$250.00");
  });

  it("normalises saved acceptance records and rejects malformed ones", () => {
    const saved = quoteAcceptance({
      ...acceptance,
      signature,
      confirmation: { email: "accepted", sms: "logged" },
      extra: "ignored",
    });
    expect(saved?.payment.transactionId).toBe("pi_123");
    expect(saved?.confirmation).toEqual({ email: "accepted", sms: "logged" });

    expect(quoteAcceptance(null)).toBeNull();
    expect(quoteAcceptance({ ...acceptance, signature: "not-an-image" })).toBeNull();
    expect(quoteAcceptance({ ...acceptance, payment: null })).toBeNull();
    // An unknown mode falls back to "waived" rather than claiming live payment.
    expect(
      quoteAcceptance({ ...acceptance, payment: { ...acceptance.payment, mode: "mystery" } })
        ?.payment.mode,
    ).toBe("waived");
  });
});
