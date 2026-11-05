import type { CrewMember, Truck } from "./crm";

export const TIMELINE_SLOT_MINUTES = 15;
export const TIMELINE_SLOT_HOURS = TIMELINE_SLOT_MINUTES / 60;

export type TimelineWarningCode = "truck_overlap" | "crew_overlap" | "capacity";

export type TimelineWarning = {
  code: TimelineWarningCode;
  message: string;
  jobIds?: number[];
  crewIds?: number[];
};

export type TimelineAssignmentInput = {
  jobId: number;
  truckId: number | null;
  crewIds: number[];
  moveDate: string;
  startHour: number;
  duration: number;
  expectedUpdatedAt: string;
  previewToken: string;
  acknowledgedWarningCodes: TimelineWarningCode[];
};

export type TimelineJob = {
  id: number;
  customerId: number;
  customerName: string;
  title: string;
  moveDate: string;
  startHour: number;
  duration: number;
  status: string;
  truckId: number | null;
  crewIds: number[];
  requiredSkill: number;
  inventory: Array<{
    key: string;
    name: string;
    room: string;
    cuft: number;
    weight: number;
    quantity: number;
  }>;
  expectedUpdatedAt: string;
};

export type TimelineResource = Pick<
  Truck,
  "id" | "name" | "plate" | "status" | "capacityCuft" | "weightLimit"
>;

export type TimelineCrewResource = Pick<
  CrewMember,
  "id" | "name" | "status" | "isDriver" | "skillLevel" | "phone"
>;

export type TimelineResponse = {
  date: string;
  slots: number[];
  trucks: TimelineResource[];
  crew: TimelineCrewResource[];
  jobs: TimelineJob[];
  backlog: TimelineJob[];
};

export type TimelinePreview = {
  previewToken: string;
  warnings: TimelineWarning[];
  assignment: Pick<
    TimelineAssignmentInput,
    "jobId" | "truckId" | "crewIds" | "moveDate" | "startHour" | "duration"
  >;
};

export function isQuarterHour(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(
      value / TIMELINE_SLOT_HOURS - Math.round(value / TIMELINE_SLOT_HOURS)
    ) < 0.000001
  );
}

export function snapToQuarterHour(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Timeline time must be finite");
  return Math.round(value / TIMELINE_SLOT_HOURS) * TIMELINE_SLOT_HOURS;
}

export function validateTimelineWindow(
  startHour: number,
  duration: number
): void {
  if (
    !isQuarterHour(startHour) ||
    !isQuarterHour(duration) ||
    startHour < 0 ||
    startHour > 23.75 ||
    duration <= 0 ||
    duration > 24 ||
    startHour + duration > 24
  )
    throw new Error(
      "Timeline assignments must use 15-minute slots within one calendar day"
    );
}

export function timeWindowsOverlap(
  first: Pick<TimelineJob, "moveDate" | "startHour" | "duration">,
  second: Pick<TimelineJob, "moveDate" | "startHour" | "duration">
): boolean {
  return (
    first.moveDate === second.moveDate &&
    first.startHour < second.startHour + second.duration &&
    second.startHour < first.startHour + first.duration
  );
}

export function normalizedCrewIds(crewIds: readonly number[]): number[] {
  return [...new Set(crewIds)].sort((a, b) => a - b);
}

export function missingWarningAcknowledgements(
  warnings: readonly Pick<TimelineWarning, "code">[],
  acknowledged: readonly string[]
): TimelineWarningCode[] {
  const accepted = new Set(acknowledged);
  return [...new Set(warnings.map(warning => warning.code))].filter(
    (code): code is TimelineWarningCode => !accepted.has(code)
  );
}

/** Slots are represented as decimal hours so they align with persisted job values. */
export function timelineSlots(startHour = 6, endHour = 22): number[] {
  const slots: number[] = [];
  for (let value = startHour; value <= endHour; value += TIMELINE_SLOT_HOURS)
    slots.push(Number(value.toFixed(2)));
  return slots;
}
