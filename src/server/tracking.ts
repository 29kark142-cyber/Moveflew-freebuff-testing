// Driver check-in handler: validates the crew lead's milestone + device GPS, stores it on the
// job, advances the field timeline and appends a "Driver Check-In" timeline event.
import {
  checkinActivity,
  checkinInputSchema,
  checkinLabel,
  checkinPhase,
  checkinTimeline,
  driverCheckins,
  withCheckin,
  type CheckinMilestone,
  type DriverCheckin,
} from "../shared/checkin";
import { appendJobActivity } from "../shared/job-activity";

export class CheckinError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "CheckinError";
  }
}

type JobRecord = Record<string, unknown> & { id: number };

export type CheckinDeps = {
  job: JobRecord;
  payload: unknown;
  crew: { id: number; name: string } | null;
  by: string;
  save: (patch: Record<string, unknown>) => Promise<JobRecord>;
};

export type CheckinResult = {
  job: JobRecord;
  checkin: DriverCheckin;
  duplicate: boolean;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/**
 * Records one milestone. A repeated `operationId` (offline replay or a double tap) returns the
 * saved check-in instead of appending a second event, exactly like the field photo flow.
 */
export async function recordDriverCheckin(deps: CheckinDeps): Promise<CheckinResult> {
  const parsed = checkinInputSchema.safeParse(deps.payload);
  if (!parsed.success)
    throw new CheckinError("Send a milestone with valid device coordinates", 400);
  const input = parsed.data;
  if (checkinPhase(input.milestone as CheckinMilestone) === null)
    throw new CheckinError("Unknown driver milestone", 400);

  const milestone = input.milestone as CheckinMilestone;
  const existing = driverCheckins(deps.job["driverCheckins"]);
  const operationId = text(input.operationId);
  if (operationId) {
    const prior = existing.find((entry) => entry.id === operationId);
    if (prior) return { job: deps.job, checkin: prior, duplicate: true };
  }

  const at = (() => {
    const parsedAt = typeof input.at === "string" ? Date.parse(input.at) : NaN;
    if (!Number.isFinite(parsedAt)) return new Date().toISOString();
    // Accept a small clock skew from the phone, but never a far-future or ancient stamp.
    const now = Date.now();
    return parsedAt > now + 5 * 60_000 || parsedAt < now - 7 * 86_400_000
      ? new Date().toISOString()
      : new Date(parsedAt).toISOString();
  })();

  const crewName = deps.crew?.name || text(deps.by) || "Crew lead";
  const checkin: DriverCheckin = {
    id: operationId || `chk_${Date.parse(at).toString(36)}_${milestone}`,
    milestone,
    label: checkinLabel(milestone),
    note: input.note,
    at,
    crewId: deps.crew?.id ?? null,
    crewName,
    lat: round(input.lat, 6),
    lng: round(input.lng, 6),
    accuracy: input.accuracy === undefined ? null : Math.round(input.accuracy),
  };

  const timeline = checkinTimeline(deps.job["timeline"], milestone, at);
  const status = text(deps.job["status"]).toLowerCase();
  const patch: Record<string, unknown> = {
    driverCheckins: withCheckin(existing, checkin),
    driverLocation: {
      lat: checkin.lat,
      lng: checkin.lng,
      accuracy: checkin.accuracy,
      at,
      milestone,
      label: checkin.label,
      crewName,
    },
    activity: appendJobActivity(deps.job["activity"], [
      checkinActivity({
        id: checkin.id,
        milestone,
        crewName,
        accuracy: checkin.accuracy,
        note: checkin.note,
        at,
        by: deps.by || crewName,
      }),
    ]),
  };
  if (timeline) patch["timeline"] = timeline;
  if (milestone === "en_route_origin" && ["booked", "deposit_paid"].includes(status))
    patch["status"] = "in_progress";

  const job = await deps.save(patch);
  return { job, checkin, duplicate: false };
}
