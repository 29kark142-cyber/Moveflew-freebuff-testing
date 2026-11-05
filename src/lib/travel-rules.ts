import { z } from "zod";

export const travelSettingsSchema = z.object({
  dispatchAddress: z.string().trim().max(300),
  travelPricingType: z.enum(["hourly", "flat_fee", "per_mile", "none"]),
  travelFlatRate: z.number().finite().min(0).max(100000),
  travelMileageRate: z.number().finite().min(0).max(1000),
  fuelSurchargeType: z.enum(["per_mile", "percentage", "flat_fee", "none"]),
  fuelFlatRate: z.number().finite().min(0).max(100000),
  fuelPerMileRate: z.number().finite().min(0).max(1000),
  fuelPercentageRate: z.number().finite().min(0).max(100),
});
export type TravelSettings = z.infer<typeof travelSettingsSchema>;

/** One leg of the route; miles and minutes come from Google Maps. */
export type RouteLeg = { miles: number; minutes: number };
/** Base → pickup, pickup → drop-off, drop-off → base. */
export type RoutePlan = { toPickup: RouteLeg; move: RouteLeg; returnToBase: RouteLeg };

const cents = (n: number) => Math.round(n * 100) / 100;

export function totalMiles(route: RoutePlan) {
  return route.toPickup.miles + route.move.miles + route.returnToBase.miles;
}

/** Travel charge for the trips between the dispatch base and the job. */
export function travelCharge(settings: TravelSettings, route: RoutePlan, crewHourlyRate: number) {
  const deadheadMinutes = route.toPickup.minutes + route.returnToBase.minutes;
  const deadheadMiles = route.toPickup.miles + route.returnToBase.miles;
  switch (settings.travelPricingType) {
    case "hourly": return cents((deadheadMinutes / 60) * crewHourlyRate);
    case "flat_fee": return cents(settings.travelFlatRate);
    case "per_mile": return cents(deadheadMiles * settings.travelMileageRate);
    default: return 0;
  }
}

/** Fuel surcharge; percentage applies to the estimate subtotal before fuel. */
export function fuelCharge(settings: TravelSettings, route: RoutePlan, subtotal: number) {
  switch (settings.fuelSurchargeType) {
    case "per_mile": return cents(totalMiles(route) * settings.fuelPerMileRate);
    case "percentage": return cents(subtotal * (settings.fuelPercentageRate / 100));
    case "flat_fee": return cents(settings.fuelFlatRate);
    default: return 0;
  }
}

export const FUEL_FEE_NAME = "Fuel surcharge";
