import { beforeEach, describe, expect, it } from "vitest";
import {
  buildTourSteps,
  PRODUCT_TOUR_STEPS,
  resolveTourSelector,
  TOUR_STORAGE_KEY,
} from "./useProductTour";

const mount = (attribute: string, value: string) => {
  const element = document.createElement("div");
  element.setAttribute(attribute, value);
  document.body.appendChild(element);
};

describe("product tour", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the documented first-run storage key", () => {
    expect(TOUR_STORAGE_KEY).toBe("has_seen_tour");
  });

  it("covers navigation, quoting, the job sheet and storage in order", () => {
    expect(PRODUCT_TOUR_STEPS.map((step) => step.id)).toEqual([
      "navigation",
      "quote",
      "job-sheet",
      "storage",
    ]);
    expect(PRODUCT_TOUR_STEPS[0]?.description).toContain("Access Jobs, Storage, and AI Credits");
    expect(PRODUCT_TOUR_STEPS[1]?.description).toContain("Create new moving quotes");
    expect(PRODUCT_TOUR_STEPS[2]?.description).toContain("damage photo uploads");
    expect(PRODUCT_TOUR_STEPS[3]?.description).toContain("Scan barcodes");
  });

  it("resolves the first selector that is actually on screen", () => {
    expect(resolveTourSelector(['[data-tour="workspace-nav"]'])).toBeNull();
    mount("data-tour", "workspace-nav");
    expect(resolveTourSelector(['[data-tour="workspace-nav"]', ".ws-nav"])).toBe(
      '[data-tour="workspace-nav"]',
    );
    // A missing primary anchor falls back rather than pointing at nothing.
    const quote = buildTourSteps()[1];
    expect(quote?.element).toBeUndefined();
  });

  it("anchors every step that has a target and centres the rest", () => {
    mount("data-tour", "workspace-nav");
    mount("data-tour", "quick-quote");
    mount("data-tour", "storage-vaults");
    const steps = buildTourSteps();
    expect(steps[0]?.element).toBe('[data-tour="workspace-nav"]');
    expect(steps[1]?.element).toBe('[data-tour="quick-quote"]');
    // No job sheet on this screen: the step still shows, as a centred card.
    expect(steps[2]?.element).toBeUndefined();
    expect(steps[2]?.popover?.title).toBe("The job sheet");
    expect(steps[3]?.element).toBe('[data-tour="storage-vaults"]');
    expect(steps).toHaveLength(4);
  });

  it("tells the host which step is being highlighted", () => {
    const seen: string[] = [];
    const steps = buildTourSteps((stepId) => seen.push(stepId));
    expect(steps.every((step) => typeof step.onHighlightStarted === "function")).toBe(true);
    for (const step of steps) step.onHighlightStarted?.(document.body, step, {} as never);
    // The host opens the mobile drawer for these and closes it for the quote step.
    expect(seen).toEqual(["navigation", "quote", "job-sheet", "storage"]);
  });

  it("prefers the field job sheet over the navigation entry when it is open", () => {
    mount("data-tour", "field-job-sheet");
    mount("data-tour", "jobs-nav");
    expect(buildTourSteps()[2]?.element).toBe('[data-tour="field-job-sheet"]');
  });
});
