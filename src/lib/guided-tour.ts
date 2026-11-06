import type { DriveStep } from "driver.js";

export type GuidedTourId =
  | "full_platform"
  | "crew_invite"
  | "quotes"
  | "field_qr"
  | "bol_signoff"
  | "surge_pricing";

export type GuidedTourStep = {
  id: string;
  path?: string;
  /** Candidate selectors in priority order; the first rendered one is spotlighted. */
  selectors: string[];
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Optional screen preparation before the step is measured, e.g. open a tab. */
  prepare?: {
    click?: string;
    event?: string;
    detail?: string | number | boolean | null;
  };
};

export type GuidedTourDefinition = {
  id: GuidedTourId;
  title: string;
  summary: string;
  category: string;
  keywords: string[];
  estimatedMinutes: number;
  steps: GuidedTourStep[];
};

/** These routes need a real job id; the tour host resolves them before navigating. */
export const JOB_TOUR_PATH = "/app/jobs/:id";
export const BOL_TOUR_PATH = "/app/jobs/:id/bol";
export const GUIDED_TOUR_EVENT = "nwcrewcrm:guided-tour";
export const GUIDED_TOUR_COMPLETED_EVENT = "nwcrewcrm:guided-tour-completed";
export const QUOTE_TOUR_STEP_EVENT = "nwcrewcrm:quote-tour-step";

export const GUIDED_TOURS: GuidedTourDefinition[] = [
  {
    id: "full_platform",
    title: "Full Platform Master Tour",
    summary:
      "The complete end-to-end walkthrough across quoting, jobs, dispatch, storage, field work and settings.",
    category: "All modules",
    keywords: ["full", "overview", "everything", "master", "workspace"],
    estimatedMinutes: 6,
    steps: [
      {
        id: "navigation",
        path: "/app/dashboard",
        selectors: ['[data-tour="workspace-nav"]', ".ws-nav"],
        title: "Your workspace navigation",
        description: "Access Jobs, Storage, and AI Credits here.",
        side: "right",
      },
      {
        id: "quote",
        path: "/app/dashboard",
        selectors: ['[data-tour="quick-quote"]', '[data-tour="estimates-nav"]'],
        title: "Quote a move in minutes",
        description: "Create new moving quotes for clients from here.",
        side: "bottom",
        align: "end",
      },
      {
        id: "job-sheet",
        path: JOB_TOUR_PATH,
        selectors: [
          '[data-tour="field-job-sheet"]',
          '[data-tour="job-sheet"]',
          '[data-tour="jobs-page"]',
          '[data-tour="jobs-nav"]',
        ],
        title: "The job sheet",
        description: "View field details, damage photo uploads, and customer signatures.",
        side: "right",
      },
      {
        id: "storage",
        path: "/app/storage",
        selectors: ['[data-tour="storage-vaults"]', '[data-tour="storage-page"]'],
        title: "Storage vaults",
        description: "Scan barcodes and track vault inventory.",
        side: "right",
      },
      {
        id: "estimates",
        path: "/app/estimates",
        selectors: ['[data-tour="estimates-page"]', ".ws-page-head"],
        title: "Estimates & proposals",
        description: "Track saved estimates and open the quote wizard to build a new proposal.",
        side: "bottom",
      },
      {
        id: "schedule",
        path: "/app/schedule",
        selectors: ['[data-tour="schedule-board"]', ".schedule-page"],
        title: "Schedule & dispatch",
        description: "See booked moves by month, week or day, then assign crews and trucks.",
        side: "bottom",
      },
      {
        id: "field",
        path: "/app/field",
        selectors: ['[data-tour="field-workspace"]', '[data-tour="field-job-sheet"]'],
        title: "Field crew workspace",
        description: "Crews open their assigned moves here to check in, add photos and capture signatures.",
        side: "bottom",
      },
      {
        id: "inventory",
        path: "/app/inventory",
        selectors: ['[data-tour="inventory-page"]', ".ops"],
        title: "QR box inventory",
        description: "Print one QR label per box, then scan on load and delivery to catch shortages.",
        side: "bottom",
      },
      {
        id: "settings",
        path: "/app/settings",
        selectors: ['[data-tour="settings-guides"]', ".ws-page-head"],
        title: "Settings & guided learning",
        description: "Configure pricing, team access and integrations, or replay a focused guide any time.",
        side: "bottom",
      },
    ],
  },
  {
    id: "crew_invite",
    title: "Inviting & Managing Crew",
    summary:
      "Invite staff, choose the right workspace role, set hourly pay, then assign the crew on the schedule.",
    category: "Team",
    keywords: ["crew", "staff", "invite", "role", "pay", "rate", "membership", "schedule"],
    estimatedMinutes: 2,
    steps: [
      {
        id: "membership-tab",
        path: "/app/settings",
        selectors: ['[data-tour="settings-team-tab"]', ".ws-tabs"],
        title: "Open Membership",
        description:
          "This guide opens the Membership tab for you. It is the home for workspace roles and crew invitations.",
        side: "bottom",
        prepare: { click: '[data-tour="settings-team-tab"]' },
      },
      {
        id: "invite-crew",
        path: "/app/settings",
        selectors: ['[data-tour="crew-invitations"]'],
        title: "Invite a crew member",
        description:
          "Create a secure share link or send an email invitation. The new person completes onboarding before they can see workspace records.",
        side: "bottom",
      },
      {
        id: "assign-role",
        path: "/app/settings",
        selectors: ['[data-tour="crew-invite-role"]'],
        title: "Assign the workspace role",
        description:
          "Pick the access level for this person. Managers can invite drivers and crew; admin roles remain owner-controlled.",
        side: "bottom",
      },
      {
        id: "set-pay-rate",
        path: "/app/settings",
        selectors: ['[data-tour="crew-invite-rate"]'],
        title: "Set the hourly pay rate",
        description:
          "Enter the default hourly rate used for payroll and job costing. The invite keeps the rate with the crew record.",
        side: "top",
      },
      {
        id: "schedule-board",
        path: "/app/schedule",
        selectors: ['[data-tour="schedule-board"]', ".schedule-page"],
        title: "Assign the crew to moves",
        description:
          "The schedule shows every booked move. Open a job to assign crew and a truck, with overlap warnings before saving.",
        side: "bottom",
      },
      {
        id: "crew-filter",
        path: "/app/schedule",
        selectors: ['[data-tour="schedule-crew-filter"]', ".schedule-toolbar"],
        title: "Filter by crew member",
        description:
          "Use this filter to inspect one person's assignments and confirm their week before publishing shifts.",
        side: "bottom",
      },
    ],
  },
  {
    id: "quotes",
    title: "Creating Quotes & Add-Ons",
    summary:
      "Build a quote, price packing materials, review the proposal total and configure the booking deposit.",
    category: "Sales",
    keywords: ["quote", "estimate", "packing", "materials", "deposit", "proposal", "pricing"],
    estimatedMinutes: 3,
    steps: [
      {
        id: "customer-step",
        path: "/app/estimates/new",
        selectors: ['[data-tour="quote-customer"]', ".ws-form-grid"],
        title: "Start with the customer and move",
        description:
          "Capture the customer, move date, route and move size. The wizard keeps the quote and proposal linked to one saved job.",
        side: "bottom",
      },
      {
        id: "inventory-step",
        path: "/app/estimates/new",
        selectors: ['[data-tour="quote-inventory"]'],
        title: "Add the household inventory",
        description:
          "This guide jumps to the inventory step. Quantities drive volume, weight and the proposal line items.",
        side: "bottom",
        prepare: { event: QUOTE_TOUR_STEP_EVENT, detail: 2 },
      },
      {
        id: "packing-materials",
        path: "/app/estimates/new",
        selectors: ['[data-tour="quote-packing-materials"]'],
        title: "Add packing materials and labor",
        description:
          "Set packing hours and box/material quantities. Each material uses the price configured in workspace pricing.",
        side: "top",
        prepare: { event: QUOTE_TOUR_STEP_EVENT, detail: 3 },
      },
      {
        id: "quote-preview",
        path: "/app/estimates/new",
        selectors: ['[data-tour="quote-preview"]'],
        title: "Review the proposal total",
        description:
          "The preview totals labor, travel, materials and surcharges before you save. Saving creates the shareable proposal.",
        side: "left",
      },
      {
        id: "deposit-rule",
        path: "/app/settings",
        selectors: ['[data-tour="deposit-settings"]'],
        title: "Set the booking deposit",
        description:
          "Choose a fixed deposit or a percentage of the estimate. The server applies this rule when the customer accepts.",
        side: "bottom",
        prepare: { click: '[data-tour="settings-pricing-tab"]' },
      },
    ],
  },
  {
    id: "field_qr",
    title: "Field Driver & QR Scanning",
    summary:
      "Walk through driver milestones, GPS check-ins and box-level QR scanning from load to delivery.",
    category: "Field",
    keywords: ["field", "driver", "crew", "qr", "scan", "inventory", "check-in", "milestone"],
    estimatedMinutes: 2,
    steps: [
      {
        id: "field-jobs",
        path: "/app/field",
        selectors: ['[data-tour="field-workspace"]', '[data-tour="field-job-sheet"]'],
        title: "Open today's field job",
        description:
          "Crews see only their assigned moves. This guide opens the first job so the move-day controls are visible.",
        side: "bottom",
      },
      {
        id: "field-milestones",
        path: "/app/field",
        selectors: ['[data-tour="field-milestones"]'],
        title: "Advance move milestones",
        description:
          "Drivers and crew leads advance the timecard from arrival through loading, delivery and completion. Office staff can also stage a job.",
        side: "bottom",
        prepare: { click: '[data-tour="field-open-job"]' },
      },
      {
        id: "driver-checkin",
        path: "/app/field",
        selectors: ['[data-tour="field-checkin"]'],
        title: "Send GPS driver check-ins",
        description:
          "Milestone check-ins attach the phone's location so the office and customer tracker see live progress.",
        side: "top",
      },
      {
        id: "inventory-labels",
        path: "/app/inventory",
        selectors: ['[data-tour="inventory-page"]', ".ops"],
        title: "Print one QR label per box",
        description:
          "The inventory desk creates a unique label for every physical box in the saved move inventory.",
        side: "bottom",
      },
      {
        id: "inventory-scan",
        path: "/app/inventory",
        selectors: ['[data-tour="inventory-scan"]'],
        title: "Scan on load and delivery",
        description:
          "Choose Loaded on truck or Unloaded at destination, then scan. Missing boxes are flagged on the job sheet.",
        side: "bottom",
      },
    ],
  },
  {
    id: "bol_signoff",
    title: "Digital BOL Sign-Off",
    summary:
      "Capture pickup and delivery signatures, then generate the signed Bill of Lading PDF.",
    category: "Documents",
    keywords: ["bol", "bill of lading", "signature", "sign-off", "pdf", "legal", "delivery"],
    estimatedMinutes: 2,
    steps: [
      {
        id: "bol-record",
        path: BOL_TOUR_PATH,
        selectors: ['[data-tour="bol-document"]', '[data-tour="jobs-page"]'],
        title: "The legal moving record",
        description:
          "The BOL combines the job, declared valuation, final pricing and contract terms. The guide opens a job's BOL for you.",
        side: "bottom",
      },
      {
        id: "bol-origin",
        path: BOL_TOUR_PATH,
        selectors: ['[data-tour="bol-origin-signoff"]'],
        title: "Pickup signature",
        description:
          "The customer reviews the declared value and terms, then signs at pickup. The signature is stored with the job.",
        side: "bottom",
      },
      {
        id: "bol-delivery",
        path: BOL_TOUR_PATH,
        selectors: ['[data-tour="bol-delivery-signoff"]'],
        title: "Delivery signature",
        description:
          "Capture the destination sign-off after unloading. Both signatures complete the dual-signature flow.",
        side: "bottom",
      },
      {
        id: "bol-pdf",
        path: BOL_TOUR_PATH,
        selectors: ['[data-tour="bol-pdf"]'],
        title: "Generate the signed PDF",
        description:
          "Once both signatures exist, the signed PDF is attached to the job documents and can be reloaded any time.",
        side: "top",
      },
    ],
  },
  {
    id: "surge_pricing",
    title: "Surge Pricing Setup",
    summary:
      "Configure weekend multipliers, seasonal date ranges, combined caps and end-of-month peak pricing.",
    category: "Pricing",
    keywords: ["surge", "seasonal", "weekend", "pricing", "peak", "multiplier", "cap"],
    estimatedMinutes: 2,
    steps: [
      {
        id: "surge-overview",
        path: "/app/settings/pricing",
        selectors: ['[data-tour="surge-pricing"]', ".ws-settings-section"],
        title: "Surge & peak-season pricing",
        description:
          "These rules adjust the estimate subtotal after discounts. They are separate from the base hourly, travel and material rates.",
        side: "bottom",
      },
      {
        id: "surge-weekend",
        path: "/app/settings/pricing",
        selectors: ['[data-tour="surge-weekend"]'],
        title: "Set the weekend multiplier",
        description:
          "Weekend markup applies to Saturday and Sunday moves. The cap below limits the total of all active surge rules.",
        side: "bottom",
      },
      {
        id: "surge-seasonal",
        path: "/app/settings/pricing",
        selectors: ['[data-tour="surge-seasonal"]'],
        title: "Add seasonal date ranges",
        description:
          "Add named peak windows with start and end dates. If ranges overlap, only the highest matching range applies.",
        side: "bottom",
      },
      {
        id: "surge-save",
        path: "/app/settings/pricing",
        selectors: ['[data-tour="surge-save"]', '[data-tour="surge-pricing"]'],
        title: "Save the pricing rules",
        description:
          "Save after changing the weekend, cap, seasonal or end-of-month settings. New estimates use the saved rules immediately.",
        side: "top",
      },
    ],
  },
];

export function getGuidedTour(id: GuidedTourId): GuidedTourDefinition | undefined {
  return GUIDED_TOURS.find((tour) => tour.id === id);
}

export function resolveTourSelector(selectors: string[]): string | null {
  if (typeof document === "undefined") return null;
  for (const selector of selectors) {
    if (document.querySelector(selector)) return selector;
  }
  return null;
}

/**
 * Builds driver.js steps with live selector functions, so moving between routes can
 * resolve each highlight after the destination screen has rendered.
 */
export function buildGuidedTourSteps(
  tour: GuidedTourDefinition,
  onStepStart?: (stepId: string, element?: Element) => void,
  onNavigateStep?: (index: number) => void,
): DriveStep[] {
  return tour.steps.map((step, index) => {
    const element = step.selectors.length
      ? () => {
          const selector = resolveTourSelector(step.selectors);
          // driver.js requires an Element here. waitForElement/our own waitForStep handle
          // the brief window where the destination screen is still mounting.
          return (selector ? document.querySelector(selector) : null) as Element;
        }
      : undefined;
    return {
      ...(element ? { element, waitForElement: 3500 } : {}),
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
        ...(onNavigateStep ? { onNextClick: () => onNavigateStep(index + 1) } : {}),
        ...(onNavigateStep && index > 0
          ? { onPrevClick: () => onNavigateStep(index - 1) }
          : {}),
      },
      onHighlightStarted: (element) => onStepStart?.(step.id, element),
    };
  });
}

export function requestGuidedTour(id: GuidedTourId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUIDED_TOUR_EVENT, { detail: { id } }));
}

export function tourCompletionKey(id: GuidedTourId): string {
  return `tour_${id}_completed`;
}

export function readTourCompletion(id: GuidedTourId): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(tourCompletionKey(id)) === "1";
  } catch {
    return false;
  }
}

export function markTourCompleted(id: GuidedTourId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tourCompletionKey(id), "1");
  } catch {
    /* Private mode: the completion badge is best-effort. */
  }
  window.dispatchEvent(new CustomEvent(GUIDED_TOUR_COMPLETED_EVENT, { detail: { id } }));
}

export function clearTourCompletion(id: GuidedTourId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(tourCompletionKey(id));
  } catch {
    /* ignore */
  }
}
