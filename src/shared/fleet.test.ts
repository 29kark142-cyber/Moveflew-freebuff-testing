import { describe, expect, it } from "vitest";
import {
  PRE_TRIP_ITEMS,
  inspectionItems,
  maintenanceLog,
  parseInspection,
  parseInspectionSubmission,
  serviceDue,
} from "@shared/fleet";

describe("fleet service schedules", () => {
  it("calculates mileage remaining until the next service", () => {
    const state = serviceDue(
      { mileage: 12_400, serviceIntervalMiles: 5_000, lastServiceMiles: 10_000 },
      "2026-11-06",
    );
    expect(state.nextServiceMiles).toBe(15_000);
    expect(state.milesRemaining).toBe(2_600);
    expect(state.due).toBe(false);
    expect(state.label).toContain("2,600 mi");
  });

  it("flags overdue mileage and calendar service dates", () => {
    const overdue = serviceDue(
      { mileage: 15_200, serviceIntervalMiles: 5_000, lastServiceMiles: 10_000 },
      "2026-11-06",
    );
    expect(overdue.due).toBe(true);
    expect(overdue.dueByMiles).toBe(true);
    expect(overdue.label).toContain("overdue");

    const dated = serviceDue({ nextServiceDate: "2026-11-01" }, "2026-11-06");
    expect(dated.due).toBe(true);
    expect(dated.dueByDate).toBe(true);
  });

  it("handles a fleet record with no interval", () => {
    const state = serviceDue({}, "2026-11-06");
    expect(state.nextServiceMiles).toBeNull();
    expect(state.due).toBe(false);
    expect(state.label).toBe("No service interval set");
  });
});

describe("pre-trip inspection", () => {
  it("requires every checklist item exactly once", () => {
    const valid = parseInspectionSubmission({
      items: inspectionItems(),
      notes: "Yard check",
    });
    expect(valid).not.toBeNull();
    expect(valid!.items).toHaveLength(PRE_TRIP_ITEMS.length);

    expect(
      parseInspectionSubmission({ items: inspectionItems().slice(0, 2), notes: "" }),
    ).toBeNull();
    const duplicate = inspectionItems();
    duplicate[1] = { ...duplicate[1], key: duplicate[0].key };
    expect(parseInspectionSubmission({ items: duplicate, notes: "" })).toBeNull();
  });

  it("marks the inspection failed when any item is not okay", () => {
    const items = inspectionItems().map((item) =>
      item.key === "tire_pressure" ? { ...item, ok: false, note: "Front left low" } : item,
    );
    const submission = parseInspectionSubmission({ items, notes: "" });
    expect(submission).not.toBeNull();
    expect(submission!.items.every((item) => item.ok)).toBe(false);
  });

  it("accepts a stored inspection and rejects malformed records", () => {
    const stored = {
      id: "insp-1",
      truckId: 4,
      truckName: "Truck 4",
      driverId: 2,
      driverName: "Dana",
      date: "2026-11-06",
      items: inspectionItems(),
      passed: true,
      notes: "",
      createdAt: "2026-11-06T07:00:00.000Z",
    };
    expect(parseInspection(stored)?.passed).toBe(true);
    expect(parseInspection({ ...stored, date: "not-a-date" })).toBeNull();
    expect(parseInspection({ ...stored, items: [] })).toBeNull();
  });

  it("keeps only valid maintenance entries", () => {
    const log = maintenanceLog([
      {
        id: "m-1",
        serviceDate: "2026-11-01",
        odometer: 14_000,
        service: "Oil and filter",
        vendor: "Shop",
        costCents: 18_500,
        notes: "",
        nextServiceMiles: 19_000,
        createdAt: "2026-11-01T12:00:00.000Z",
      },
      {
        id: "m-2",
        serviceDate: "2026-11-02",
        odometer: 14_100,
        service: "",
        vendor: "",
        costCents: 0,
        notes: "",
        nextServiceMiles: null,
        createdAt: "2026-11-02T12:00:00.000Z",
      },
    ]);
    expect(log).toHaveLength(1);
    expect(log[0]?.service).toBe("Oil and filter");
  });
});
