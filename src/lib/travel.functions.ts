import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { travelSettingsSchema, type RoutePlan, type TravelSettings } from "./travel-rules";

const ws = z.object({ workspaceId: z.number().int().positive() });

function toSettings(row: Record<string, unknown>): TravelSettings {
  return travelSettingsSchema.parse({
    dispatchAddress: (row.dispatch_address as string) ?? "",
    travelPricingType: row.travel_pricing_type,
    travelFlatRate: Number(row.travel_flat_rate),
    travelMileageRate: Number(row.travel_mileage_rate),
    fuelSurchargeType: row.fuel_surcharge_type,
    fuelFlatRate: Number(row.fuel_flat_rate),
    fuelPerMileRate: Number(row.fuel_per_mile_rate),
    fuelPercentageRate: Number(row.fuel_percentage_rate),
  });
}
const COLUMNS = "dispatch_address,travel_pricing_type,travel_flat_rate,travel_mileage_rate,fuel_surcharge_type,fuel_flat_rate,fuel_per_mile_rate,fuel_percentage_rate";

export const getTravelSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("workspaces").select(COLUMNS).eq("id", data.workspaceId).single();
    if (error || !row) throw new Error("Could not load travel settings");
    return toSettings(row as Record<string, unknown>);
  });

export const saveTravelSettings = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.extend({ settings: travelSettingsSchema }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.rpc("workspace_role", { _ws: data.workspaceId });
    if (role !== "admin") throw new Error("Only workspace admins can change travel and fuel settings");
    const s = data.settings;
    const { error } = await context.supabase.from("workspaces").update({
      dispatch_address: s.dispatchAddress || null,
      travel_pricing_type: s.travelPricingType, travel_flat_rate: s.travelFlatRate, travel_mileage_rate: s.travelMileageRate,
      fuel_surcharge_type: s.fuelSurchargeType, fuel_flat_rate: s.fuelFlatRate, fuel_per_mile_rate: s.fuelPerMileRate, fuel_percentage_rate: s.fuelPercentageRate,
    }).eq("id", data.workspaceId);
    if (error) throw new Error("Could not save travel settings");
    return { saved: true };
  });

/** Drive distance/time for base → pickup → drop-off → base using Google Maps Routes. */
export const planRoute = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ws.extend({
    pickup: z.string().trim().min(3).max(300),
    dropoff: z.string().trim().min(3).max(300),
  }).parse(v))
  .handler(async ({ data, context }): Promise<{ route: RoutePlan; settings: TravelSettings } | { error: string }> => {
    const { data: role } = await context.supabase.rpc("workspace_role", { _ws: data.workspaceId });
    if (!role) return { error: "You don't have access to this workspace" };
    const { data: row } = await context.supabase.from("workspaces").select(COLUMNS).eq("id", data.workspaceId).single();
    if (!row) return { error: "Workspace not found" };
    const settings = toSettings(row as Record<string, unknown>);
    if (!settings.dispatchAddress) return { error: "Set your dispatch base address in Settings → Pricing first." };

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) return { error: "Google Maps is not connected" };

    const response = await fetch("https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.legs.distanceMeters,routes.legs.duration",
      },
      body: JSON.stringify({
        origin: { address: settings.dispatchAddress },
        intermediates: [{ address: data.pickup }, { address: data.dropoff }],
        destination: { address: settings.dispatchAddress },
        travelMode: "DRIVE",
        units: "IMPERIAL",
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(`Routes request failed [${response.status}]: ${body}`);
      if (response.status === 403) return { error: "Google Maps denied the route request. Check the Maps connection's allowed APIs." };
      return { error: "Route lookup failed. Check the addresses and try again." };
    }
    const json = (await response.json()) as { routes?: { legs?: { distanceMeters?: number; duration?: string }[] }[] };
    const legs = json.routes?.[0]?.legs;
    if (!legs || legs.length !== 3 || legs.some(l => typeof l.duration !== "string")) {
      return { error: "No driving route found between these addresses." };
    }
    const toLeg = (l: { distanceMeters?: number; duration?: string }) => ({
      miles: Math.round(((l.distanceMeters ?? 0) / 1609.344) * 10) / 10,
      minutes: Math.round(parseFloat(l.duration as string) / 60),
    });
    return { route: { toPickup: toLeg(legs[0]), move: toLeg(legs[1]), returnToBase: toLeg(legs[2]) }, settings };
  });
