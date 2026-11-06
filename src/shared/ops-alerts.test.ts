import { describe, expect, it } from "vitest";
import type { Job } from "./crm";
import { operationsAlerts } from "./ops-alerts";

const now = new Date(2026, 5, 15, 12, 0, 0);

const job = (patch: Partial<Record<string, unknown>> = {}): Job =>
  ({
    id: 1,
    title: "Maple St move",
    customerName: "Alex",
    status: "booked",
    moveDate: "2026-06-20",
    crewIds: [1],
    truckId: 1,
    crewShifts: [],
    ...patch,
  }) as unknown as Job;

describe("operations alerts", () => {
  it("flags missing crew and trucks, escalating near the move date", () => {
    const feed = operationsAlerts(
      [
        job({ id: 1, crewIds: [], truckId: null }),
        job({ id: 2, crewIds: [], truckId: 1, moveDate: "2026-06-15" }),
      ],
      now,
    );
    expect(feed.counts.unassigned).toBe(2);
    expect(feed.items[0]).toMatchObject({ kind: "unassigned", jobId: 2, severity: "critical" });
    expect(feed.items[1]).toMatchObject({
      kind: "unassigned",
      jobId: 1,
      title: "Crew & truck unassigned",
    });
  });

  it("flags quotes whose deposit has not been paid", () => {
    const feed = operationsAlerts(
      [
        job({ id: 3, status: "booked", quoteSentAt: "2026-06-10", depositPaidCents: 0 }),
        job({ id: 4, status: "booked", quoteSentAt: "2026-06-10", depositPaidCents: 20000 }),
      ],
      now,
    );
    expect(feed.counts.deposit).toBe(1);
    expect(feed.items.find((item) => item.kind === "deposit")?.jobId).toBe(3);
  });

  it("surfaces declined shifts with the crew names", () => {
    const feed = operationsAlerts(
      [
        job({
          id: 5,
          crewShifts: [
            {
              token: "shf_5_" + "a".repeat(32),
              crewId: 9,
              name: "Dana",
              role: "helper",
              status: "declined",
              sentAt: "2026-06-12T10:00:00.000Z",
            },
          ],
        }),
      ],
      now,
    );
    expect(feed.items[0]).toMatchObject({ kind: "decline", severity: "critical" });
    expect(feed.items[0]?.detail).toContain("Dana");
  });

  it("shows a recent driver milestone but ignores a stale one", () => {
    const feed = operationsAlerts(
      [
        job({
          id: 6,
          status: "in_progress",
          driverLocation: {
            lat: 1,
            lng: 2,
            accuracy: 5,
            at: new Date(now.getTime() - 30 * 60_000).toISOString(),
            milestone: "in_transit_destination",
            label: "In Transit to Destination",
            crewName: "Marcus",
          },
        }),
        job({
          id: 7,
          status: "in_progress",
          driverLocation: {
            lat: 1,
            lng: 2,
            accuracy: 5,
            at: new Date(now.getTime() - 30 * 3_600_000).toISOString(),
            milestone: "arrived_pickup",
            label: "Arrived at Pickup",
            crewName: "Marcus",
          },
        }),
      ],
      now,
    );
    expect(feed.counts.milestone).toBe(1);
    expect(feed.items[0]).toMatchObject({ kind: "milestone", jobId: 6 });
  });

  it("ignores closed jobs and returns an empty feed when everything is assigned", () => {
    const feed = operationsAlerts(
      [job({ id: 8, status: "completed", crewIds: [] }), job({ id: 9, status: "cancelled" })],
      now,
    );
    expect(feed.total).toBe(0);
    expect(feed.counts).toEqual({ decline: 0, unassigned: 0, deposit: 0, milestone: 0 });
  });
});
