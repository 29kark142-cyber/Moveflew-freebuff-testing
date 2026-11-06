import { describe, expect, it } from "vitest";
import {
  CHECKIN_LIMIT,
  DRIVER_CHECKIN_TITLE,
  checkinActivity,
  checkinInputSchema,
  checkinLabel,
  checkinPhase,
  checkinTimeline,
  driverCheckins,
  isCheckinMilestone,
  latestCheckin,
  publicCheckins,
  withCheckin,
  type DriverCheckin,
} from "./checkin";

const checkin = (patch: Partial<DriverCheckin> = {}): DriverCheckin => ({
  id: "chk_1",
  milestone: "arrived_pickup",
  label: "Arrived at Pickup",
  note: "",
  at: "2026-05-04T09:00:00.000Z",
  crewId: 7,
  crewName: "Marcus Reed",
  lat: 39.739236,
  lng: -104.990251,
  accuracy: 12,
  ...patch,
});

describe("check-in milestones", () => {
  it("maps each milestone to its timeline phase", () => {
    expect(checkinLabel("en_route_origin")).toBe("En Route to Origin");
    expect(checkinLabel("arrived_pickup")).toBe("Arrived at Pickup");
    expect(checkinLabel("in_transit_destination")).toBe("In Transit to Destination");
    expect(checkinLabel("arrived_unload")).toBe("Arrived at Unload");
    expect(checkinPhase("in_transit_destination")).toBe("in_transit");
    expect(checkinPhase("arrived_unload")).toBe("arrive_dropoff");
    expect(isCheckinMilestone("nonsense")).toBe(false);
    expect(checkinLabel("nonsense")).toBe("Driver Check-In");
  });

  it("requires device coordinates inside the valid range", () => {
    expect(
      checkinInputSchema.safeParse({ milestone: "arrived_pickup", lat: 39.7, lng: -104.9 }).success,
    ).toBe(true);
    expect(
      checkinInputSchema.safeParse({ milestone: "arrived_pickup", lat: 91, lng: -104.9 }).success,
    ).toBe(false);
    expect(
      checkinInputSchema.safeParse({ milestone: "arrived_pickup", lat: 39.7, lng: 181 }).success,
    ).toBe(false);
    expect(checkinInputSchema.safeParse({ milestone: "arrived_pickup", lat: 39.7 }).success).toBe(
      false,
    );
    expect(
      checkinInputSchema.safeParse({
        milestone: "arrived_pickup",
        lat: 39.7,
        lng: -104.9,
        note: "   ",
      }).success,
    ).toBe(true);
  });
});

describe("saved check-ins", () => {
  it("parses newest first, drops bad rows and caps the log", () => {
    const rows = [
      checkin({ id: "old", at: "2026-05-04T07:00:00.000Z" }),
      checkin({ id: "new", at: "2026-05-04T11:00:00.000Z" }),
      { ...checkin({ id: "bad-coords" }), lat: 120 },
      { ...checkin({ id: "bad-time" }), at: "not-a-date" },
      { ...checkin({ id: "bad-milestone" }), milestone: "teleport" },
      ...Array.from({ length: 40 }, (_, index) =>
        checkin({ id: `extra-${index}`, at: `2026-04-30T0${index % 10}:00:00.000Z` }),
      ),
    ];
    const kept = driverCheckins(rows);
    expect(kept[0]?.id).toBe("new");
    expect(kept).toHaveLength(CHECKIN_LIMIT);
    expect(kept.some((entry) => entry.id.startsWith("bad"))).toBe(false);
    expect(latestCheckin(rows)?.id).toBe("new");
  });

  it("dedupes an offline replay by id", () => {
    const saved = withCheckin([checkin({ id: "a" })], checkin({ id: "b" }));
    expect(saved.map((entry) => entry.id)).toEqual(["b", "a"]);
    const replayed = withCheckin(saved, checkin({ id: "b", note: "replayed" }));
    expect(replayed).toHaveLength(2);
    expect(replayed[0]?.note).toBe("replayed");
  });

  it("advances the timeline only for a phase that is not recorded yet", () => {
    expect(checkinTimeline({}, "en_route_origin", "2026-05-04T08:00:00.000Z")).toEqual({
      start_travel: "2026-05-04T08:00:00.000Z",
    });
    expect(
      checkinTimeline(
        { start_travel: "2026-05-04T07:00:00.000Z" },
        "en_route_origin",
        "2026-05-04T08:00:00.000Z",
      ),
    ).toBeNull();
    expect(checkinTimeline({ in_transit: "x" }, "arrived_unload", "y")).toEqual({
      in_transit: "x",
      arrive_dropoff: "y",
    });
  });
});

describe("check-in audit and public feed", () => {
  it("writes a Driver Check-In event with crew and accuracy", () => {
    const event = checkinActivity({
      id: "chk_1",
      milestone: "arrived_pickup",
      crewName: "Marcus Reed",
      accuracy: 12,
      note: "Gate code 4412",
      at: "2026-05-04T09:00:00.000Z",
      by: "crew@example.test",
    });
    expect(event.kind).toBe("driver_checkin");
    expect(event.title).toBe(DRIVER_CHECKIN_TITLE);
    expect(event.detail).toBe("Arrived at Pickup · Marcus Reed · ±12 m · Gate code 4412");
    expect(event.id).toBe("checkin:chk_1");
  });

  it("keeps coordinates and crew ids out of the customer feed", () => {
    const rows = publicCheckins([
      checkin({ id: "a", at: "2026-05-04T10:00:00.000Z" }),
      checkin({ id: "b", at: "2026-05-04T09:00:00.000Z" }),
    ]);
    expect(rows.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(Object.keys(rows[0] ?? {})).toEqual(["id", "milestone", "label", "note", "at", "by"]);
    expect(JSON.stringify(rows)).not.toContain("lat");
    expect(rows[0]?.by).toBe("Marcus Reed");
  });
});
