import { describe, expect, it } from "vitest";
import { allConflicts, conflictsFor, needsDispatch, type ScheduledJob } from "./dispatch";

const job = (p: Partial<ScheduledJob>): ScheduledJob => ({
  id: 1, moveDate: "2026-11-02", startHour: 8, duration: 4, status: "booked", truckId: null, crewIds: [], ...p,
});

describe("dispatch conflicts", () => {
  it("flags the same truck on overlapping jobs the same day", () => {
    const c = conflictsFor(job({ id: 1, truckId: 5 }), [job({ id: 2, truckId: 5, startHour: 10 })]);
    expect(c).toEqual([{ resource: "truck", resourceId: 5, jobId: 1, otherJobId: 2 }]);
  });
  it("flags a crew member on two overlapping jobs", () => {
    expect(allConflicts([job({ id: 1, crewIds: [7] }), job({ id: 2, crewIds: [7, 8], startHour: 11 })])).toHaveLength(1);
  });
  it("does not flag back-to-back jobs or different days", () => {
    expect(conflictsFor(job({ id: 1, truckId: 5 }), [job({ id: 2, truckId: 5, startHour: 12 })])).toEqual([]);
    expect(conflictsFor(job({ id: 1, truckId: 5 }), [job({ id: 2, truckId: 5, moveDate: "2026-11-03" })])).toEqual([]);
  });
  it("ignores cancelled jobs", () => {
    expect(conflictsFor(job({ id: 1, truckId: 5 }), [job({ id: 2, truckId: 5, status: "cancelled" })])).toEqual([]);
  });
  it("booked job needs dispatch until truck and full crew are set", () => {
    expect(needsDispatch({ ...job({ truckId: 5, crewIds: [1] }), crewSize: 2 })).toBe(true);
    expect(needsDispatch({ ...job({ truckId: 5, crewIds: [1, 2] }), crewSize: 2 })).toBe(false);
    expect(needsDispatch({ ...job({ status: "estimate" }), crewSize: 2 })).toBe(false);
  });
});
