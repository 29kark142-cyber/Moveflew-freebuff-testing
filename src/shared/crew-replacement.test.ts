import { describe, expect, it } from "vitest";
import type { ScheduledJob } from "./dispatch";
import {
  REPLACEMENT_ASSIGNED_TITLE,
  isActiveCrew,
  replacementActivityEvent,
  replacementCandidates,
  weeklyScheduledHours,
  type ReplacementPerson,
} from "./crew-replacement";
import { crewShifts, withReplacementShift } from "./shift";

// Monday 2026-05-04, 8:00 AM for four hours.
const target = (patch: Partial<ScheduledJob> = {}): ScheduledJob => ({
  id: 10,
  moveDate: "2026-05-04",
  startHour: 8,
  duration: 4,
  status: "booked",
  truckId: null,
  crewIds: [1],
  ...patch,
});

const person = (id: number, patch: Partial<ReplacementPerson> = {}): ReplacementPerson => ({
  id,
  name: `Crew ${id}`,
  status: "active",
  isDriver: false,
  skillLevel: 2,
  ...patch,
});

describe("replacement candidate filters", () => {
  it("keeps only active crew who are free for the shift window", () => {
    const jobs = [
      target(),
      target({ id: 11, startHour: 10, duration: 4, crewIds: [3] }),
      target({ id: 12, moveDate: "2026-05-05", crewIds: [1] }),
    ];
    const crew = [
      person(1),
      person(2),
      person(3),
      person(4, { status: "inactive" }),
      person(5, { status: "Active" }),
    ];
    const ids = replacementCandidates(jobs[0] as ScheduledJob, crew, jobs).map((c) => c.crewId);
    expect(ids).toEqual([2, 5]);
    expect(isActiveCrew("inactive")).toBe(false);
    expect(isActiveCrew("active")).toBe(true);
  });

  it("requires driving permission when the truck has no remaining driver", () => {
    const job = target({ truckId: 7, crewIds: [1, 6] });
    const crew = [
      person(1),
      person(2),
      person(3, { isDriver: true }),
      person(6, { isDriver: true }),
    ];
    expect(replacementCandidates(job, crew, [job]).map((c) => c.crewId)).toEqual([2, 3]);

    const soloHelper = target({ truckId: 7, crewIds: [1] });
    expect(replacementCandidates(soloHelper, crew, [soloHelper]).map((c) => c.crewId)).toEqual([
      3, 6,
    ]);
    const noTruck = target({ crewIds: [1] });
    expect(replacementCandidates(noTruck, crew, [noTruck]).map((c) => c.crewId)).toEqual([2, 3, 6]);
  });

  it("never offers the crew member being replaced or someone already assigned", () => {
    const job = target({ crewIds: [1, 2] });
    const crew = [person(1), person(2), person(3)];
    expect(replacementCandidates(job, crew, [job]).map((candidate) => candidate.crewId)).toEqual([
      3,
    ]);
    expect(
      replacementCandidates(job, crew, [job], [1]).map((candidate) => candidate.crewId),
    ).toEqual([3]);
  });
});

describe("replacement workload ranking", () => {
  it("orders the lightest week first and ignores closed or out-of-week jobs", () => {
    const jobs = [
      target(),
      target({ id: 20, moveDate: "2026-05-05", duration: 8, crewIds: [2] }),
      target({ id: 21, moveDate: "2026-05-06", duration: 2, crewIds: [3] }),
      target({ id: 22, moveDate: "2026-05-03", duration: 8, crewIds: [3] }),
      target({ id: 23, moveDate: "2026-05-05", duration: 8, status: "completed", crewIds: [3] }),
    ];
    const crew = [person(1), person(2), person(3)];
    const candidates = replacementCandidates(jobs[0] as ScheduledJob, crew, jobs);
    expect(candidates.map((candidate) => [candidate.crewId, candidate.weeklyHours])).toEqual([
      [3, 2],
      [2, 8],
    ]);
    expect(weeklyScheduledHours(jobs, 3, "2026-05-04")).toBe(2);
  });

  it("describes availability and qualifications for the drawer", () => {
    const jobs = [target(), target({ id: 30, startHour: 14, duration: 3, crewIds: [3] })];
    const crew = [
      person(1),
      person(2),
      person(3, { isDriver: true, crewRole: "crew_lead", skillLevel: 4, name: "Sarah M." }),
    ];
    const candidates = replacementCandidates(jobs[0] as ScheduledJob, crew, jobs);
    expect(candidates.map((candidate) => candidate.name)).toEqual(["Crew 2", "Sarah M."]);
    expect(candidates[0]?.availability).toEqual(["Free all day"]);
    expect(candidates[0]?.qualifications).toEqual(["Skill 2"]);
    expect(candidates[1]?.availability).toEqual(["Free 8:00 AM – 12:00 PM"]);
    expect(candidates[1]?.qualifications).toEqual(["Driving permission", "Crew lead", "Skill 4"]);
    expect(candidates[1]?.weeklyHours).toBe(3);
  });
});

describe("replacement audit", () => {
  it("names both crew members on the timeline event", () => {
    const event = replacementActivityEvent({
      jobId: 10,
      replacementName: "Sarah M.",
      replacedName: "Alex R.",
      at: "2026-05-04T09:00:00.000Z",
      by: "dispatch@example.com",
    });
    expect(event.kind).toBe("replacement_assigned");
    expect(event.title).toBe(REPLACEMENT_ASSIGNED_TITLE);
    expect(event.detail).toBe("Assigned Sarah M. replacing Alex R.");
    expect(
      replacementActivityEvent({ jobId: 10, replacementName: "Sam", at: "x", by: "y" }).detail,
    ).toBe("Assigned Sam");
  });

  it("drops the replaced tokens and stores the fresh pending shift", () => {
    const shifts = [
      {
        token: "shf_a_0123456789abcdef0123456789abcdef",
        crewId: 1,
        name: "Alex R.",
        role: "Driver",
        status: "declined" as const,
        sentAt: "2026-05-01T08:00:00.000Z",
      },
      {
        token: "shf_a_abcdefabcdefabcdefabcdefabcdefab",
        crewId: 2,
        name: "Sam",
        role: "Helper",
        status: "confirmed" as const,
        sentAt: "2026-05-01T08:00:00.000Z",
      },
      {
        token: "shf_a_11111111111111111111111111111111",
        crewId: 3,
        name: "Sarah M.",
        role: "Crew lead",
        status: "declined" as const,
        sentAt: "2026-04-01T08:00:00.000Z",
      },
    ];
    const next = {
      token: "shf_a_22222222222222222222222222222222",
      crewId: 3,
      name: "Sarah M.",
      role: "Crew lead",
      status: "pending" as const,
      sentAt: "2026-05-04T09:00:00.000Z",
    };
    const saved = withReplacementShift(shifts, { removeCrewIds: [1, 3], shift: next });
    expect(saved.map((entry) => [entry.crewId, entry.status])).toEqual([
      [2, "confirmed"],
      [3, "pending"],
    ]);
    expect(crewShifts(saved)).toHaveLength(2);
  });
});
