export type CopilotMode = "open" | "minimized" | "closed";

export const COPILOT_MODE_KEY = "nwcrewcrm.copilot.mode";
export const COPILOT_RESTORE_EVENT = "nwcrewcrm:copilot-restore";

const MODES: CopilotMode[] = ["open", "minimized", "closed"];

export function parseCopilotMode(value: string | null): CopilotMode | null {
  return MODES.includes(value as CopilotMode) ? (value as CopilotMode) : null;
}

export function readCopilotMode(): CopilotMode | null {
  if (typeof window === "undefined") return null;
  try {
    return parseCopilotMode(window.localStorage.getItem(COPILOT_MODE_KEY));
  } catch {
    return null;
  }
}

export function saveCopilotMode(mode: CopilotMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COPILOT_MODE_KEY, mode);
  } catch {
    /* Storage can be blocked; the in-memory state still works for this visit. */
  }
}

/** Re-open the assistant from another surface, such as the Help center. */
export function requestCopilotRestore(): void {
  saveCopilotMode("open");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COPILOT_RESTORE_EVENT));
  }
}
