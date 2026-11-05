import type { TravelSettings } from "./travel-rules";
import type { DepositRule } from "./proposal-rules";

/** Applied when an admin skips setup: every automatic fee is off ($0). */
export const SKIP_DEFAULTS: { travel: TravelSettings; deposit: DepositRule } = {
  travel: {
    dispatchAddress: "",
    travelPricingType: "none", travelFlatRate: 0, travelMileageRate: 0,
    fuelSurchargeType: "none", fuelFlatRate: 0, fuelPerMileRate: 0, fuelPercentageRate: 0,
  },
  deposit: { mode: "fixed", value: 0 },
};

export type SubscriptionStatus = "beta" | "trialing" | "active" | "past_due" | "canceled";

/** Past-due and canceled workspaces keep their data but become read-only. */
export function isReadOnly(status: SubscriptionStatus | undefined) {
  return status === "past_due" || status === "canceled";
}

export const PRICING_REMINDER =
  "Your pricing rules are set to default ($0). Configure your travel and deposit settings in Settings -> Pricing.";
