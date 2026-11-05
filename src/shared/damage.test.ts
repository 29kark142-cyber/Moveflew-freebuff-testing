import { describe, expect, it } from "vitest";
import {
  PRE_MOVE_STATEMENT,
  preMoveChecklist,
  preMoveInspectionOpen,
  preMovePhotoMeta,
  preMoveSummaryLine,
  type DamagePhoto,
} from "./damage";

const photo = (over: Partial<DamagePhoto> = {}): DamagePhoto => ({
  id: 1,
  phase: "pre",
  note: "",
  photoUrl: "data:image/jpeg;base64,abc",
  room: "Bedroom",
  item: "Dresser",
  description: "Scratch on the top left corner",
  ...over,
});

describe("pre-move damage inspection", () => {
  it("closes the acknowledgment once loading has started", () => {
    expect(preMoveInspectionOpen({ start_travel: "2026-11-05T08:00:00.000Z" })).toBe(true);
    expect(preMoveInspectionOpen({ start_loading: "2026-11-05T09:00:00.000Z" })).toBe(false);
    expect(preMoveInspectionOpen(null)).toBe(true);
    expect(preMoveInspectionOpen({})).toBe(true);
  });

  it("counts only pre-move photos and lists their rooms", () => {
    const list = [
      photo({ id: 1, room: "Bedroom" }),
      photo({ id: 2, room: "Kitchen", item: "Fridge" }),
      photo({ id: 3, phase: "post", room: "Bedroom" }),
    ];
    const checklist = preMoveChecklist(list);
    expect(checklist.total).toBe(2);
    expect(checklist.rooms).toEqual(["Bedroom", "Kitchen"]);
    expect(checklist.ready).toBe(true);
  });

  it("flags photos saved without a room or item", () => {
    const checklist = preMoveChecklist([photo({ room: "" }), photo({ id: 2, item: "  " })]);
    expect(checklist.unlabelled).toBe(2);
    expect(checklist.ready).toBe(false);
  });

  it("summarises an empty inspection without inventing damage", () => {
    const empty = preMoveChecklist([]);
    expect(preMoveSummaryLine(empty)).toBe("No pre-existing damage recorded");
    expect(preMoveSummaryLine(preMoveChecklist([photo(), photo({ id: 2 })]))).toBe(
      "2 photos across 1 room",
    );
  });

  it("stores the trimmed metadata used for the customer record", () => {
    expect(
      preMovePhotoMeta(photo({ room: " Bedroom ", item: " Dresser ", description: " ding " })),
    ).toEqual({
      id: 1,
      room: "Bedroom",
      item: "Dresser",
      description: "ding",
    });
    expect(preMovePhotoMeta(photo({ description: "", note: "cracked frame" })).description).toBe(
      "cracked frame",
    );
  });

  it("keeps the customer statement stable for auditability", () => {
    expect(PRE_MOVE_STATEMENT).toMatch(/before loading started/);
  });
});
