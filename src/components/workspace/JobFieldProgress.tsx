import { useEffect, useRef } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw } from "lucide-react";
import type { Job } from "@shared/crm";
import { jobActivity } from "@shared/job-activity";
import {
  MILESTONE_LABELS,
  MOVE_CHECKLIST_PHASES,
  checklistProgress,
  normalizeChecklist,
  phaseProgress,
} from "@shared/move-checklist";

type Props = { job: Job; onRefresh: () => void };

/**
 * Dispatcher view of the crew's move-day checklist. The job sheet polls the job so office
 * staff see field progress and sign-offs without reloading the page.
 */
export default function JobFieldProgress({ job, onRefresh }: Props) {
  const state = normalizeChecklist(job.moveChecklist);
  const progress = checklistProgress(state);
  const events = jobActivity(job.activity);
  const refreshRef = useRef(onRefresh);
  const lastActivity = events[0]?.at;

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) refreshRef.current();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="ws-card ws-card-pad" aria-labelledby="job-field-progress-title">
      <div className="ws-card-title">
        <div>
          <h2 id="job-field-progress-title">Move-day progress</h2>
          <p>Live checklist, sign-offs, and activity reported from the crew app.</p>
        </div>
        <button type="button" className="ws-btn" onClick={onRefresh}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <ClipboardCheck size={15} /> Checklist
          </span>
          <span className="tabular-nums text-muted-foreground">
            {progress.done}/{progress.total} · {progress.percent}%
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Move-day checklist completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progress.percent}%`, transition: "width 240ms ease" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {lastActivity
            ? `Last field activity ${new Date(lastActivity).toLocaleString()}`
            : "Waiting for the crew to open the checklist."}
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {MOVE_CHECKLIST_PHASES.map((phase) => {
          const own = phaseProgress(state, phase.key);
          const complete = own.total > 0 && own.done === own.total;
          return (
            <div
              key={phase.key}
              className={`rounded-xl border p-3 ${complete ? "border-primary/40" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span
                  className={complete ? "font-medium text-foreground" : "text-muted-foreground"}
                >
                  {complete && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                  {phase.label}
                </span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {own.done}/{own.total}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(["origin", "final"] as const).map((milestone) => {
          const signoff = state.signoffs[milestone];
          return (
            <div key={milestone} className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium text-foreground">{MILESTONE_LABELS[milestone]}</p>
              {signoff ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {new Date(signoff.signedAt).toLocaleString()}
                    {signoff.crewName ? ` · ${signoff.crewName}` : ""}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <img
                      src={signoff.customerSignature}
                      alt="Customer signature"
                      className="h-14 w-1/2 rounded-md border border-border bg-background object-contain"
                    />
                    <img
                      src={signoff.crewSignature}
                      alt="Crew lead signature"
                      className="h-14 w-1/2 rounded-md border border-border bg-background object-contain"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {signoff.geo
                      ? `Location ${signoff.geo.lat.toFixed(4)}, ${signoff.geo.lng.toFixed(4)}`
                      : "No location recorded"}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Not signed yet.</p>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="mt-4 text-sm font-semibold text-foreground">Activity timeline</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No field activity yet.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-foreground">
                  <b>{event.title}</b>
                  {event.detail ? ` · ${event.detail}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.at).toLocaleString()}
                  {event.by ? ` · ${event.by}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
