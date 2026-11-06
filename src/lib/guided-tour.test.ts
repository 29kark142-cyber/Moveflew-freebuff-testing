import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOL_TOUR_PATH,
  GUIDED_TOURS,
  GUIDED_TOUR_COMPLETED_EVENT,
  buildGuidedTourSteps,
  clearTourCompletion,
  markTourCompleted,
  readTourCompletion,
  tourCompletionKey,
} from "./guided-tour";

const mount = (attribute: string, value: string) => {
  const element = document.createElement("div");
  element.setAttribute(attribute, value);
  document.body.appendChild(element);
};

describe("guided tour catalog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("offers the master tour plus five focused micro-tours", () => {
    expect(GUIDED_TOURS.map((tour) => tour.id)).toEqual([
      "full_platform",
      "crew_invite",
      "quotes",
      "field_qr",
      "bol_signoff",
      "surge_pricing",
    ]);
    expect(GUIDED_TOURS.filter((tour) => tour.id !== "full_platform")).toHaveLength(5);
  });

  it("keeps every tour modular, non-empty and uniquely identified", () => {
    const stepIds = GUIDED_TOURS.flatMap((tour) => tour.steps.map((step) => step.id));
    expect(new Set(stepIds).size).toBe(stepIds.length);
    for (const tour of GUIDED_TOURS) {
      expect(tour.steps.length).toBeGreaterThan(0);
      expect(tour.estimatedMinutes).toBeGreaterThan(0);
      for (const step of tour.steps) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers the requested routes and screen flows", () => {
    const paths = (id: string) =>
      GUIDED_TOURS.find((tour) => tour.id === id)?.steps.map((step) => step.path) ?? [];
    expect(paths("crew_invite")).toContain("/app/settings");
    expect(paths("crew_invite")).toContain("/app/schedule");
    expect(paths("quotes")).toContain("/app/estimates/new");
    expect(paths("quotes")).toContain("/app/settings");
    expect(paths("field_qr")).toContain("/app/field");
    expect(paths("field_qr")).toContain("/app/inventory");
    expect(paths("bol_signoff")).toEqual([BOL_TOUR_PATH, BOL_TOUR_PATH, BOL_TOUR_PATH, BOL_TOUR_PATH]);
    expect(paths("surge_pricing")).toEqual([
      "/app/settings/pricing",
      "/app/settings/pricing",
      "/app/settings/pricing",
      "/app/settings/pricing",
    ]);
  });

  it("uses the documented per-tutorial completion keys", () => {
    expect(tourCompletionKey("crew_invite")).toBe("tour_crew_invite_completed");
    expect(readTourCompletion("crew_invite")).toBe(false);
    const listener = vi.fn();
    window.addEventListener(GUIDED_TOUR_COMPLETED_EVENT, listener);
    markTourCompleted("crew_invite");
    expect(readTourCompletion("crew_invite")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    clearTourCompletion("crew_invite");
    expect(readTourCompletion("crew_invite")).toBe(false);
    window.removeEventListener(GUIDED_TOUR_COMPLETED_EVENT, listener);
  });

  it("dynamically resolves the rendered selector for each spotlight", () => {
    mount("data-tour", "settings-guides");
    const tour = GUIDED_TOURS.find((entry) => entry.id === "full_platform")!;
    const finalStep = buildGuidedTourSteps(tour).at(-1)!;
    expect(typeof finalStep.element).toBe("function");
    const resolved = (finalStep.element as () => Element | null)();
    expect((resolved as HTMLElement | null)?.dataset.tour).toBe("settings-guides");
  });
});
