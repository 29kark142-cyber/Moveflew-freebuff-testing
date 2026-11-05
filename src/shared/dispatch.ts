// Pure dispatch rules shared by the dispatch board (warnings) and the server (enforcement).
export type CrewRole = "driver" | "helper" | "crew_lead";
export const CREW_ROLES: { value: CrewRole; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "helper", label: "Helper" },
  { value: "crew_lead", label: "Crew Lead" },
];

export function crewRoleOf(person: { crewRole?: unknown; isDriver?: boolean }): CrewRole {
  const r = person.crewRole;
  if (r === "driver" || r === "helper" || r === "crew_lead") return r;
  return person.isDriver ? "driver" : "helper";
}

export type ScheduledJob = {
  id: number;
  title?: string;
  moveDate: string;
  startHour: number;
  duration: number;
  status: string;
  truckId: number | null;
  crewIds: number[];
};

export type Conflict = {
  resource: "truck" | "crew";
  resourceId: number;
  jobId: number;
  otherJobId: number;
};

// Jobs that no longer occupy trucks or people.
const INACTIVE = new Set(["cancelled", "canceled", "declined", "completed", "lost"]);

const day = (v: string) => String(v ?? "").slice(0, 10);

export function overlaps(a: ScheduledJob, b: ScheduledJob): boolean {
  if (!day(a.moveDate) || day(a.moveDate) !== day(b.moveDate)) return false;
  const aEnd = a.startHour + Math.max(0, Number(a.duration) || 0);
  const bEnd = b.startHour + Math.max(0, Number(b.duration) || 0);
  return a.startHour < bEnd && b.startHour < aEnd;
}

/** Conflicts for one job against every other active job. */
export function conflictsFor(job: ScheduledJob, others: ScheduledJob[]): Conflict[] {
  const out: Conflict[] = [];
  if (INACTIVE.has(job.status)) return out;
  for (const other of others) {
    if (other.id === job.id || INACTIVE.has(other.status) || !overlaps(job, other)) continue;
    if (job.truckId && job.truckId === other.truckId)
      out.push({ resource: "truck", resourceId: job.truckId, jobId: job.id, otherJobId: other.id });
    for (const id of job.crewIds ?? [])
      if ((other.crewIds ?? []).includes(id))
        out.push({ resource: "crew", resourceId: id, jobId: job.id, otherJobId: other.id });
  }
  return out;
}

/** Every conflicting pair on the board, each reported once. */
export function allConflicts(jobs: ScheduledJob[]): Conflict[] {
  const out: Conflict[] = [];
  jobs.forEach((job, i) => {
    for (const c of conflictsFor(job, jobs.slice(i + 1))) out.push(c);
  });
  return out;
}

/** Booked moves missing a truck or short of their planned crew size. */
export function needsDispatch(job: ScheduledJob & { crewSize?: number }): boolean {
  if (job.status !== "booked") return false;
  return !job.truckId || (job.crewIds ?? []).length < Math.max(1, Number(job.crewSize) || 1);
}
