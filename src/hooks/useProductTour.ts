import { useCallback, useEffect, useRef, useState } from "react";
import type { DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { crm } from "@/lib/crm";
import {
  BOL_TOUR_PATH,
  GUIDED_TOUR_EVENT,
  JOB_TOUR_PATH,
  buildGuidedTourSteps,
  clearTourCompletion,
  getGuidedTour,
  markTourCompleted,
  resolveTourSelector,
  type GuidedTourId,
  type GuidedTourStep,
} from "@/lib/guided-tour";

/** One-time onboarding flag. `getItem` returning null means the user has never seen the tour. */
export const TOUR_STORAGE_KEY = "has_seen_tour";

export { resolveTourSelector };

export type ProductTourStep = {
  id: string;
  /**
   * Candidate selectors in priority order. The first one actually on screen is
   * highlighted; when none is present the step shows as a centred card, so the tour
   * never points at an element that does not exist on the current page.
   */
  selectors: string[];
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

const FULL_PLATFORM_TOUR = getGuidedTour("full_platform");

/**
 * The original onboarding sequence remains exported for compatibility. The master
 * tour starts with these same four steps, now followed by the rest of the platform.
 */
export const PRODUCT_TOUR_STEPS: ProductTourStep[] = (
  FULL_PLATFORM_TOUR?.steps.slice(0, 4) ?? []
).map(({ id, selectors, title, description, side, align }) => ({
  id,
  selectors,
  title,
  description,
  side,
  align,
}));

/** Builds the legacy one-page step list; used by the original onboarding tests. */
export function buildTourSteps(onStepStart?: (stepId: string) => void): DriveStep[] {
  return PRODUCT_TOUR_STEPS.map((step) => {
    const selector = resolveTourSelector(step.selectors);
    return {
      ...(selector ? { element: selector } : {}),
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
      },
      onHighlightStarted: () => onStepStart?.(step.id),
    };
  });
}

export type ProductTourOptions = {
  /** First sign-in: run the full tour once, then remember it. */
  autoStart?: boolean;
  /** Grace period so the host screen can finish loading before step 1 is measured. */
  delayMs?: number;
  /** Runs before the first step, e.g. to open a collapsed mobile drawer. */
  onBeforeStart?: (tourId: GuidedTourId) => void | Promise<void>;
  /** Fires as each step is highlighted, with that step's id and target. */
  onStepStart?: (stepId: string, target?: Element | null) => void;
  /** Runs after navigation/preparation but before driver.js measures the target. */
  onBeforeStep?: (stepId: string, target: Element | null) => void | Promise<void>;
  /** Fires when the tour completes, is dismissed or is stopped. */
  onTourEnd?: () => void;
  /** Shell navigation used to move between topic pages during a tour. */
  navigate?: (path: string) => void;
  /** Current route, used to avoid unnecessary navigation and resolve job-specific tours. */
  currentPath?: string;
};

export type ProductTourApi = {
  startTour: (tourId?: GuidedTourId) => Promise<void>;
  stopTour: () => void;
  resetTour: () => void;
  hasSeenTour: boolean;
  isRunning: boolean;
};

/**
 * Reusable guided-tour hook. The driver bundle is imported on demand and each tour
 * remembers completion under its own `tour_<id>_completed` key.
 */
export default function useProductTour({
  autoStart = false,
  delayMs = 900,
  onBeforeStart,
  onStepStart,
  onBeforeStep,
  onTourEnd,
  navigate,
  currentPath,
}: ProductTourOptions = {}): ProductTourApi {
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isRunning, setIsRunning] = useState(false);
  const instance = useRef<ReturnType<typeof import("driver.js").driver> | null>(null);
  const autoStarted = useRef(false);
  const refreshTimer = useRef<number | null>(null);
  const transitioning = useRef(false);
  const completed = useRef(false);
  const pathRef = useRef(currentPath ?? "");
  const navigateRef = useRef(navigate);

  // Callbacks live in refs so a re-rendering host never rebuilds a live tour.
  const beforeStart = useRef(onBeforeStart);
  const stepStart = useRef(onStepStart);
  const beforeStep = useRef(onBeforeStep);
  const tourEnd = useRef(onTourEnd);
  useEffect(() => {
    beforeStart.current = onBeforeStart;
    stepStart.current = onStepStart;
    beforeStep.current = onBeforeStep;
    tourEnd.current = onTourEnd;
  });
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);
  useEffect(() => {
    if (currentPath) pathRef.current = currentPath;
  }, [currentPath]);

  const cancelRefresh = useCallback(() => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  /** Drawers and panels animate; re-measure the highlight once the layout settles. */
  const scheduleRefresh = useCallback(() => {
    cancelRefresh();
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      instance.current?.refresh();
    }, 360);
  }, [cancelRefresh]);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* private mode: the tour simply offers itself again next visit */
    }
    setHasSeenTour(true);
  }, []);

  const waitForStep = useCallback(async (step: GuidedTourStep) => {
    if (!step.selectors.length) return;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (resolveTourSelector(step.selectors)) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
    }
  }, []);

  const resolveStepTarget = useCallback((step: GuidedTourStep): Element | null => {
    const selector = resolveTourSelector(step.selectors);
    return selector ? document.querySelector(selector) : null;
  }, []);

  /**
   * Driver measures the stage as soon as it renders the popover. Smooth scrolling
   * is asynchronous, so wait for the target to settle before handing it to driver.
   */
  const scrollStepIntoView = useCallback(async (target: Element | null) => {
    if (!target || typeof target.scrollIntoView !== "function") return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch {
      target.scrollIntoView();
    }
    if (typeof window.requestAnimationFrame !== "function") return;
    await new Promise<void>((resolve) => {
      const deadline = Date.now() + 650;
      let lastTop = target.getBoundingClientRect().top;
      let stableFrames = 0;
      const tick = () => {
        const top = target.getBoundingClientRect().top;
        stableFrames = Math.abs(top - lastTop) < 1 ? stableFrames + 1 : 0;
        lastTop = top;
        if (stableFrames >= 2 || Date.now() >= deadline) {
          resolve();
          return;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    });
  }, []);

  const prepareStep = useCallback(async (step: GuidedTourStep) => {
    const prepare = step.prepare;
    if (!prepare) return;
    if (prepare.click) {
      // The destination screen may still be mounting after client-side navigation.
      const deadline = Date.now() + 3000;
      let target = document.querySelector<HTMLElement>(prepare.click);
      while (!target && Date.now() < deadline) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
        target = document.querySelector<HTMLElement>(prepare.click);
      }
      target?.click();
    }
    if (prepare.event) {
      window.dispatchEvent(new CustomEvent(prepare.event, { detail: prepare.detail }));
    }
    if (prepare.click || prepare.event) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
    }
  }, []);

  const resolveStepPath = useCallback(async (step: GuidedTourStep) => {
    if (!step.path) return null;
    if (step.path !== BOL_TOUR_PATH && step.path !== JOB_TOUR_PATH) return step.path;
    const currentJob = /^\/app\/jobs\/(\d+)(?:\/bol)?\/?$/.exec(pathRef.current);
    if (step.path === JOB_TOUR_PATH) {
      if (currentJob) return `/app/jobs/${currentJob[1]}`;
      try {
        const jobs = await crm.jobs();
        return jobs[0] ? `/app/jobs/${jobs[0].id}` : "/app/jobs";
      } catch {
        return "/app/jobs";
      }
    }
    if (currentJob) return `/app/jobs/${currentJob[1]}/bol`;
    try {
      const jobs = await crm.jobs();
      return jobs[0] ? `/app/jobs/${jobs[0].id}/bol` : "/app/jobs";
    } catch {
      return "/app/jobs";
    }
  }, []);

  const stopTour = useCallback(() => {
    instance.current?.destroy();
    instance.current = null;
    setIsRunning(false);
  }, []);

  const startTour = useCallback(
    async (tourId: GuidedTourId = "full_platform") => {
      const definition = getGuidedTour(tourId);
      if (!definition || !definition.steps.length) return;
      if (instance.current) instance.current.destroy();
      completed.current = false;
      transitioning.current = false;

      try {
        // Host preparation must never block the tour from opening.
        await beforeStart.current?.(tourId);
      } catch {
        /* ignore: the tour still runs against whatever is on screen */
      }

      const first = definition.steps[0];
      const firstPath = await resolveStepPath(first);
      if (firstPath && firstPath !== pathRef.current) {
        navigateRef.current?.(firstPath);
        pathRef.current = firstPath;
      }
      await prepareStep(first);
      await waitForStep(first);
      const firstTarget = resolveStepTarget(first);
      try {
        await beforeStep.current?.(first.id, firstTarget);
      } catch {
        /* host preparation must never block the tour */
      }
      await scrollStepIntoView(firstTarget);

      const { driver } = await import("driver.js");
      let activeTour: ReturnType<typeof import("driver.js").driver> | null = null;

      const moveToStep = async (index: number) => {
        if (transitioning.current) return;
        const target = definition.steps[index];
        if (!target) {
          completed.current = true;
          activeTour?.destroy();
          return;
        }
        transitioning.current = true;
        try {
          const targetPath = await resolveStepPath(target);
          if (targetPath && targetPath !== pathRef.current) {
            navigateRef.current?.(targetPath);
            pathRef.current = targetPath;
          }
          await prepareStep(target);
          await waitForStep(target);
          const targetElement = resolveStepTarget(target);
          try {
            await beforeStep.current?.(target.id, targetElement);
          } catch {
            /* host preparation must never block the tour */
          }
          await scrollStepIntoView(targetElement);
          scheduleRefresh();
          activeTour?.moveTo(index);
        } finally {
          transitioning.current = false;
        }
      };

      activeTour = driver({
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        allowClose: true,
        overlayColor: "rgba(6, 20, 34, 0.62)",
        stagePadding: 10,
        stageRadius: 12,
        smoothScroll: true,
        popoverClass: "moveflew-tour",
        steps: buildGuidedTourSteps(
          definition,
          (stepId, element) => {
            stepStart.current?.(stepId, element);
            scheduleRefresh();
          },
          (index) => {
            void moveToStep(index);
          },
        ),
        onDestroyed: () => {
          instance.current = null;
          setIsRunning(false);
          cancelRefresh();
          markSeen();
          if (completed.current) markTourCompleted(definition.id);
          tourEnd.current?.();
        },
      });
      instance.current = activeTour;
      setIsRunning(true);
      activeTour.drive(0);
    },
    [
      cancelRefresh,
      markSeen,
      prepareStep,
      resolveStepPath,
      resolveStepTarget,
      scheduleRefresh,
      scrollStepIntoView,
      waitForStep,
    ],
  );

  // Any surface can launch a tour by dispatching the shared event.
  useEffect(() => {
    const launch = (event: Event) => {
      const id = (event as CustomEvent<{ id?: GuidedTourId }>).detail?.id;
      if (id) void startTour(id);
    };
    window.addEventListener(GUIDED_TOUR_EVENT, launch);
    return () => window.removeEventListener(GUIDED_TOUR_EVENT, launch);
  }, [startTour]);

  // First sign-in: run the full tour once, then remember it. The hosting screen only
  // passes autoStart once onboarding is finished, so it never fights the setup wizard.
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    let seen = false;
    try {
      seen = localStorage.getItem(TOUR_STORAGE_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen) return;
    autoStarted.current = true;
    const timer = window.setTimeout(() => {
      void startTour("full_platform");
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [autoStart, delayMs, startTour]);

  // Leaving the workspace mid-tour must not leave an overlay behind.
  useEffect(
    () => () => {
      cancelRefresh();
      instance.current?.destroy();
      instance.current = null;
    },
    [cancelRefresh],
  );

  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    clearTourCompletion("full_platform");
    setHasSeenTour(false);
    autoStarted.current = false;
  }, []);

  return { startTour, stopTour, resetTour, hasSeenTour, isRunning };
}
