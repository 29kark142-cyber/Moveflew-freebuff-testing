// Customer live-tracking rules. The public portal derives its stepper, simulated
// truck position and ETA from the same field timeline the crew writes, so the
// customer view can never drift from the job record.
import type { PublicCheckin } from "./checkin";
import type { PublicVault } from "./vault-photos";

export const TRACKING_STAGES = [
  { key: "en_route", label: "En Route", hint: "Crew heading to pickup" },
  { key: "loading", label: "Loading", hint: "Loading your belongings" },
  { key: "in_transit", label: "In Transit", hint: "Truck on the road" },
  { key: "unloading", label: "Unloading", hint: "Unloading at delivery" },
  { key: "completed", label: "Completed", hint: "Move complete" },
] as const;

export type TrackingStageKey = (typeof TRACKING_STAGES)[number]["key"];

/** Tracking links carry an opaque token, never a guessable job id. */
export const TRACKING_TOKEN_RE = /^trk_[a-f0-9]{32}$/;

export function newTrackingToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `trk_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Customer-facing job reference, e.g. job 42 → MF-0042. */
export function jobReference(id: number): string {
  return `MF-${String(Math.max(0, Math.trunc(id))).padStart(4, "0")}`;
}

export type TrackingTimeline = Partial<
  Record<
    | "start_travel"
    | "arrive_pickup"
    | "start_loading"
    | "in_transit"
    | "arrive_dropoff"
    | "complete",
    string
  >
>;

export type TrackingStage = {
  index: number;
  key: TrackingStageKey;
  label: string;
  hint: string;
  started: boolean;
};

/** Shape of the public tracking feed. Deliberately excludes prices, notes and customer contact data. */
export type PublicTrackingPayload = {
  reference: string;
  company: { name: string; phone: string; email: string; monogram: string };
  moveDate: string;
  startHour: number;
  duration: number;
  travelMinutes: number;
  distanceMiles: number;
  origin: string;
  destination: string;
  timeline: TrackingTimeline;
  foreman: { name: string; phone: string; role: string; initials: string } | null;
  /** Every assigned crew member, reduced to name and role for the customer. */
  crew: PublicCrewMember[];
  /** Latest driver milestone first; no coordinates or crew ids leave the server. */
  checkins: PublicCheckin[];
  lastCheckin: PublicCheckin | null;
  /** Linked vault assets and captioned inspection photos. */
  vaults: PublicVault[];
  /** Shipment checklist; status is derived from the crew's own timeline. */
  inventory: TrackingItem[];
  updatedAt: string;
};

export type PublicCrewMember = {
  name: string;
  initials: string;
  role: string;
  isDriver: boolean;
};

export type TrackingItemStatus = "loaded" | "in_transit" | "unloaded";

export type TrackingItem = {
  id: string;
  name: string;
  quantity: number;
  /** null until the crew starts the move, so nothing is claimed as loaded early. */
  status: TrackingItemStatus | null;
};

/** index === -1 means the crew has not started the move yet. */
export function trackingStage(timeline: TrackingTimeline | null | undefined): TrackingStage {
  const t = timeline ?? {};
  const stageAt = (index: number): TrackingStage => ({
    index,
    ...TRACKING_STAGES[index],
    started: index >= 0,
  });
  if (t.complete) return stageAt(4);
  if (t.arrive_dropoff) return stageAt(3);
  if (t.in_transit) return stageAt(2);
  if (t.arrive_pickup) return stageAt(1);
  if (t.start_travel) return stageAt(0);
  return { ...stageAt(0), index: -1, started: false };
}

const MS_MIN = 60_000;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const elapsedMinutes = (iso: string | undefined, now: number) => {
  const started = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(started) ? Math.max(0, (now - started) / MS_MIN) : 0;
};

/**
 * Fraction (0–1) of the drawn route the truck has covered. Deliberately derived
 * from job stage + elapsed time: it is an approximation, never a GPS fix.
 */
export function routeProgress(
  timeline: TrackingTimeline | null | undefined,
  now: number,
  travelMinutes = 0,
): number {
  const stage = trackingStage(timeline);
  if (stage.index < 0) return 0;
  const travel = Math.max(5, travelMinutes || 20);
  const t = timeline ?? {};
  if (stage.index === 0) {
    return clamp(0.04 + 0.26 * (elapsedMinutes(t.start_travel, now) / travel), 0.04, 0.3);
  }
  if (stage.index === 1) return 0.34;
  if (stage.index === 2) {
    return clamp(0.4 + 0.42 * (elapsedMinutes(t.in_transit, now) / travel), 0.4, 0.82);
  }
  if (stage.index === 3) return 0.88;
  return 1;
}

/** Shipment status for the whole load, derived from the recorded field timeline. */
export function trackingItemStatus(
  timeline: TrackingTimeline | null | undefined,
): TrackingItemStatus | null {
  const stage = trackingStage(timeline);
  if (stage.index < 0) return null;
  if (stage.index >= 3) return "unloaded";
  if (stage.index >= 2) return "in_transit";
  return "loaded";
}

/**
 * Public checklist rows. A per-item status recorded on the job wins; otherwise the
 * item follows the same stage the customer sees on the progress stepper.
 */
export function trackingInventory(
  timeline: TrackingTimeline | null | undefined,
  items: { name?: unknown; quantity?: unknown; status?: unknown }[],
): TrackingItem[] {
  const derived = trackingItemStatus(timeline);
  const valid = (value: unknown): value is TrackingItemStatus =>
    value === "loaded" || value === "in_transit" || value === "unloaded";
  return items.slice(0, 40).map((item, index) => ({
    id: `item-${index}`,
    name:
      String(item.name ?? "")
        .trim()
        .slice(0, 80) || `Item ${index + 1}`,
    quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
    status: valid(item.status) ? item.status : derived,
  }));
}

export type ArrivalBasis = "completed" | "scheduled" | "travel" | "unknown";

export type ArrivalEstimate = {
  at: string | null;
  minutes: number | null;
  basis: ArrivalBasis;
  label: string;
};

type JobTiming = {
  moveDate?: string;
  startHour?: number;
  duration?: number;
  travelMinutes?: number;
};

function scheduledAt(job: JobTiming): Date | null {
  const date = typeof job.moveDate === "string" ? job.moveDate.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = Number.isFinite(job.startHour) ? Number(job.startHour) : 8;
  const duration =
    Number.isFinite(job.duration) && Number(job.duration) > 0 ? Number(job.duration) : 4;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const at = new Date(y, m - 1, d);
  const minutes = Math.round((start + duration) * 60);
  at.setHours(0, minutes, 0, 0);
  return Number.isFinite(at.getTime()) ? at : null;
}

/**
 * ETA from the job's own schedule and recorded travel time. The portal labels
 * this as an estimate; it is not a live GPS prediction.
 */
export function estimateArrival(
  job: JobTiming,
  timeline: TrackingTimeline | null | undefined,
  now: number,
): ArrivalEstimate {
  const t = timeline ?? {};
  if (t.complete) {
    return { at: t.complete, minutes: 0, basis: "completed", label: "Move completed" };
  }
  const scheduledEnd = scheduledAt(job);
  const minutesTo = (at: Date) => Math.round((at.getTime() - now) / MS_MIN);

  // While the truck is on the road the day's schedule is a poor predictor, so the
  // ETA follows the recorded travel window and stays consistent with the simulated
  // position drawn on the map instead of contradicting it.
  if (t.in_transit) {
    const travel = Math.max(5, Number(job.travelMinutes) || 20);
    const remaining = Math.max(2, travel - elapsedMinutes(t.in_transit, now));
    const at = new Date(now + remaining * MS_MIN);
    return {
      at: at.toISOString(),
      minutes: Math.round(remaining),
      basis: "travel",
      label: "Estimated arrival at delivery",
    };
  }

  if (!t.start_travel && !t.arrive_pickup) {
    if (!scheduledEnd)
      return { at: null, minutes: null, basis: "unknown", label: "Crew not dispatched yet" };
    return {
      at: scheduledEnd.toISOString(),
      minutes: minutesTo(scheduledEnd),
      basis: "scheduled",
      label: "Scheduled completion",
    };
  }

  if (!t.arrive_pickup) {
    const travel = Math.max(5, Number(job.travelMinutes) || 20);
    const remaining = Math.max(2, travel - elapsedMinutes(t.start_travel, now));
    const at = new Date(now + remaining * MS_MIN);
    return {
      at: at.toISOString(),
      minutes: Math.round(remaining),
      basis: "travel",
      label: "Estimated arrival at pickup",
    };
  }

  if (!scheduledEnd) return { at: null, minutes: null, basis: "unknown", label: "Crew on site" };
  return {
    at: scheduledEnd.toISOString(),
    minutes: minutesTo(scheduledEnd),
    basis: "scheduled",
    label: "Estimated completion",
  };
}
