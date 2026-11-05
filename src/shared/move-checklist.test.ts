import { describe, expect, it } from "vitest";
import {
  MOVE_CHECKLIST_ITEMS,
  MOVE_CHECKLIST_PHASES,
  checklistPhaseOf,
  checklistProgress,
  completedPhases,
  emptyChecklist,
  milestoneBlocker,
  milestoneUnlocked,
  normalizeChecklist,
  phaseProgress,
  setChecklistItem,
  type MoveChecklistState,
} from "./move-checklist";

const at = "2026-05-01T10:00:00.000Z";

const tick = (state: MoveChecklistState, key: (typeof MOVE_CHECKLIST_ITEMS)[number], done = true) =>
  setChecklistItem(state, key, {
    done,
    at: done ? at : null,
    crewId: 7,
    byName: "Ana",
  });

const completePhase = (
  state: MoveChecklistState,
  phaseKey: (typeof MOVE_CHECKLIST_PHASES)[number]["key"],
) => {
  const phase = MOVE_CHECKLIST_PHASES.find((entry) => entry.key === phaseKey);
  if (!phase) throw new Error("unknown phase");
  return phase.items.reduce<MoveChecklistState>((acc, item) => tick(acc, item.key), state);
};

describe("move-day checklist", () => {
  it("starts empty with twelve items across four phases", () => {
    expect(MOVE_CHECKLIST_PHASES).toHaveLength(4);
    expect(MOVE_CHECKLIST_ITEMS).toHaveLength(12);
    expect(checklistProgress(emptyChecklist())).toEqual({
      done: 0,
      total: 12,
      percent: 0,
    });
  });

  it("keeps the crew member and timestamp of each ticked item", () => {
    const state = tick(emptyChecklist(), "truck_inspection");
    expect(state.items.truck_inspection).toEqual({
      done: true,
      at,
      crewId: 7,
      byName: "Ana",
    });
    expect(phaseProgress(state, "pre_trip")).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    });
    expect(checklistProgress(state).percent).toBe(8);
  });

  it("clears the timestamp when an item is unticked", () => {
    const state = tick(emptyChecklist(), "ramp_secured");
    const cleared = tick(state, "ramp_secured", false);
    expect(cleared.items.ramp_secured?.done).toBe(false);
    expect(cleared.items.ramp_secured?.at).toBeNull();
    expect(checklistProgress(cleared).done).toBe(0);
  });

  it("reports completed phases in spec order", () => {
    let state = completePhase(emptyChecklist(), "origin");
    state = completePhase(state, "pre_trip");
    expect(completedPhases(state)).toEqual(["pre_trip", "origin"]);
  });

  it("unlocks the origin sign-off after phases 1-2 and the final one only at the end", () => {
    let state = completePhase(emptyChecklist(), "pre_trip");
    expect(milestoneUnlocked(state, "origin")).toBe(false);
    expect(milestoneBlocker(state, "origin").key).toBe("origin");

    state = completePhase(state, "origin");
    expect(milestoneUnlocked(state, "origin")).toBe(true);
    expect(milestoneUnlocked(state, "final")).toBe(false);
    expect(milestoneBlocker(state, "final").key).toBe("loading");

    state = completePhase(state, "loading");
    state = completePhase(state, "destination");
    expect(milestoneUnlocked(state, "final")).toBe(true);
    expect(checklistProgress(state)).toEqual({
      done: 12,
      total: 12,
      percent: 100,
    });
  });

  it("maps item keys back to their phase and ignores malformed saved data", () => {
    expect(checklistPhaseOf("furniture_wrapped")).toBe("loading");
    expect(checklistPhaseOf("not_an_item")).toBeNull();

    const state = normalizeChecklist({
      items: {
        truck_inspection: { done: true, at, crewId: 4, byName: "Sam" },
        made_up_item: { done: true },
        ramp_secured: "nope",
      },
      signoffs: {
        origin: { customerSignature: "data:image/png;base64,iVBOR" },
        final: {
          customerSignature: "data:image/png;base64,iVBORa",
          crewSignature: "data:image/png;base64,iVBORb",
          signedAt: at,
          crewName: "Ana",
          geo: { lat: 47.6, lng: -122.3, accuracy: 12 },
          byUserId: "user-1",
        },
      },
    });
    expect(Object.keys(state.items)).toEqual(["truck_inspection"]);
    expect(state.signoffs.origin).toBeUndefined();
    expect(state.signoffs.final?.geo).toEqual({
      lat: 47.6,
      lng: -122.3,
      accuracy: 12,
    });
    expect(normalizeChecklist(null)).toEqual(emptyChecklist());
  });
});
