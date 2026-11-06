// Dashboard operations alerts: one pure feed for unassigned moves, deposits still due,
// declined crew shifts and live driver milestones. The dashboard renders it, tests pin it.
import type { Job } from "./crm";
import { declinedCrewNames } from "./shift";

export type OpsAlertKind = "decline" | "unassigned" | "deposit" | "milestone";
export type OpsAlertSeverity = "critical" | "warning" | "info";

export type OpsAlert = {
  id: string;
  kind: OpsAlertKind;
  jobId: number;
  title: string;
  detail: string;
  at: string;
  severity: OpsAlertSeverity;
  href: string;
};

export type OpsAlertCounts = Record<OpsAlertKind, number>;

export type OpsAlertFeed = {
  items: OpsAlert[];
  counts: OpsAlertCounts;
  total: number;
};

const ACTIVE = new Set(["booked", "deposit_paid", "scheduled", "in_progress"]);
const CLOSED = /complete|cancel|declin|lost|archiv/i;
const RANK: Record<OpsAlertKind, number> = { decline: 0, unassigned: 1, deposit: 2, milestone: 3 };
const DAY = 86_400_000;

const dayKey = (value: unknown): string => (typeof value === "string" ? value.slice(0, 10) : "");
const localKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Actionable alerts for the operations dashboard, newest move day first within each kind. */
export function operationsAlerts(jobs: Job[], now = new Date()): OpsAlertFeed {
  const today = localKey(now);
  const items: OpsAlert[] = [];

  for (const job of jobs) {
    const raw = job as unknown as Record<string, unknown>;
    const status = String(job.status ?? "").toLowerCase();
    if (CLOSED.test(status) || status === "estimate") continue;
    const moveDate = dayKey(job.moveDate);
    const title =
      String(job.title ?? "").trim() || String(job.customerName ?? "").trim() || `Job #${job.id}`;

    if (ACTIVE.has(status) && moveDate >= today) {
      const crew = Array.isArray(job.crewIds) ? job.crewIds : [];
      const missingCrew = crew.length === 0;
      const missingTruck = job.truckId === null || job.truckId === undefined;
      if (missingCrew || missingTruck) {
        const parts = [missingCrew ? "crew" : "", missingTruck ? "truck" : ""].filter(Boolean);
        items.push({
          id: `unassigned:${job.id}`,
          kind: "unassigned",
          jobId: job.id,
          title:
            missingCrew && missingTruck
              ? "Crew & truck unassigned"
              : missingCrew
                ? "Crew unassigned"
                : "Truck unassigned",
          detail: `${title} · ${moveDate || "date to confirm"} · ${parts.join(" & ")} needed`,
          at: moveDate,
          severity:
            moveDate <= localKey(new Date(now.getTime() + 2 * DAY)) ? "critical" : "warning",
          href: `/app/jobs/${job.id}`,
        });
      }
    }

    const quoted = dayKey(raw["quoteSentAt"]);
    const depositPaid = Number(raw["depositPaidCents"]) > 0 || Boolean(raw["quoteAcceptance"]);
    if (quoted && !depositPaid && status !== "in_progress" && ACTIVE.has(status)) {
      items.push({
        id: `deposit:${job.id}`,
        kind: "deposit",
        jobId: job.id,
        title: "Deposit pending",
        detail: `${title} · quote sent ${quoted}`,
        at: quoted,
        severity: moveDate && moveDate <= today ? "critical" : "warning",
        href: `/app/jobs/${job.id}`,
      });
    }

    const declined = declinedCrewNames(job.crewShifts);
    if (declined.length) {
      items.push({
        id: `decline:${job.id}`,
        kind: "decline",
        jobId: job.id,
        title: "Crew shift declined",
        detail: `${title} · ${declined.join(", ")}`,
        at: moveDate,
        severity: "critical",
        href: `/app/jobs/${job.id}`,
      });
    }

    const location = job.driverLocation;
    if (location && status !== "completed") {
      const at = Date.parse(location.at);
      if (Number.isFinite(at) && now.getTime() - at <= 12 * 3_600_000) {
        items.push({
          id: `milestone:${job.id}:${location.milestone}`,
          kind: "milestone",
          jobId: job.id,
          title: location.label || "Driver check-in",
          detail: `${title} · ${location.crewName || "Crew"}`,
          at: new Date(at).toISOString(),
          severity: "info",
          href: `/app/jobs/${job.id}`,
        });
      }
    }
  }

  items.sort(
    (a, b) => RANK[a.kind] - RANK[b.kind] || a.at.localeCompare(b.at) || a.jobId - b.jobId,
  );
  const counts: OpsAlertCounts = { decline: 0, unassigned: 0, deposit: 0, milestone: 0 };
  for (const item of items) counts[item.kind] += 1;
  return { items, counts, total: items.length };
}
