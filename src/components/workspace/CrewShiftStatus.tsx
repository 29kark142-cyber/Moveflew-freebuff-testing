import { useState } from "react";
import { BadgeCheck, CircleAlert, Clock3, Send, XCircle } from "lucide-react";
import type { Job, WorkspaceRole } from "@shared/crm";
import { declineReasonLabel, jobCrewShifts, shiftCounts, shiftStatusLabel } from "@shared/shift";
import { crm } from "@/lib/crm";

const DISPATCH_ROLES: WorkspaceRole[] = ["admin", "office_admin", "dispatcher"];

/**
 * Dispatcher view of crew shift answers: who confirmed, who is still pending, who declined
 * and why, plus the action that mints fresh confirmation links for the assigned crew.
 */
export default function CrewShiftStatus({
  job,
  role,
  onRefresh,
}: {
  job: Job;
  role: WorkspaceRole;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const shifts = jobCrewShifts(job.crewShifts, job.crewIds);
  const counts = shiftCounts(shifts);
  const canSend = DISPATCH_ROLES.includes(role);

  const send = async () => {
    setBusy(true);
    setError("");
    setSent("");
    try {
      const saved = await crm.dispatchShifts(job.id);
      const invite = saved.shiftInvites;
      setSent(
        invite && invite.notified > 0
          ? `${invite.notified} shift confirmation link(s) sent`
          : invite && invite.logged > 0
            ? "Shift links logged — no SMS/email sender is configured"
            : "Shift confirmations prepared",
      );
      onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send shift confirmations.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ws-card ws-card-pad" aria-labelledby="crew-shifts-title">
      <div className="ws-card-title">
        <div>
          <h2 id="crew-shifts-title">Crew shift confirmations</h2>
          <p>Each assigned crew member answers through their own private shift link.</p>
        </div>
        {canSend && (
          <button
            type="button"
            className="ws-btn"
            disabled={busy || !job.crewIds.length}
            onClick={() => void send()}
          >
            {busy ? <Clock3 size={14} /> : <Send size={14} />} Send shift confirmations
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-1 tabular-nums">
          {counts.confirmed} confirmed
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 tabular-nums">
          {counts.pending} pending
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 tabular-nums ${
            counts.declined ? "border-destructive/40 text-destructive" : "border-border"
          }`}
        >
          {counts.declined} declined
        </span>
      </div>

      {shifts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No shift links yet. Assign crew, then send confirmations so dispatchers know who is
          coming.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {shifts.map((shift) => (
            <li
              key={shift.token}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <span className="flex items-center gap-2">
                {shift.status === "confirmed" ? (
                  <BadgeCheck size={16} className="text-primary" />
                ) : shift.status === "declined" ? (
                  <XCircle size={16} className="text-destructive" />
                ) : (
                  <Clock3 size={16} className="text-muted-foreground" />
                )}
                <b className="font-medium text-foreground">
                  {shift.name || `Crew #${shift.crewId}`}
                </b>
                <small className="text-muted-foreground">{shift.role}</small>
              </span>
              <span className="text-xs text-muted-foreground">
                {shiftStatusLabel(shift.status)}
                {shift.reason ? ` · ${declineReasonLabel(shift.reason)}` : ""}
                {shift.respondedAt ? ` · ${new Date(shift.respondedAt).toLocaleString()}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <CircleAlert size={15} /> {error}
        </p>
      )}
      {sent && <p className="mt-3 text-sm text-muted-foreground">{sent}</p>}
      {!job.crewIds.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          Assign at least one crew member before sending shift confirmations.
        </p>
      )}
    </section>
  );
}
