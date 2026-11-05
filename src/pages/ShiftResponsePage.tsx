import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readShift, type PublicShift } from "@/lib/shift.functions";
import { dayLabel, timeLabel } from "@shared/schedule";
import { declineReasonLabel, type DeclineReason } from "@shared/shift";
import "@/workspace.css";
import "./shift-response.css";

const postJson = async (url: string, body: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data["error"] ?? "Something went wrong"));
  return data;
};

const formatWhen = (iso: string) => new Date(iso).toLocaleString();

/**
 * Public crew shift portal: one assigned move, its report time, addresses, truck and crew
 * lead, with mobile-first accept and decline controls.
 */
export default function ShiftResponsePage({ token }: { token?: string }) {
  const [shift, setShift] = useState<PublicShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<DeclineReason | "">("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setShift(await readShift({ data: { token: token ?? "" } }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "This shift link is unavailable or has expired.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (response: "accept" | "decline") => {
    if (response === "decline" && !reason) {
      setError("Choose a reason for declining this shift.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postJson(`/api/shift/${token}/respond`, {
        response,
        ...(response === "decline" ? { reason, note } : {}),
      });
      setDeclining(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !shift)
    return (
      <main className="shift-page">
        <div className="shift-card shift-card--center">
          <Loader2 className="shift-spin" size={22} />
          <p>Loading your shift…</p>
        </div>
      </main>
    );

  if (!shift)
    return (
      <main className="shift-page">
        <div className="shift-card shift-card--center">
          <CircleAlert size={24} />
          <h1>This shift link is unavailable</h1>
          <p>{error || "Ask dispatch for a new shift confirmation link."}</p>
        </div>
      </main>
    );

  const pending = shift.status === "pending";
  const when = `${dayLabel(shift.moveDate, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })} · ${timeLabel(shift.startHour)}`;
  const truck = shift.truck || "Truck assigned by dispatch";

  return (
    <main className="shift-page">
      <div className="shift-card">
        <header className="shift-head">
          <p className="shift-company">{shift.company.name}</p>
          <h1>Hi {shift.crewName || "there"}, confirm your shift</h1>
          <p className="shift-sub">
            {shift.reference} · {shift.role}
          </p>
        </header>

        {shift.status === "confirmed" && (
          <div className="shift-banner is-confirmed" role="status">
            <CheckCircle2 size={18} />
            <div>
              <b>Shift confirmed</b>
              <small>
                {shift.respondedAt ? `Answered ${formatWhen(shift.respondedAt)}` : ""} Dispatch can
                see you are available.
              </small>
            </div>
          </div>
        )}
        {shift.status === "declined" && (
          <div className="shift-banner is-declined" role="status">
            <XCircle size={18} />
            <div>
              <b>Shift declined</b>
              <small>
                {shift.declinedReason || declineReasonLabel(reason) || "Declined"}
                {shift.respondedAt ? ` · ${formatWhen(shift.respondedAt)}` : ""} Dispatch has been
                notified and will find cover.
              </small>
            </div>
          </div>
        )}

        <section className="shift-details" aria-label="Shift details">
          <div>
            <CalendarDays size={16} />
            <span>
              <small>Date and report time</small>
              <b>{when}</b>
            </span>
          </div>
          <div>
            <Clock3 size={16} />
            <span>
              <small>Job role</small>
              <b>{shift.role}</b>
            </span>
          </div>
          <div>
            <MapPin size={16} />
            <span>
              <small>Pickup</small>
              <b>{shift.origin || "Address shared by dispatch"}</b>
            </span>
          </div>
          <div>
            <MapPin size={16} />
            <span>
              <small>Drop-off</small>
              <b>{shift.destination || "Address shared by dispatch"}</b>
            </span>
          </div>
          <div>
            <Truck size={16} />
            <span>
              <small>Assigned truck</small>
              <b>{truck}</b>
            </span>
          </div>
          <div>
            <UserRound size={16} />
            <span>
              <small>Crew lead</small>
              <b>{shift.crewLead.name || "Dispatch"}</b>
              {shift.crewLead.phone && (
                <a href={`tel:${shift.crewLead.phone}`}>
                  <Phone size={13} /> {shift.crewLead.phone}
                </a>
              )}
              {shift.crewLead.email && (
                <a href={`mailto:${shift.crewLead.email}`}>
                  <Mail size={13} /> {shift.crewLead.email}
                </a>
              )}
            </span>
          </div>
        </section>

        {error && (
          <p className="shift-alert" role="alert">
            <CircleAlert size={15} /> {error}
          </p>
        )}

        {pending && !declining && (
          <div className="shift-actions">
            <Button className="shift-accept" disabled={busy} onClick={() => void respond("accept")}>
              {busy ? <Loader2 size={17} className="shift-spin" /> : <CheckCircle2 size={17} />}
              Accept shift
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setDeclining(true)}>
              <XCircle size={17} /> Decline shift
            </Button>
          </div>
        )}

        {pending && declining && (
          <section className="shift-decline" aria-label="Decline this shift">
            <h2>Why can&apos;t you work this shift?</h2>
            <div className="shift-reasons" role="radiogroup" aria-label="Decline reason">
              {shift.reasons.map((option) => (
                <label key={option.value} className={reason === option.value ? "is-active" : ""}>
                  <input
                    type="radio"
                    name="decline-reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value as DeclineReason)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <label className="shift-note">
              <span>Anything dispatch should know? (optional)</span>
              <textarea
                value={note}
                maxLength={300}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Share a short note with the office"
              />
            </label>
            <div className="shift-actions">
              <Button
                variant="destructive"
                disabled={busy || !reason}
                onClick={() => void respond("decline")}
              >
                {busy ? <Loader2 size={17} className="shift-spin" /> : <XCircle size={17} />}
                Confirm decline
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setDeclining(false)}>
                Keep my shift
              </Button>
            </div>
          </section>
        )}

        {!pending && (
          <p className="shift-help">
            Need to change your answer? Call{" "}
            {shift.company.phone ? (
              <a href={`tel:${shift.company.phone}`}>{shift.company.phone}</a>
            ) : (
              "dispatch"
            )}
            {shift.company.email ? (
              <>
                {" "}
                or email <a href={`mailto:${shift.company.email}`}>{shift.company.email}</a>.
              </>
            ) : (
              "."
            )}
          </p>
        )}

        <footer className="shift-foot">
          <span>{shift.company.name}</span>
          <span>{shift.reference}</span>
        </footer>
      </div>
    </main>
  );
}
