import { describe, expect, it } from "vitest";
import {
  estimateArrival,
  jobReference,
  newTrackingToken,
  routeProgress,
  trackingInventory,
  trackingItemStatus,
  trackingStage,
  TRACKING_TOKEN_RE,
  TRACKING_STAGES,
} from "./tracking";

const NOW = Date.parse("2026-11-05T15:00:00.000Z");
const job = { moveDate: "2026-11-05", startHour: 8, duration: 4, travelMinutes: 30 };

describe("live tracking", () => {
  it("maps every recorded field phase onto the customer stepper", () => {
    expect(trackingStage({}).index).toBe(-1);
    expect(trackingStage({ start_travel: "x" }).key).toBe("en_route");
    expect(trackingStage({ start_travel: "x", arrive_pickup: "x" }).key).toBe("loading");
    expect(trackingStage({ start_travel: "x", arrive_pickup: "x", in_transit: "x" }).key).toBe(
      "in_transit",
    );
    expect(trackingStage({ in_transit: "x", arrive_dropoff: "x" }).key).toBe("unloading");
    expect(trackingStage({ complete: "x" }).key).toBe("completed");
    expect(TRACKING_STAGES.map((s) => s.label)).toEqual([
      "En Route",
      "Loading",
      "In Transit",
      "Unloading",
      "Completed",
    ]);
  });

  it("treats a job that has not started as pending rather than en route", () => {
    const stage = trackingStage({});
    expect(stage.index).toBe(-1);
    expect(stage.started).toBe(false);
    expect(routeProgress({}, NOW, 30)).toBe(0);
  });

  it("advances the simulated route position monotonically through the stages", () => {
    const enRoute = routeProgress(
      { start_travel: new Date(NOW - 10 * 60_000).toISOString() },
      NOW,
      30,
    );
    const loading = routeProgress({ start_travel: "x", arrive_pickup: "x" }, NOW, 30);
    const transit = routeProgress(
      { arrive_pickup: "x", in_transit: new Date(NOW - 10 * 60_000).toISOString() },
      NOW,
      30,
    );
    const unloading = routeProgress({ arrive_dropoff: "x" }, NOW, 30);
    const done = routeProgress({ complete: "x" }, NOW, 30);
    expect(enRoute).toBeGreaterThan(0);
    expect(enRoute).toBeLessThan(loading);
    expect(loading).toBeLessThan(transit);
    expect(transit).toBeLessThan(unloading);
    expect(unloading).toBeLessThan(done);
    expect(done).toBe(1);
  });

  it("keeps the route position inside the map at every stage", () => {
    const stamps = [
      {},
      { start_travel: new Date(NOW).toISOString() },
      { start_travel: new Date(NOW - 10 * 3600_000).toISOString() },
      { arrive_pickup: "x" },
      { in_transit: new Date(NOW - 999 * 60_000).toISOString() },
      { arrive_dropoff: "x" },
      { complete: "x" },
    ];
    for (const timeline of stamps) {
      const progress = routeProgress(timeline, NOW, 30);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it("estimates arrival from remaining travel time while the crew is en route", () => {
    const estimate = estimateArrival(
      job,
      { start_travel: new Date(NOW - 10 * 60_000).toISOString() },
      NOW,
    );
    expect(estimate.basis).toBe("travel");
    expect(estimate.minutes).toBe(20);
    expect(estimate.label).toBe("Estimated arrival at pickup");
  });

  it("reports completion once the job is closed out", () => {
    const estimate = estimateArrival(job, { complete: "2026-11-05T19:00:00.000Z" }, NOW);
    expect(estimate.basis).toBe("completed");
    expect(estimate.at).toBe("2026-11-05T19:00:00.000Z");
    expect(estimate.minutes).toBe(0);
  });

  it("falls back to the scheduled completion instead of inventing a live ETA", () => {
    const estimate = estimateArrival(job, { arrive_pickup: "x", start_loading: "x" }, NOW);
    expect(estimate.basis).toBe("scheduled");
    expect(estimate.label).toBe("Estimated completion");
    expect(estimate.at).toBeTruthy();
  });

  it("estimates delivery from the remaining travel window while in transit", () => {
    const estimate = estimateArrival(
      job,
      { arrive_pickup: "x", in_transit: new Date(NOW - 10 * 60_000).toISOString() },
      NOW,
    );
    expect(estimate.basis).toBe("travel");
    expect(estimate.label).toBe("Estimated arrival at delivery");
    expect(estimate.minutes).toBe(20);
    expect(Date.parse(estimate.at ?? "")).toBe(NOW + 20 * 60_000);

    // A truck running long never reports a negative countdown.
    const late = estimateArrival(
      job,
      { arrive_pickup: "x", in_transit: new Date(NOW - 90 * 60_000).toISOString() },
      NOW,
    );
    expect(late.minutes).toBe(2);
    expect(late.minutes).toBeGreaterThan(0);
  });

  it("does not claim an ETA before the crew is dispatched", () => {
    const early = estimateArrival(job, {}, NOW);
    expect(early.basis).toBe("scheduled");
    expect(estimateArrival({}, {}, NOW).basis).toBe("unknown");
  });

  it("issues opaque tracking tokens and readable references", () => {
    const token = newTrackingToken();
    expect(token).toMatch(TRACKING_TOKEN_RE);
    expect(newTrackingToken()).not.toBe(token);
    expect(TRACKING_TOKEN_RE.test("42")).toBe(false);
    expect(TRACKING_TOKEN_RE.test("trk_short")).toBe(false);
    expect(jobReference(42)).toBe("MF-0042");
    expect(jobReference(7)).toBe("MF-0007");
  });
});

describe("customer shipment checklist", () => {
  it("categorises items from the recorded field stage", () => {
    expect(trackingItemStatus({})).toBeNull();
    expect(trackingItemStatus({ start_travel: "2026-01-01T08:00:00.000Z" })).toBe("loaded");
    expect(trackingItemStatus({ arrive_pickup: "2026-01-01T08:30:00.000Z" })).toBe("loaded");
    expect(trackingItemStatus({ in_transit: "2026-01-01T09:00:00.000Z" })).toBe("in_transit");
    expect(trackingItemStatus({ arrive_dropoff: "2026-01-01T10:00:00.000Z" })).toBe("unloaded");
    expect(trackingItemStatus({ complete: "2026-01-01T11:00:00.000Z" })).toBe("unloaded");
  });

  it("keeps only names, quantities and a valid status", () => {
    const items = trackingInventory({ in_transit: "2026-01-01T09:00:00.000Z" }, [
      { name: "Sofa", quantity: 2 },
      { name: "Lamp", quantity: 0, status: "unloaded" },
      { name: "", quantity: "3", status: "bogus" },
    ]);
    expect(items.map((item) => item.status)).toEqual(["in_transit", "unloaded", "in_transit"]);
    expect(items[0]).toMatchObject({ name: "Sofa", quantity: 2 });
    expect(items[1]?.quantity).toBe(1);
    expect(items[2]?.name).toBe("Item 3");
    expect(trackingInventory({}, [{ name: "Chair" }])[0]?.status).toBeNull();
    expect(trackingInventory({}, Array.from({ length: 50 }, () => ({ name: "Box" })))).toHaveLength(40);
  });
});
