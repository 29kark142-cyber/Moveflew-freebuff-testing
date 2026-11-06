import { AlertTriangle, CalendarClock, CircleAlert, Navigation, Truck } from "lucide-react";
import type { Job } from "@shared/crm";
import { operationsAlerts, type OpsAlert } from "@shared/ops-alerts";

const ICON = {
  decline: CircleAlert,
  unassigned: Truck,
  deposit: CalendarClock,
  milestone: Navigation,
} as const;

const TONE: Record<OpsAlert["severity"], string> = {
  critical: "text-destructive",
  warning: "text-foreground",
  info: "text-muted-foreground",
};

const when = (alert: OpsAlert): string => {
  const date = new Date(alert.at);
  if (!Number.isFinite(date.getTime())) return "";
  return alert.kind === "milestone"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
};

/**
 * Live operations control panel. Everything shown is derived from the workspace jobs the
 * dispatcher can already open; each row navigates straight to the flagged job sheet.
 */
export default function OpsAlertCenter({
  jobs,
  navigate,
}: {
  jobs: Job[];
  navigate: (path: string) => void;
}) {
  const feed = operationsAlerts(jobs);
  const cards = [
    { kind: "unassigned" as const, label: "Unassigned", value: feed.counts.unassigned },
    { kind: "deposit" as const, label: "Deposits due", value: feed.counts.deposit },
    { kind: "decline" as const, label: "Declined shifts", value: feed.counts.decline },
    { kind: "milestone" as const, label: "Live milestones", value: feed.counts.milestone },
  ];

  return (
    <section
      className="ws-card ws-card-pad"
      data-tour="ops-alerts"
      aria-labelledby="ops-alerts-title"
    >
      <div className="ws-card-title">
        <div>
          <h2 id="ops-alerts-title">Operations alerts</h2>
          <p>Unassigned moves, deposits still due, declined crew shifts and live driver updates.</p>
        </div>
        <button className="ws-btn" onClick={() => navigate("/app/schedule")}>
          Dispatch board
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          marginBottom: 12,
        }}
      >
        {cards.map((card) => (
          <div key={card.kind} className="rounded-xl border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p
              className={`text-2xl font-semibold tabular-nums ${card.value ? "" : "text-muted-foreground"}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {feed.items.length ? (
        <div className="ws-list">
          {feed.items.slice(0, 8).map((alert) => {
            const Icon = ICON[alert.kind];
            return (
              <button
                key={alert.id}
                className="ws-list-row ws-list-button"
                onClick={() => navigate(alert.href)}
              >
                <Icon size={16} className={TONE[alert.severity]} aria-hidden />
                <span className="ws-list-row__primary">
                  <b>{alert.title}</b>
                  <small>{alert.detail}</small>
                </span>
                <span className="text-xs text-muted-foreground">{when(alert)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="ws-helper flex items-center gap-2">
          <AlertTriangle size={14} />
          All clear — every upcoming move is assigned, quoted and confirmed.
        </p>
      )}

      {feed.items.length > 8 && (
        <p className="ws-helper">Showing the first 8 of {feed.items.length} alerts.</p>
      )}
    </section>
  );
}
