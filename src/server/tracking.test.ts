import { describe, expect, it } from "vitest";
import { recordDriverCheckin } from "./tracking";

type JobRecord = Record<string, unknown> & { id: number };

const baseJob = (patch: Record<string, unknown> = {}): JobRecord => ({
  id: 42,
  status: "booked",
  timeline: { start_travel: "2026-05-04T07:30:00.000Z" },
  activity: [],
  driverCheckins: [],
  ...patch,
});

const harness = (job: JobRecord) => {
  const saves: Record<string, unknown>[] = [];
  return {
    saves,
    deps: {
      job,
      crew: { id: 7, name: "Marcus Reed" },
      by: "Marcus Reed",
      save: async (patch: Record<string, unknown>) => {
        saves.push(patch);
        return { ...job, ...patch } as JobRecord;
      },
    },
  };
};

describe("driver check-in handler", () => {
  it("stores GPS, advances the timeline and logs the milestone", async () => {
    const job = baseJob();
    const { deps, saves } = harness(job);
    const result = await recordDriverCheckin({
      ...deps,
      payload: {
        milestone: "arrived_pickup",
        lat: 39.7392364,
        lng: -104.9902513,
        accuracy: 11.6,
        note: "On site",
        operationId: "c0ffee00-0000-4000-8000-000000000001",
      },
    });

    expect(result.duplicate).toBe(false);
    expect(result.checkin).toMatchObject({
      id: "c0ffee00-0000-4000-8000-000000000001",
      milestone: "arrived_pickup",
      crewId: 7,
      crewName: "Marcus Reed",
      lat: 39.739236,
      lng: -104.990251,
      accuracy: 12,
    });
    expect(saves).toHaveLength(1);
    const patch = saves[0] as Record<string, unknown>;
    expect(patch["timeline"]).toEqual({
      start_travel: "2026-05-04T07:30:00.000Z",
      arrive_pickup: result.checkin.at,
    });
    expect(patch["driverLocation"]).toMatchObject({
      milestone: "arrived_pickup",
      crewName: "Marcus Reed",
    });
    expect((patch["activity"] as { title: string }[])[0]?.title).toBe("Driver Check-In");
    expect(patch["status"]).toBeUndefined();
  });

  it("marks the job in progress when the crew sets off", async () => {
    const { deps, saves } = harness(baseJob({ timeline: {} }));
    const result = await recordDriverCheckin({
      ...deps,
      payload: { milestone: "en_route_origin", lat: 39.7, lng: -104.9 },
    });
    expect(result.checkin.label).toBe("En Route to Origin");
    expect((saves[0] as Record<string, unknown>)["status"]).toBe("in_progress");
  });

  it("replays the same operation without appending a second check-in", async () => {
    const first = harness(baseJob());
    const saved = await recordDriverCheckin({
      ...first.deps,
      payload: { milestone: "arrived_pickup", lat: 39.7, lng: -104.9, operationId: "op-1" },
    });
    const replay = harness(saved.job);
    const again = await recordDriverCheckin({
      ...replay.deps,
      payload: { milestone: "arrived_pickup", lat: 39.7, lng: -104.9, operationId: "op-1" },
    });
    expect(again.duplicate).toBe(true);
    expect(again.checkin.id).toBe("op-1");
    expect(replay.saves).toHaveLength(0);
  });

  it("rejects unknown milestones and unusable coordinates", async () => {
    const { deps } = harness(baseJob());
    await expect(
      recordDriverCheckin({ ...deps, payload: { milestone: "teleport", lat: 1, lng: 1 } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      recordDriverCheckin({ ...deps, payload: { milestone: "arrived_pickup", lat: 120, lng: 1 } }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
