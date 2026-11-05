// Job activity timeline: the server appends field events (completed checklist phases, customer
// sign-offs) and the office job sheet renders them newest first.

export type JobActivityKind =
  "phase_completed" | "origin_signoff" | "final_signoff" | "quote_sent" | "deposit_paid";

export type JobActivityEvent = {
  /** Stable id, so an offline replay of the same operation never duplicates an event. */
  id: string;
  kind: JobActivityKind;
  title: string;
  detail: string;
  at: string;
  by: string;
};

export const JOB_ACTIVITY_LIMIT = 100;

export function jobActivity(value: unknown): JobActivityEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .filter(
      (entry) =>
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.at === "string",
    )
    .map((entry) => ({
      id: String(entry.id),
      kind: entry.kind as JobActivityKind,
      title: String(entry.title),
      detail: typeof entry.detail === "string" ? entry.detail : "",
      at: String(entry.at),
      by: typeof entry.by === "string" ? entry.by : "",
    }))
    .slice(0, JOB_ACTIVITY_LIMIT);
}

/** Newest first, deduped by id, capped so the job record cannot grow without bound. */
export function appendJobActivity(
  existing: unknown,
  events: readonly JobActivityEvent[],
): JobActivityEvent[] {
  const current = jobActivity(existing);
  const known = new Set(current.map((entry) => entry.id));
  const fresh = events.filter((event) => !known.has(event.id));
  if (!fresh.length) return current;
  return [...fresh, ...current].slice(0, JOB_ACTIVITY_LIMIT);
}
