import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, MapPin, PenLine, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import SignaturePad from "@/components/workspace/SignaturePad";
import { crmFetch } from "@/lib/crm";
import type { FieldOperation, FieldScope } from "@/lib/field-offline";
import type { JobActivityEvent } from "@shared/job-activity";
import {
  MILESTONE_LABELS,
  MOVE_CHECKLIST_PHASES,
  checklistProgress,
  isChecklistItem,
  milestoneBlocker,
  milestoneUnlocked,
  normalizeChecklist,
  phaseProgress,
  setChecklistItem,
  type MilestoneKey,
  type MilestoneSignoff,
  type MoveChecklistState,
} from "@shared/move-checklist";

type Saved = { moveChecklist: MoveChecklistState; activity?: JobActivityEvent[] };

type Props = {
  jobId: number;
  saved: unknown;
  locked: boolean;
  crewName: string;
  crewId: number | null;
  scope: FieldScope;
  queue: (
    jobId: number,
    action: FieldOperation["action"],
    body: Record<string, unknown>,
  ) => Promise<void>;
  onSaved: (patch: Saved) => void;
};

const json = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

/** Device location is optional: a denied or slow fix never blocks a signature. */
const readGeo = () =>
  new Promise<MilestoneSignoff["geo"]>((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (value: MilestoneSignoff["geo"]) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        done({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy),
        }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 },
    );
  });

export default function MoveChecklist({
  jobId,
  saved,
  locked,
  crewName,
  crewId,
  queue,
  onSaved,
}: Props) {
  const state = useMemo(() => normalizeChecklist(saved), [saved]);
  const [busy, setBusy] = useState(false);
  const progress = checklistProgress(state);

  const toggle = async (item: string, done: boolean) => {
    if (locked || busy || !isChecklistItem(item)) return;
    setBusy(true);
    const at = new Date().toISOString();
    const body = { item, done, at, operationId: crypto.randomUUID() };
    const optimistic = setChecklistItem(state, item, {
      done,
      at: done ? at : null,
      crewId,
      byName: crewName,
    });
    try {
      try {
        const updated = await crmFetch<{ moveChecklist?: unknown; activity?: JobActivityEvent[] }>(
          `/field/jobs/${jobId}/checklist`,
          json(body),
        );
        onSaved({
          moveChecklist: normalizeChecklist(updated.moveChecklist),
          ...(updated.activity ? { activity: updated.activity } : {}),
        });
      } catch (reason) {
        if (navigator.onLine && !(reason instanceof TypeError)) throw reason;
        await queue(jobId, "checklist", body);
        onSaved({ moveChecklist: optimistic });
        toast("Checklist saved on this phone — it will sync when you're back online.");
      }
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save that checklist item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <header className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold text-card-foreground">
          <ClipboardCheck className="h-4 w-4" /> Move-day checklist
        </h2>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.done} of {progress.total} complete
              {crewName ? ` · ${crewName}` : ""}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{progress.percent}%</span>
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
        </div>
      </header>

      {MOVE_CHECKLIST_PHASES.map((phase) => {
        const own = phaseProgress(state, phase.key);
        return (
          <fieldset
            key={phase.key}
            className="space-y-2 rounded-xl border border-border p-3"
            disabled={locked || busy}
          >
            <legend className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold text-foreground">
              <span>{phase.label}</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {own.done}/{own.total}
              </span>
            </legend>
            <ul className="space-y-1">
              {phase.items.map((item) => {
                const entry = state.items[item.key];
                return (
                  <li key={item.key}>
                    <label className="flex min-h-11 items-start gap-2 rounded-lg px-1 py-1 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={Boolean(entry?.done)}
                        onChange={(event) => void toggle(item.key, event.target.checked)}
                      />
                      <span className="min-w-0">
                        <span
                          className={
                            entry?.done ? "font-medium text-foreground" : "text-muted-foreground"
                          }
                        >
                          {item.label}
                        </span>
                        {entry?.done && (
                          <span className="block text-xs text-muted-foreground">
                            {entry.at
                              ? new Date(entry.at).toLocaleString(undefined, {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "Time not recorded"}
                            {entry.byName ? ` · ${entry.byName}` : ""}
                            {entry.crewId ? ` · crew #${entry.crewId}` : ""}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <PenLine className="h-4 w-4" /> Digital sign-off
        </h3>
        {(["origin", "final"] as const).map((milestone) => (
          <MilestoneSignature
            key={milestone}
            jobId={jobId}
            milestone={milestone}
            state={state}
            locked={locked}
            crewName={crewName}
            queue={queue}
            onSaved={onSaved}
          />
        ))}
        <p className="text-xs text-muted-foreground">
          The origin signature unlocks after phases 1–2, the final one after all four phases. Signed
          milestones are locked into the job record with their timestamp.
        </p>
      </div>
    </section>
  );
}

function MilestoneSignature({
  jobId,
  milestone,
  state,
  locked,
  crewName,
  queue,
  onSaved,
}: {
  jobId: number;
  milestone: MilestoneKey;
  state: MoveChecklistState;
  locked: boolean;
  crewName: string;
  queue: Props["queue"];
  onSaved: Props["onSaved"];
}) {
  const signoff = state.signoffs[milestone];
  const unlocked = milestoneUnlocked(state, milestone);
  const blocker = milestoneBlocker(state, milestone);
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [crewSignature, setCrewSignature] = useState<string | null>(null);
  const [attachLocation, setAttachLocation] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!customerSignature || !crewSignature || busy) return;
    setBusy(true);
    const geo = attachLocation ? await readGeo() : null;
    const body = {
      milestone,
      customerSignature,
      crewSignature,
      crewName,
      geo,
      operationId: crypto.randomUUID(),
    };
    const optimistic: MoveChecklistState = {
      ...state,
      signoffs: {
        ...state.signoffs,
        [milestone]: {
          customerSignature,
          crewSignature,
          signedAt: new Date().toISOString(),
          crewName,
          geo,
          byUserId: "",
        },
      },
    };
    try {
      try {
        const updated = await crmFetch<{ moveChecklist?: unknown; activity?: JobActivityEvent[] }>(
          `/field/jobs/${jobId}/milestone-signoff`,
          json(body),
        );
        onSaved({
          moveChecklist: normalizeChecklist(updated.moveChecklist),
          ...(updated.activity ? { activity: updated.activity } : {}),
        });
        toast.success(`${MILESTONE_LABELS[milestone]} saved`);
      } catch (reason) {
        if (navigator.onLine && !(reason instanceof TypeError)) throw reason;
        await queue(jobId, "milestone-signoff", body);
        onSaved({ moveChecklist: optimistic });
        toast("Signature saved on this phone — it will sync when you're back online.");
      }
      setOpen(false);
      setCustomerSignature(null);
      setCrewSignature(null);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not save this sign-off");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{MILESTONE_LABELS[milestone]}</p>
          <p className="text-xs text-muted-foreground">
            {signoff
              ? `Signed ${new Date(signoff.signedAt).toLocaleString()}${signoff.crewName ? ` · ${signoff.crewName}` : ""}`
              : unlocked
                ? "Ready for the customer and crew lead to sign."
                : `Finish ${blocker.label} first.`}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
            signoff
              ? "bg-primary text-primary-foreground"
              : unlocked
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {signoff ? "Signed" : unlocked ? "Ready" : "Locked"}
        </span>
      </div>

      {signoff ? (
        <div className="space-y-1">
          <div className="flex gap-2">
            <figure className="min-w-0 flex-1">
              <img
                src={signoff.customerSignature}
                alt="Customer signature"
                className="h-16 w-full rounded-md border border-border bg-background object-contain"
              />
              <figcaption className="text-xs text-muted-foreground">Customer</figcaption>
            </figure>
            <figure className="min-w-0 flex-1">
              <img
                src={signoff.crewSignature}
                alt="Crew lead signature"
                className="h-16 w-full rounded-md border border-border bg-background object-contain"
              />
              <figcaption className="text-xs text-muted-foreground">
                Crew lead{signoff.crewName ? ` · ${signoff.crewName}` : ""}
              </figcaption>
            </figure>
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {signoff.geo
              ? `Location ${signoff.geo.lat.toFixed(5)}, ${signoff.geo.lng.toFixed(5)}${
                  typeof signoff.geo.accuracy === "number"
                    ? ` (±${Math.round(signoff.geo.accuracy)} m)`
                    : ""
                }`
              : "No location recorded"}
          </p>
        </div>
      ) : locked ? (
        <p className="text-xs text-muted-foreground">
          <TriangleAlert className="mr-1 inline h-3 w-3" /> The job is signed off, so this milestone
          can no longer be captured.
        </p>
      ) : !unlocked ? (
        <p className="text-xs text-muted-foreground">
          <CheckCircle2 className="mr-1 inline h-3 w-3" /> Checklist items are still open for this
          milestone.
        </p>
      ) : !open ? (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => setOpen(true)}
          disabled={busy}
        >
          <PenLine className="h-4 w-4" /> Capture signatures
        </Button>
      ) : (
        <div className="space-y-2">
          <SignaturePad onChange={setCustomerSignature} label="Customer signs here" />
          <SignaturePad
            onChange={setCrewSignature}
            label={`Crew lead${crewName ? ` (${crewName})` : ""} signs here`}
          />
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={attachLocation}
              onChange={(event) => setAttachLocation(event.target.checked)}
            />
            Attach this device's location (optional)
          </label>
          <Button
            className="min-h-12 w-full"
            disabled={!customerSignature || !crewSignature || busy}
            onClick={() => void save()}
          >
            <CheckCircle2 className="h-4 w-4" />
            {busy ? "Saving…" : `Save ${MILESTONE_LABELS[milestone]}`}
          </Button>
        </div>
      )}
    </div>
  );
}
