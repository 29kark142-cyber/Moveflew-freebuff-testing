import { describe, expect, it } from "vitest";
import {
  QUOTE_MAX_DELIVERIES,
  QUOTE_TEMPLATES,
  appendQuoteDeliveries,
  quoteActivityTitle,
  quoteDeliveries,
  quoteDispatchDetail,
  quoteLink,
  quoteStatusLabel,
  QUOTE_TOKEN_RE,
  newQuoteToken,
  renderQuoteTemplate,
  type QuoteDelivery,
  type QuoteMessageContext,
} from "./quote-dispatch";

const context: QuoteMessageContext = {
  customerName: "Ana Ruiz",
  companyName: "Northwest Moving Crew",
  reference: "MF-0042",
  moveDate: "2026-05-01",
  total: "$1,250.00",
  link: "https://example.com/quote/qte_abc",
};

const delivery = (channel: "email" | "sms", status: QuoteDelivery["status"]): QuoteDelivery => ({
  channel,
  target: channel === "email" ? "ana@example.com" : "+15551234567",
  status,
  at: "2026-04-20T10:00:00.000Z",
  detail: "test",
});

describe("quote dispatch", () => {
  it("mints opaque quote tokens", () => {
    const token = newQuoteToken();
    expect(token).toMatch(QUOTE_TOKEN_RE);
    expect(newQuoteToken()).not.toBe(token);
    expect(QUOTE_TOKEN_RE.test("qte_short")).toBe(false);
    expect(QUOTE_TOKEN_RE.test("trk_0123456789abcdef0123456789abcdef")).toBe(false);
  });

  it("builds the public quote link without double slashes", () => {
    expect(quoteLink("https://app.example.com/", "qte_abc")).toBe(
      "https://app.example.com/quote/qte_abc",
    );
  });

  it("renders every documented token and drops unknown ones", () => {
    const email = renderQuoteTemplate(QUOTE_TEMPLATES.email.body, context);
    expect(email).toContain("Hi Ana Ruiz,");
    expect(email).toContain("Reference: MF-0042");
    expect(email).toContain("Estimated total: $1,250.00");
    expect(email).toContain(context.link);
    expect(email).toContain("Northwest Moving Crew");

    const sms = renderQuoteTemplate(QUOTE_TEMPLATES.sms.body, context);
    expect(sms).toContain("MF-0042");
    expect(sms).toContain(context.link);
    expect(renderQuoteTemplate("Hello {nope}!", context)).toBe("Hello !");
  });

  it("labels the job status", () => {
    expect(quoteStatusLabel("quote_sent")).toBe("Quote Sent");
    expect(quoteStatusLabel("booked")).toBe("booked");
  });

  it("names both channels and recipients in the timeline detail", () => {
    const detail = quoteDispatchDetail([delivery("email", "accepted"), delivery("sms", "logged")]);
    expect(detail).toBe("Email to ana@example.com (accepted) · SMS to +15551234567 (logged)");
    expect(quoteActivityTitle([delivery("email", "accepted")])).toBe("Quote Sent via Email/SMS");
    expect(quoteActivityTitle([delivery("email", "logged")])).toBe("Quote Dispatch Logged");
  });

  it("keeps only well-formed deliveries and caps the history", () => {
    const saved = quoteDeliveries([
      delivery("email", "accepted"),
      { channel: "carrier_pigeon", target: "x", status: "accepted", at: "now", detail: "" },
      { nope: true },
    ]);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.channel).toBe("email");

    const full = Array.from({ length: QUOTE_MAX_DELIVERIES }, () => delivery("sms", "accepted"));
    const appended = appendQuoteDeliveries(full, [delivery("email", "accepted")]);
    expect(appended).toHaveLength(QUOTE_MAX_DELIVERIES);
    expect(appended[appended.length - 1]?.channel).toBe("email");
    expect(quoteDeliveries(null)).toEqual([]);
  });
});
