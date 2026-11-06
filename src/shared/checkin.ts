// Driver check-ins: the four milestone updates a crew lead sends with device GPS. The same
// rules validate the phone request and power the customer progress feed, so a milestone means
// exactly the same thing on both screens.
import { z } from "zod";
import type { JobActivityEvent } from "./job-activity";

export const CHECKIN_MILESTONES = [
  { key: "en_route_origin", label: "En Route to Origin", phase: "start_travel" },
  { key: "arrived_pickup", label: "Arrived at Pickup", phase: "arrive_pickup" },
  { key: "in_transit_destination", label: "In Transit to Destination", phase: "in_transit" },
  { key: "arrived_unload", label: "Arrived at Unload", phase: "arrive_dropoff" },
] as const;

export type CheckinMilestone = (typeof CHECKIN_MILESTONES)[number]["key"];
export type CheckinPhase = (typeof CHECKIN_MILESTONES)[number]["phase"];

export const CHECKIN_LIMIT = 30;

export function isCheckinMilestone(value: unknown): value is CheckinMilestone {
  return CHECKIN_MILESTONES.some((entry) => entry.key === value);
}

export function checkinMilestone(value: unknown) {
  return CHECKIN_MILESTONES.find((entry) => entry.key === value) ?? null;
}

export function checkinLabel(value: unknown): string {
  return checkinMilestone(value)?.label ?? "Driver Check-In";
}

/** The field timeline phase a milestone advances, so the tracker moves with the check-in. */
export function checkinPhase(value: unknown): CheckinPhase | null {
  return checkinMilestone(value)?.phase ?? null;
}

export const checkinInputSchema = z.object({
  milestone: z.string().trim().max(40),
  // Device GPS is required: a milestone without coordinates cannot be placed on the move.
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().max(100_000).optional(),
  note: z.string().trim().max(300).default(""),
  at: z.string().trim().max(40).optional(),
  operationId: z.string().trim().max(80).optional(),
});

export type CheckinInput = z.infer<typeof checkinInputSchema>;

export type DriverCheckin = {
  id: string;
  milestone: CheckinMilestone;
  label: string;
  note: string;
  at: string;
  crewId: number | null;
  crewName: string;
  lat: number;
  lng: number;
  accuracy: number | null;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const coord = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Saved check-ins are untrusted: keep well-formed rows, newest first, capped. */
export function driverCheckins(value: unknown): DriverCheckin[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => {
      const lat = coord(entry["lat"]);
      const lng = coord(entry["lng"]);
      const at = text(entry["at"], 40);
      const accuracy = coord(entry["accuracy"]);
      return {
        id: text(entry["id"], 80),
        rawMilestone: entry["milestone"],
        label: checkinLabel(entry["milestone"]),
        note: text(entry["note"], 300),
        at,
        crewId: typeof entry["crewId"] === "number" ? entry["crewId"] : null,
        crewName: text(entry["crewName"], 120),
        lat,
        lng,
        accuracy: accuracy === null ? null : Math.max(0, Math.round(accuracy)),
      };
    })
    .filter(
      (entry) =>
        Boolean(entry.id) &&
        isCheckinMilestone(entry.rawMilestone) &&
        Number.isFinite(Date.parse(entry.at)) &&
        entry.lat !== null &&
        entry.lng !== null &&
        Math.abs(entry.lat) <= 90 &&
        Math.abs(entry.lng) <= 180,
    )
    .map((entry) => ({
      id: entry.id,
      milestone: entry.rawMilestone as CheckinMilestone,
      label: entry.label,
      note: entry.note,
      at: entry.at,
      crewId: entry.crewId,
      crewName: entry.crewName,
      lat: entry.lat as number,
      lng: entry.lng as number,
      accuracy: entry.accuracy,
    }))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, CHECKIN_LIMIT);
}

export function latestCheckin(value: unknown): DriverCheckin | null {
  return driverCheckins(value)[0] ?? null;
}

/** Newest first, deduped by id so an offline replay cannot double-log a milestone. */
export function withCheckin(value: unknown, checkin: DriverCheckin): DriverCheckin[] {
  return [checkin, ...driverCheckins(value).filter((entry) => entry.id !== checkin.id)].slice(
    0,
    CHECKIN_LIMIT,
  );
}

/** Advances the mapped timeline phase once; later phases already recorded are left alone. */
export function checkinTimeline(
  value: unknown,
  milestone: CheckinMilestone,
  at: string,
): Record<string, string> | null {
  const phase = checkinPhase(milestone);
  if (!phase) return null;
  const timeline: Record<string, string> = {
    ...(value && typeof value === "object" ? (value as Record<string, string>) : {}),
  };
  if (timeline[phase]) return null;
  timeline[phase] = at;
  return timeline;
}

export const DRIVER_CHECKIN_TITLE = "Driver Check-In";

/** Timeline event: milestone, crew member and GPS accuracy (never the raw coordinates). */
export function checkinActivity(input: {
  id: string;
  milestone: CheckinMilestone;
  crewName: string;
  accuracy: number | null;
  note?: string;
  at: string;
  by: string;
}): JobActivityEvent {
  const label = checkinLabel(input.milestone);
  const crew = input.crewName ? ` · ${input.crewName}` : "";
  const gps = input.accuracy !== null ? ` · ±${Math.round(input.accuracy)} m` : "";
  const note = input.note ? ` · ${input.note}` : "";
  return {
    id: `checkin:${input.id}`,
    kind: "driver_checkin",
    title: DRIVER_CHECKIN_TITLE,
    detail: `${label}${crew}${gps}${note}`.slice(0, 400),
    at: input.at,
    by: input.by,
  };
}

export type PublicCheckin = {
  id: string;
  milestone: CheckinMilestone;
  label: string;
  note: string;
  at: string;
  by: string;
};

/** Customer-safe check-ins: no crew ids, device coordinates or internal identifiers. */
export function publicCheckins(value: unknown): PublicCheckin[] {
  return driverCheckins(value)
    .slice(0, 8)
    .map((checkin) => ({
      id: checkin.id,
      milestone: checkin.milestone,
      label: checkin.label,
      note: checkin.note,
      at: checkin.at,
      by: checkin.crewName,
    }));
}
