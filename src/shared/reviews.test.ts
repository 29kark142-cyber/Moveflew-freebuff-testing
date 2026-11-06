import { describe, expect, it } from "vitest";
import { normalizeReviewRating, reviewMetrics, reviewOutcome } from "./reviews";

describe("review loop", () => {
  it("accepts only whole ratings from one to five", () => {
    expect(normalizeReviewRating(5)).toBe(5);
    expect(normalizeReviewRating("3")).toBe(3);
    expect(normalizeReviewRating(0)).toBeNull();
    expect(normalizeReviewRating(4.5)).toBeNull();
  });

  it("offers Google only to five-star reviews", () => {
    expect(reviewOutcome(5, "https://g.page/r/acme/review")).toMatchObject({
      kind: "google",
      redirectUrl: "https://g.page/r/acme/review",
      escalated: false,
    });
    expect(reviewOutcome(4, "https://g.page/r/acme/review")).toMatchObject({
      kind: "escalation",
      redirectUrl: null,
      escalated: true,
    });
  });

  it("does not invent a redirect when the business has no Google link", () => {
    expect(reviewOutcome(5, "")).toMatchObject({ kind: "none", redirectUrl: null });
  });

  it("calculates dashboard metrics from returned ratings only", () => {
    expect(
      reviewMetrics([
        { rating: 5, status: "submitted" },
        { rating: 4, status: "open", escalated: true },
        { rating: null, status: "sent" },
        { rating: 2, status: "open", escalated: true },
      ]),
    ).toMatchObject({
      requested: 4,
      responded: 3,
      responseRate: 75,
      average: 3.7,
      fiveStar: 1,
      lowRatings: 2,
      openEscalations: 2,
    });
  });
});
