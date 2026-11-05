// Move-day checklist rules shared by the crew phone screen, the office job sheet and the
// server, so progress, gating and labels can never drift between them.

export const MOVE_CHECKLIST_PHASES = [
  {
    key: "pre_trip",
    label: "Pre-Trip & Equipment",
    items: [
      { key: "truck_inspection", label: "Truck inspection" },
      { key: "straps_pads_loaded", label: "Straps / pads loaded" },
      { key: "ramp_secured", label: "Ramp secured" },
    ],
  },
  {
    key: "origin",
    label: "Origin Arrival",
    items: [
      { key: "arrival_inspection", label: "Arrival inspection" },
      { key: "floor_wall_protection", label: "Floor / wall protection set" },
      { key: "pre_damage_walkthrough", label: "Pre-damage walkthrough" },
    ],
  },
  {
    key: "loading",
    label: "Loading & Transport",
    items: [
      { key: "furniture_wrapped", label: "Furniture wrapped" },
      { key: "vaults_secured", label: "Vaults / items secured" },
      { key: "high_value_checked", label: "High-value inventory checked" },
    ],
  },
  {
    key: "destination",
    label: "Destination & Unload",
    items: [
      { key: "post_unload_walkthrough", label: "Post-unload walkthrough" },
      { key: "item_placement_verified", label: "Item placement verified" },
      { key: "empty_truck_sweep", label: "Empty truck sweep" },
    ],
  },
] as const;

export type MoveChecklistPhase = (typeof MOVE_CHECKLIST_PHASES)[number];
export type MoveChecklistPhaseKey = MoveChecklistPhase["key"];
export type MoveChecklistItemKey = MoveChecklistPhase["items"][number]["key"];

export const MOVE_CHECKLIST_ITEMS: readonly MoveChecklistItemKey[] = MOVE_CHECKLIST_PHASES.flatMap(
  (phase) => phase.items.map((item) => item.key),
);

/** Signature milestones: customer + crew lead sign when the origin work and the move end. */
export type MilestoneKey = "origin" | "final";

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  origin: "Origin Sign-off",
  final: "Final Destination Completion",
};

/** Checklist phases that must be complete before a milestone can be signed. */
export const MILESTONE_REQUIREMENTS: Record<MilestoneKey, readonly MoveChecklistPhaseKey[]> = {
  origin: ["pre_trip", "origin"],
  final: ["pre_trip", "origin", "loading", "destination"],
};

export type ChecklistItemState = {
  done: boolean;
  /** Server-accepted timestamp of the last tick (null once unticked). */
  at: string | null;
  /** Crew roster row of the member who ticked the item, resolved server-side. */
  crewId: number | null;
  byName: string;
};

export type MilestoneSignoff = {
  customerSignature: string;
  crewSignature: string;
  /** Exact server timestamp of the milestone. */
  signedAt: string;
  crewName: string;
  /** Optional device geolocation captured with the signature. */
  geo: { lat: number; lng: number; accuracy?: number } | null;
  byUserId: string;
};

export type MoveChecklistState = {
  items: Partial<Record<MoveChecklistItemKey, ChecklistItemState>>;
  signoffs: Partial<Record<MilestoneKey, MilestoneSignoff>>;
};

export const emptyChecklist = (): MoveChecklistState => ({
  items: {},
  signoffs: {},
});

export function isChecklistItem(value: unknown): value is MoveChecklistItemKey {
  return typeof value === "string" && (MOVE_CHECKLIST_ITEMS as readonly string[]).includes(value);
}

export function checklistPhaseOf(itemKey: string): MoveChecklistPhaseKey | null {
  const phase = MOVE_CHECKLIST_PHASES.find((candidate) =>
    candidate.items.some((item) => item.key === itemKey),
  );
  return phase ? phase.key : null;
}

export function itemLabel(itemKey: string): string {
  for (const phase of MOVE_CHECKLIST_PHASES)
    for (const item of phase.items) if (item.key === itemKey) return item.label;
  return itemKey;
}

/** Saved job data is untrusted: keep only well-formed items and milestones. */
export function normalizeChecklist(value: unknown): MoveChecklistState {
  const source =
    value && typeof value === "object" ? (value as { items?: unknown; signoffs?: unknown }) : {};
  const items: MoveChecklistState["items"] = {};
  if (source.items && typeof source.items === "object") {
    for (const [key, raw] of Object.entries(source.items as Record<string, unknown>)) {
      if (!isChecklistItem(key) || !raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      items[key] = {
        done: entry.done === true,
        at: typeof entry.at === "string" ? entry.at : null,
        crewId:
          typeof entry.crewId === "number" && Number.isFinite(entry.crewId) ? entry.crewId : null,
        byName: typeof entry.byName === "string" ? entry.byName : "",
      };
    }
  }
  const signoffs: MoveChecklistState["signoffs"] = {};
  if (source.signoffs && typeof source.signoffs === "object") {
    for (const milestone of ["origin", "final"] as const) {
      const raw = (source.signoffs as Record<string, unknown>)[milestone];
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Record<string, unknown>;
      if (
        typeof entry.customerSignature !== "string" ||
        typeof entry.crewSignature !== "string" ||
        typeof entry.signedAt !== "string"
      )
        continue;
      const geo = entry.geo as Record<string, unknown> | null | undefined;
      signoffs[milestone] = {
        customerSignature: entry.customerSignature,
        crewSignature: entry.crewSignature,
        signedAt: entry.signedAt,
        crewName: typeof entry.crewName === "string" ? entry.crewName : "",
        byUserId: typeof entry.byUserId === "string" ? entry.byUserId : "",
        geo:
          geo && typeof geo.lat === "number" && typeof geo.lng === "number"
            ? {
                lat: geo.lat,
                lng: geo.lng,
                ...(typeof geo.accuracy === "number" ? { accuracy: geo.accuracy } : {}),
              }
            : null,
      };
    }
  }
  return { items, signoffs };
}

export function setChecklistItem(
  state: MoveChecklistState,
  itemKey: MoveChecklistItemKey,
  change: ChecklistItemState,
): MoveChecklistState {
  return { ...state, items: { ...state.items, [itemKey]: change } };
}

export type ChecklistProgress = { done: number; total: number; percent: number };

export function progressOf(done: number, total: number): ChecklistProgress {
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

export function phaseProgress(
  state: MoveChecklistState,
  phaseKey: MoveChecklistPhaseKey,
): ChecklistProgress {
  const phase = MOVE_CHECKLIST_PHASES.find((candidate) => candidate.key === phaseKey);
  if (!phase) return progressOf(0, 0);
  const done = phase.items.filter((item) => state.items[item.key]?.done).length;
  return progressOf(done, phase.items.length);
}

export function checklistProgress(state: MoveChecklistState): ChecklistProgress {
  const done = MOVE_CHECKLIST_ITEMS.filter((key) => state.items[key]?.done).length;
  return progressOf(done, MOVE_CHECKLIST_ITEMS.length);
}

export function completedPhases(state: MoveChecklistState): MoveChecklistPhaseKey[] {
  return MOVE_CHECKLIST_PHASES.filter((phase) => {
    const progress = phaseProgress(state, phase.key);
    return progress.total > 0 && progress.done === progress.total;
  }).map((phase) => phase.key);
}

/** The first checklist phase still blocking a milestone, or null when it can be signed. */
export function milestoneBlocker(
  state: MoveChecklistState,
  milestone: MilestoneKey,
): MoveChecklistPhase {
  for (const key of MILESTONE_REQUIREMENTS[milestone]) {
    const phase = MOVE_CHECKLIST_PHASES.find((candidate) => candidate.key === key);
    if (!phase) continue;
    const progress = phaseProgress(state, phase.key);
    if (progress.done < progress.total) return phase;
  }
  return MOVE_CHECKLIST_PHASES[MOVE_CHECKLIST_PHASES.length - 1];
}

export function milestoneUnlocked(state: MoveChecklistState, milestone: MilestoneKey): boolean {
  return MILESTONE_REQUIREMENTS[milestone].every((key) => {
    const progress = phaseProgress(state, key);
    return progress.total > 0 && progress.done === progress.total;
  });
}

export function checklistSummaryLine(state: MoveChecklistState): string {
  const progress = checklistProgress(state);
  return `${progress.done}/${progress.total} items · ${progress.percent}%`;
}
