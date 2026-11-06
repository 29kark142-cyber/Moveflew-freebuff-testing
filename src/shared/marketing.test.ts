import { describe, expect, it } from "vitest";
import { marketingRates, marketingTriggers } from "./marketing";

describe("marketing re-engagement", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const customers = [{ id: 1, name: "Ada", email: "ada@example.com" }];

  it("finds expired quotes, stale estimates and anniversaries for the same customer", () => {
    const triggers = marketingTriggers({
      now,
      origin: "https://mover.example",
      customers,
      jobs: [
        { id: 10, customerId: 1, status: "quoted", quoteExpiresAt: "2026-11-01", proposalToken: "abc" },
        { id: 11, customerId: 1, status: "estimate", createdAt: "2026-11-01T12:00:00.000Z" },
        { id: 12, customerId: 1, status: "completed", moveDate: "2024-11-06" },
      ],
    });
    expect(triggers.map(trigger => trigger.kind)).toEqual([
      "expired_quote",
      "unconfirmed_estimate",
      "move_anniversary",
    ]);
    expect(triggers[0]).toMatchObject({
      channel: "email",
      destination: "https://mover.example/quote/abc",
    });
  });

  it("does not repeat a key already sent", () => {
    const jobs = [
      { id: 10, customerId: 1, status: "quoted", quoteExpiresAt: "2026-11-01", proposalToken: "abc" },
    ];
    expect(marketingTriggers({ now, jobs, customers, origin: "https://x", sentKeys: ["expired_quote:10:2026-11-01"] })).toEqual([]);
  });

  it("calculates open, click and booking rates", () => {
    expect(
      marketingRates([
        { openedAt: "x", clickedAt: "x", convertedAt: "x" },
        { openedAt: "x" },
        {},
        { sent: false },
      ]),
    ).toEqual({
      sent: 3,
      opened: 2,
      clicked: 1,
      converted: 1,
      openRate: 66.7,
      clickRate: 33.3,
      conversionRate: 33.3,
    });
  });
});
