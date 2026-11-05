import { describe, expect, it } from "vitest";
import type { Job } from "./crm";
import {
  DEFAULT_SCHEDULE_FILTERS,
  addDays,
  crewAssignedDetail,
  filterScheduleJobs,
  hourFromInput,
  jobsByDay,
  monthDays,
  renderCrewNotice,
  scheduleDiff,
  scheduleTone,
  snapQuarter,
  startOfWeek,
  timeInputValue,
  timeLabel,
  truckCapacityConflict,
  weekDays,
  CREW_ASSIGNMENT_SMS,
} from "./schedule";

const job = (patch: Partial<Job>): Job =>
  ({
    id: 1,
    customerName: "Ada",
    title: "Move",
    moveDate: "2026-11-05",
    startHour: 8,
    duration: 4,
    status: "booked",
    truckId: null,
    crewIds: [],
    inventory: [],
    origin: "A",
    destination: "B",
    crewSize: 2,
    ...patch,
  }) as Job;

describe("schedule calendar grids", () => {
  it("anchors weeks on Monday and rolls over months", () => {
    expect(weekDays("2026-11-05")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(startOfWeek("2026-03-01")).toBe("2026-02-23");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("builds a fixed six-week month grid starting on Monday", () => {
    const days = monthDays("2026-11-15");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-10-26");
    expect(days).toContain("2026-11-01");
    expect(days).toContain("2026-11-30");
  });

  it("groups jobs by day in start order", () => {
    const grouped = jobsByDay([
      job({ id: 2, startHour: 12 }),
      job({ id: 1, startHour: 8 }),
      job({ id: 3, moveDate: "2026-11-06" }),
    ]);
    expect(grouped.get("2026-11-05")?.map((entry) => entry.id)).toEqual([1, 2]);
    expect(grouped.get("2026-11-06")).toHaveLength(1);
  });
});

describe("schedule filters", () => {
  it("defaults to booked and deposit-paid moves only", () => {
    const shown = filterScheduleJobs(
      [
        job({ id: 1, status: "booked" }),
        job({ id: 2, status: "deposit_paid" }),
        job({ id: 3, status: "quote_sent" }),
        job({ id: 4, status: "cancelled" }),
        job({ id: 5, moveDate: "" }),
      ],
      DEFAULT_SCHEDULE_FILTERS,
    );
    expect(shown.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("filters by assigned crew, status and truck availability", () => {
    const jobs = [
      job({ id: 1, crewIds: [7], truckId: 3 }),
      job({ id: 2, crewIds: [8], truckId: null }),
      job({ id: 3, crewIds: [7], truckId: 4, status: "in_progress" }),
    ];
    expect(
      filterScheduleJobs(jobs, { ...DEFAULT_SCHEDULE_FILTERS, crewId: 7 }).map((j) => j.id),
    ).toEqual([1]);
    expect(
      filterScheduleJobs(jobs, { ...DEFAULT_SCHEDULE_FILTERS, status: "in_progress" }).map(
        (j) => j.id,
      ),
    ).toEqual([3]);
    expect(
      filterScheduleJobs(jobs, { ...DEFAULT_SCHEDULE_FILTERS, truckId: "unassigned" }).map(
        (j) => j.id,
      ),
    ).toEqual([2]);
    expect(
      filterScheduleJobs(jobs, { ...DEFAULT_SCHEDULE_FILTERS, truckId: 3 }).map((j) => j.id),
    ).toEqual([1]);
  });
});

describe("schedule blocks and capacity", () => {
  it("maps statuses to distinct tones", () => {
    expect(scheduleTone("booked")).toBe("booked");
    expect(scheduleTone("deposit_paid")).toBe("deposit");
    expect(scheduleTone("quote_sent")).toBe("quote");
    expect(scheduleTone("in_progress")).toBe("progress");
    expect(scheduleTone("completed")).toBe("done");
    expect(scheduleTone("weird")).toBe("other");
  });

  it("flags a truck that cannot carry the inventory volume or weight", () => {
    const inventory = [
      { key: "sofa", name: "Sofa", room: "Living", cuft: 50, weight: 200, quantity: 2 },
    ];
    expect(
      truckCapacityConflict(inventory, { name: "Truck 1", capacityCuft: 80, weightLimit: 5000 }),
    ).toContain("100 ft³");
    expect(
      truckCapacityConflict(inventory, { name: "Truck 1", capacityCuft: 400, weightLimit: 300 }),
    ).toContain("400 lb");
    expect(
      truckCapacityConflict(inventory, { name: "Truck 1", capacityCuft: 400, weightLimit: 5000 }),
    ).toBeNull();
  });

  it("formats quarter-hour times consistently", () => {
    expect(timeLabel(8)).toBe("8:00 AM");
    expect(timeLabel(13.5)).toBe("1:30 PM");
    expect(timeLabel(0)).toBe("12:00 AM");
    expect(timeInputValue(13.25)).toBe("13:15");
    expect(hourFromInput("13:15")).toBe(13.25);
    expect(snapQuarter(8.2)).toBe(8.25);
  });
});

describe("schedule changes", () => {
  const before = {
    moveDate: "2026-11-05",
    startHour: 8,
    duration: 4,
    truckId: 3,
    crewIds: [7],
  };

  it("detects reschedules, truck swaps and crew changes", () => {
    expect(
      scheduleDiff(before, { ...before, moveDate: "2026-11-06", startHour: 10 }),
    ).toMatchObject({ rescheduled: true, crewChanged: false, truckChanged: false });
    const crew = scheduleDiff(before, { ...before, crewIds: [7, 9] });
    expect(crew).toMatchObject({ rescheduled: false, crewChanged: true, addedCrewIds: [9] });
    expect(scheduleDiff(before, { ...before, truckId: 4 }).truckChanged).toBe(true);
  });

  it("names the new crew, truck and who was notified", () => {
    expect(
      crewAssignedDetail(before, { ...before, crewIds: [7, 9] }, ["Ana", "Luis"], "Truck 1", 2),
    ).toBe("Truck 1 · Ana, Luis · notified 2");
    expect(crewAssignedDetail(before, { ...before, crewIds: [] }, [], null, 0)).toBe(
      "No crew yet · removed 1",
    );
  });

  it("renders crew shift notices from the documented tokens only", () => {
    const text = renderCrewNotice(CREW_ASSIGNMENT_SMS, {
      name: "Ana",
      reference: "MF-1001",
      moveDate: "Thu, Nov 5",
      time: "8:00 AM",
      origin: "1 Main St",
      destination: "9 Oak Ave",
      crewSize: "2",
      companyName: "MoveFlew",
    });
    expect(text).toContain("Hi Ana");
    expect(text).toContain("MF-1001 on Thu, Nov 5 at 8:00 AM");
    expect(text).toContain("1 Main St to 9 Oak Ave");
    expect(renderCrewNotice("{unknown}", {} as never)).toBe("");
  });
});
