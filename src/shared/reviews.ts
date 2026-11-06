/** Review-loop rules shared by the server, dashboard and public feedback page. */

export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export type ReviewOutcome = {
  kind: "google" | "escalation" | "none";
  /** Only a five-star response receives the optional public Google link. */
  redirectUrl: string | null;
  escalated: boolean;
  message: string;
};

export function normalizeReviewRating(value: unknown): ReviewRating | null {
  const rating = Number(value);
  return REVIEW_RATINGS.includes(rating as ReviewRating) ? (rating as ReviewRating) : null;
}

/**
 * Five-star customers are offered the company's Google Business page. Lower
 * ratings stay private and create an internal escalation instead of a public
 * redirect. The private feedback is always saved either way.
 */
export function reviewOutcome(rating: unknown, googleUrl: unknown): ReviewOutcome {
  const normalized = normalizeReviewRating(rating);
  const url = typeof googleUrl === "string" && /^https:\/\/\S+$/i.test(googleUrl.trim())
    ? googleUrl.trim()
    : "";
  if (normalized === 5) {
    return {
      kind: url ? "google" : "none",
      redirectUrl: url || null,
      escalated: false,
      message: url
        ? "Thank you. You can also share your experience on Google."
        : "Thank you for the five-star feedback.",
    };
  }
  if (normalized !== null && normalized <= 4) {
    return {
      kind: "escalation",
      redirectUrl: null,
      escalated: true,
      message:
        "Thank you for telling us. A manager has been alerted and will follow up privately.",
    };
  }
  return { kind: "none", redirectUrl: null, escalated: false, message: "" };
}

export type ReviewMetricInput = {
  rating?: unknown;
  status?: unknown;
  escalated?: unknown;
};

export type ReviewMetrics = {
  requested: number;
  responded: number;
  responseRate: number;
  average: number | null;
  fiveStar: number;
  lowRatings: number;
  openEscalations: number;
  distribution: Record<ReviewRating, number>;
};

/** Dashboard metrics only count actually returned ratings in the average. */
export function reviewMetrics(records: ReviewMetricInput[]): ReviewMetrics {
  const distribution: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let responded = 0;
  let total = 0;
  let openEscalations = 0;
  for (const record of records) {
    const rating = normalizeReviewRating(record.rating);
    if (rating !== null) {
      responded += 1;
      total += rating;
      distribution[rating] += 1;
    }
    if (record.escalated === true && record.status !== "resolved") openEscalations += 1;
  }
  const requested = records.length;
  return {
    requested,
    responded,
    responseRate: requested ? Math.round((responded / requested) * 1000) / 10 : 0,
    average: responded ? Math.round((total / responded) * 10) / 10 : null,
    fiveStar: distribution[5],
    lowRatings: distribution[1] + distribution[2] + distribution[3] + distribution[4],
    openEscalations,
    distribution,
  };
}
