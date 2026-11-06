// Replacement crew engine: who can take a declined (or unassigned) shift, ranked so dispatch
// spreads work evenly. These rules are pure so the dispatcher drawer and the server agree on
// every candidate, exactly like the dispatch overlap rules they build on.
import { crewRoleOf, overlaps, type CrewRole, type ScheduledJob } from "./dispatch";
import type { JobActivityEvent } from "./job-activity";
import { addDays, isoDay, startOfWeek, timeLabel } from "./schedule";

/** Jobs that no longer occupy a crew member's day. Mirrors the dispatch board rules. */
const INACTIVE_JOB = new Set(["cancelled", "canceled", "declined", "completed", "lost"]);

/** Only a crew member on the active roster can be offered a shift. */
export const isActiveCrew = (status: unknown): boolean =>
  String(status ?? "")
    .trim()
    .toLowerCase() === "active";

export type ReplacementPerson = {
  id: number;
  name: string;
  status: string;
  isDriver: boolean;
  crewRole?: string;
  skillLevel?: number;
  phone?: string;
  email?: string;
};

export type ReplacementCandidate = {
  crewId: number;
  name: string;
  role: CrewRole;
  roleLabel: string;
  isDriver: boolean;
  skillLevel: number;
  /** Hours already booked in the Monday-first week containing the shift. */
  weeklyHours: number;
  /** Hours already booked on the shift's own day. */
  dayHours: number;
  /** Availability chips for the drawer, e.g. "Free all day". */
  availability: string[];
  /** Qualification badges, e.g. "Driving permission". */
  qualifications: string[];
};

const ROLE_LABELS: Record<CrewRole, string> = {
  driver: "Driver",
  helper: "Helper",
  crew_lead: "Crew lead",
};

const round = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const crewIdsOf = (job: ScheduledJob): number[] => (job.crewIds ?? []).filter(Number.isFinite);

const personOn = (job: ScheduledJob, crewId: number): boolean => crewIdsOf(job).includes(crewId);

/** Every active job that still occupies the crew member on a given day. */
const bookedOn = (jobs: readonly ScheduledJob[], crewId: number, day: string): ScheduledJob[] =>
  jobs.filter(
    (job) => !INACTIVE_JOB.has(job.status) && personOn(job, crewId) && isoDay(job.moveDate) === day,
  );

/** Total booked hours in the Monday-first week of `day`, ignoring the job being filled. */
export function weeklyScheduledHours(
  jobs: readonly ScheduledJob[],
  crewId: number,
  day: string,
  ignoreJobId: number | null = null,
): number {
  const start = startOfWeek(isoDay(day));
  const end = addDays(start, 6);
  return round(
    jobs
      .filter(
        (job) =>
          job.id !== ignoreJobId &&
          !INACTIVE_JOB.has(job.status) &&
          personOn(job, crewId) &&
          isoDay(job.moveDate) >= start &&
          isoDay(job.moveDate) <= end,
      )
      .reduce((total, job) => total + Math.max(0, Number(job.duration) || 0), 0),
  );
}

/** Total booked hours on the shift's own day, ignoring the job being filled. */
export function dayScheduledHours(
  jobs: readonly ScheduledJob[],
  crewId: number,
  day: string,
  ignoreJobId: number | null = null,
): number {
  return round(
    bookedOn(jobs, crewId, isoDay(day))
      .filter((job) => job.id !== ignoreJobId)
      .reduce((total, job) => total + Math.max(0, Number(job.duration) || 0), 0),
  );
}

/**
 * A truck needs someone who can drive it: when the job has a truck and no *remaining* crew
 * member holds driving permission, only drivers qualify. A helper can still fill in when a
 * driver stays on the crew, and jobs without a truck have no driving requirement at all.
 */
export function needsDriver(
  job: ScheduledJob,
  crew: readonly ReplacementPerson[],
  replacingCrewIds: readonly number[] = [],
): boolean {
  if (!job.truckId) return false;
  return !crew.some(
    (person) =>
      person.isDriver && personOn(job, person.id) && !replacingCrewIds.includes(person.id),
  );
}

/**
 * Eligible replacements for one job, hardest filters first: active roster, not already on the
 * job, no overlap with the shift window, and driving permission when the truck needs it.
 * Results are ordered by weekly workload, then day workload, then name so dispatch can hand
 * the next shift to the lightest week.
 */
export function replacementCandidates(
  job: ScheduledJob,
  crew: readonly ReplacementPerson[],
  jobs: readonly ScheduledJob[],
  replacingCrewIds: readonly number[] = [],
): ReplacementCandidate[] {
  const day = isoDay(job.moveDate);
  if (!day) return [];
  const driverRequired = needsDriver(job, crew, replacingCrewIds);
  const start = Number(job.startHour) || 0;
  const duration = Math.max(0, Number(job.duration) || 0);
  const toTime = timeLabel(start + duration);

  return crew
    .filter((person) => !replacingCrewIds.includes(person.id))
    .filter((person) => !personOn(job, person.id))
    .filter((person) => isActiveCrew(person.status))
    .filter((person) => !driverRequired || person.isDriver)
    .filter(
      (person) =>
        !jobs.some(
          (other) =>
            other.id !== job.id &&
            !INACTIVE_JOB.has(other.status) &&
            personOn(other, person.id) &&
            overlaps(job, other),
        ),
    )
    .map((person) => {
      const role = crewRoleOf(person);
      const roleLabel = ROLE_LABELS[role];
      const weeklyHours = weeklyScheduledHours(jobs, person.id, day, job.id);
      const dayHours = dayScheduledHours(jobs, person.id, day, job.id);
      const availability =
        dayHours <= 0 ? ["Free all day"] : [`Free ${timeLabel(start)} – ${toTime}`];
      const qualifications: string[] = [];
      if (person.isDriver) qualifications.push("Driving permission");
      if (role === "crew_lead") qualifications.push("Crew lead");
      if (Number(person.skillLevel) > 0) qualifications.push(`Skill ${person.skillLevel}`);
      return {
        crewId: person.id,
        name: person.name || `Crew #${person.id}`,
        role,
        roleLabel,
        isDriver: person.isDriver,
        skillLevel: Number(person.skillLevel) || 0,
        weeklyHours,
        dayHours,
        availability,
        qualifications,
      };
    })
    .sort(
      (a, b) =>
        a.weeklyHours - b.weeklyHours ||
        a.dayHours - b.dayHours ||
        a.name.localeCompare(b.name) ||
        a.crewId - b.crewId,
    );
}

export const REPLACEMENT_ASSIGNED_TITLE = "Replacement Crew Assigned";

/**
 * Timeline event for a swap. The detail names both people so the job history answers
 * "who replaced whom" without opening the shift records.
 */
export function replacementActivityEvent(input: {
  jobId: number;
  replacementName: string;
  replacedName?: string | null;
  at: string;
  by: string;
}): JobActivityEvent {
  const replacement = input.replacementName || "Crew member";
  const replaced = input.replacedName ? ` replacing ${input.replacedName}` : "";
  return {
    id: `replacement:${input.at}`,
    kind: "replacement_assigned",
    title: REPLACEMENT_ASSIGNED_TITLE,
    detail: `Assigned ${replacement}${replaced}`.slice(0, 400),
    at: input.at,
    by: input.by,
  };
}
