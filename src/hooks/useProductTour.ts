import { useCallback, useEffect, useRef, useState } from "react";
import type { DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/** One-time onboarding flag. `getItem` returning null means the user has never seen the tour. */
export const TOUR_STORAGE_KEY = "has_seen_tour";

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

export const PRODUCT_TOUR_STEPS: ProductTourStep[] = [
  {
    id: "navigation",
    selectors: ['[data-tour="workspace-nav"]', ".ws-nav"],
    title: "Your workspace navigation",
    description: "Access Jobs, Storage, and AI Credits here.",
    side: "right",
  },
  {
    id: "quote",
    selectors: ['[data-tour="quick-quote"]', '[data-tour="estimates-nav"]'],
    title: "Quote a move in minutes",
    description: "Create new moving quotes for clients from here.",
    side: "bottom",
    align: "end",
  },
  {
    id: "job-sheet",
    selectors: [
      '[data-tour="field-job-sheet"]',
      '[data-tour="job-sheet"]',
      '[data-tour="jobs-nav"]',
    ],
    title: "The job sheet",
    description: "View field details, damage photo uploads, and customer signatures.",
    side: "right",
  },
  {
    id: "storage",
    selectors: ['[data-tour="storage-vaults"]', '[data-tour="storage-page"]'],
    title: "Storage vaults",
    description: "Scan barcodes and track vault inventory.",
    side: "right",
  },
];

/** First selector that is currently rendered, or null when the step has no anchor. */
export function resolveTourSelector(selectors: string[]): string | null {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    if (document.querySelector(selector)) return selector;
  }
  return null;
}

/**
 * Builds driver.js steps from the tour definition and the elements on screen right now.
 * `onStepStart` is fired per step so the host screen can reveal a container (a mobile
 * drawer) before the stage is measured.
 */
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
  /** First sign-in: run the tour once, then remember it. */
  autoStart?: boolean;
  /** Grace period so the host screen can finish loading before step 1 is measured. */
  delayMs?: number;
  /** Runs before the first step, e.g. to open a collapsed mobile drawer. */
  onBeforeStart?: () => void | Promise<void>;
  /** Fires as each step is highlighted, with that step's id. */
  onStepStart?: (stepId: string) => void;
  /** Fires when the tour completes, is dismissed or is stopped. */
  onTourEnd?: () => void;
};

export type ProductTourApi = {
  startTour: () => Promise<void>;
  stopTour: () => void;
  resetTour: () => void;
  hasSeenTour: boolean;
  isRunning: boolean;
};

/**
 * Reusable product tour. The driver bundle is imported on demand (never on first
 * paint) and the tour marks itself as seen on completion, dismissal or Escape.
 */
export default function useProductTour({
  autoStart = false,
  delayMs = 900,
  onBeforeStart,
  onStepStart,
  onTourEnd,
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

  // Callbacks live in refs so a re-rendering host never rebuilds a live tour.
  const beforeStart = useRef(onBeforeStart);
  const stepStart = useRef(onStepStart);
  const tourEnd = useRef(onTourEnd);
  useEffect(() => {
    beforeStart.current = onBeforeStart;
    stepStart.current = onStepStart;
    tourEnd.current = onTourEnd;
  });

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

  const stopTour = useCallback(() => {
    instance.current?.destroy();
    instance.current = null;
    setIsRunning(false);
  }, []);

  const startTour = useCallback(async () => {
    if (instance.current) return;
    try {
      // Host preparation must never block the tour from opening.
      await beforeStart.current?.();
    } catch {
      /* ignore: the tour still runs against whatever is on screen */
    }
    const { driver } = await import("driver.js");
    const tour = driver({
      showProgress: true,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Got it",
      allowClose: true,
      overlayColor: "rgba(6, 20, 34, 0.62)",
      stagePadding: 6,
      stageRadius: 12,
      popoverClass: "moveflew-tour",
      steps: buildTourSteps((stepId) => {
        stepStart.current?.(stepId);
        scheduleRefresh();
      }),
      onDestroyed: () => {
        instance.current = null;
        setIsRunning(false);
        cancelRefresh();
        markSeen();
        tourEnd.current?.();
      },
    });
    instance.current = tour;
    setIsRunning(true);
    tour.drive();
  }, [cancelRefresh, markSeen, scheduleRefresh]);

  // First sign-in: run once, then remember it. The hosting screen only passes
  // autoStart once onboarding is finished, so it never fights the setup wizard.
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
      void startTour();
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
    setHasSeenTour(false);
    autoStarted.current = false;
  }, []);

  return { startTour, stopTour, resetTour, hasSeenTour, isRunning };
}
