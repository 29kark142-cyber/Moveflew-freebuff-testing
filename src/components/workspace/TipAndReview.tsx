import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, DollarSign, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";
import {
  formatCents,
  MAX_TIP_CENTS,
  TIP_PRESETS,
  tipSummary,
  validTipCents,
  type TipRecord,
} from "@shared/tipping";
import type { FieldOperation } from "@/lib/field-offline";

type TipJob = Record<string, unknown> & {
  id: number;
  completedSignature?: string | null;
  tip?: TipRecord | null;
  reviewRequestedAt?: string | null;
  reviewUrl?: string | null;
};

const post = <T,>(path: string, body: unknown = {}) =>
  crmFetch<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const isOffline = (error: unknown) => !navigator.onLine || error instanceof TypeError;

/**
 * Shown once the customer signs the eBOL: the tip step, then the Google review offer.
 * Both outcomes are recorded on the job so the field phone never asks twice.
 */
export default function TipAndReview({
  job,
  onChange,
  queue,
}: {
  job: TipJob;
  onChange: (job: TipJob) => void;
  queue: (
    jobId: number,
    action: FieldOperation["action"],
    body: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewUrl, setReviewUrl] = useState(job.reviewUrl ?? "");
  const [reviewNote, setReviewNote] = useState("");
  const [dismissed, setDismissed] = useState(false);

  const signed = Boolean(job.completedSignature);
  const tip = job.tip ?? null;
  const needsReview = signed && Boolean(tip) && !job.reviewRequestedAt && !dismissed;

  const loadReview = useCallback(async () => {
    try {
      const result = await post<{ url: string; alreadyRequested: boolean }>(
        `/field/jobs/${job.id}/review`,
        {},
      );
      setReviewUrl(result.url);
      setReviewNote("");
      onChange({ ...job, reviewRequestedAt: new Date().toISOString(), reviewUrl: result.url });
    } catch (reason) {
      setReviewNote(reason instanceof Error ? reason.message : "Review link unavailable");
    }
    // The job object is replaced by onChange; only re-run when the job identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, signed, Boolean(tip), Boolean(job.reviewRequestedAt)]);

  useEffect(() => {
    if (!needsReview) return;
    void loadReview();
  }, [needsReview, loadReview]);

  if (!signed) return null;

  const customCents = custom.trim() ? validTipCents(Math.round(Number(custom) * 100)) : null;
  const amount = custom.trim() ? customCents : choice;

  const record = async (cents: number) => {
    setBusy(true);
    try {
      const body = { cents, operationId: crypto.randomUUID() };
      try {
        onChange(await post<TipJob>(`/field/jobs/${job.id}/tip`, body));
        toast.success(cents > 0 ? `Tip of ${formatCents(cents)} recorded` : "No tip recorded");
      } catch (error) {
        if (!isOffline(error)) throw error;
        await queue(job.id, "tip", body);
        onChange({
          ...job,
          tip: {
            cents,
            method: cents > 0 ? "card" : "none",
            at: new Date().toISOString(),
            by: "this device",
            allocation: [],
          },
        });
        toast("Tip saved on this phone — it will sync when you're back online.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the tip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-card-foreground">
          <DollarSign className="h-4 w-4" /> Crew tip
        </h2>
        <p className="text-sm text-muted-foreground">
          {tip
            ? tipSummary(tip)
            : "The crew is paid for the hours on this job. A tip is optional and goes straight to the people on the truck."}
        </p>
      </div>

      {tip ? (
        <div className="space-y-2">
          {tip.allocation.length > 0 && (
            <ul className="space-y-1 text-sm text-foreground">
              {tip.allocation.map((line) => (
                <li key={`${line.crewId ?? line.name}`} className="flex justify-between">
                  <span>{line.name}</span>
                  <span className="tabular-nums">{formatCents(line.cents)}</span>
                </li>
              ))}
            </ul>
          )}
          {tip.cents > 0 && !job.reviewRequestedAt && (
            <p className="text-xs text-muted-foreground">
              Recorded{" "}
              {new Date(tip.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {TIP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={choice === preset && !custom.trim()}
                onClick={() => {
                  setChoice(preset);
                  setCustom("");
                }}
                className={`min-h-12 rounded-xl border font-semibold ${
                  choice === preset && !custom.trim()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-foreground"
                }`}
              >
                {formatCents(preset)}
              </button>
            ))}
            <label className="col-span-2 flex min-h-12 items-center gap-2 rounded-xl border border-border bg-background px-3">
              <span className="text-sm font-medium text-foreground">Custom</span>
              <input
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                inputMode="decimal"
                placeholder="25"
                aria-label="Custom tip in dollars"
                className="min-w-0 flex-1 bg-transparent text-right text-base text-foreground outline-none"
              />
            </label>
          </div>
          {custom.trim() && customCents === null && (
            <p className="text-sm text-destructive">
              Enter an amount between $0.01 and {formatCents(MAX_TIP_CENTS)}.
            </p>
          )}
          <div className="grid gap-2">
            <Button
              className="min-h-12 w-full"
              disabled={busy || amount === null || amount === undefined}
              onClick={() => void record(amount ?? 0)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {amount ? `Add ${formatCents(amount)} tip` : "Add tip"}
            </Button>
            <Button
              variant="outline"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => void record(0)}
            >
              No tip
            </Button>
          </div>
        </>
      )}

      {needsReview && (
        <div className="space-y-2 rounded-xl border border-border bg-background p-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Star className="h-4 w-4 text-amber-500" />
            Loved your move with our crew? Leave us a 5-star review!
          </h3>
          {reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
            >
              <Star className="h-4 w-4" /> Leave a Google review
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              {reviewNote || "Ask the office to add the company Google review link."}
            </p>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="w-full text-center text-xs text-muted-foreground underline"
          >
            Not now
          </button>
        </div>
      )}
    </section>
  );
}
