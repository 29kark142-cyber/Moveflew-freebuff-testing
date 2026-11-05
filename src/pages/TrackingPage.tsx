import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Truck,
} from "lucide-react";
import RouteMap from "@/components/tracking/RouteMap";
import { readTracking } from "@/lib/tracking-api";
import {
  estimateArrival,
  routeProgress,
  trackingStage,
  TRACKING_STAGES,
  type PublicTrackingPayload,
} from "@shared/tracking";

const REFRESH_MS = 20_000;

const formatTime = (iso: string | null): string => {
  if (!iso) return "—";
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(at);
};

const formatDate = (date: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
};

const arrivalTime = (startHour: number): string => {
  const minutes = Math.round(Math.max(0, startHour) * 60);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
  );
};

const sinceLabel = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
};

export default function TrackingPage({ token }: { token: string }) {
  const [payload, setPayload] = useState<PublicTrackingPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const result = await readTracking(token);
      if (!result.found) {
        setMissing(true);
        setPayload(null);
        setError("");
        return;
      }
      setMissing(false);
      setError("");
      setPayload(result.payload);
      setRefreshedAt(Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load this move right now.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while the customer keeps the page open; refresh immediately when they return.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const stage = useMemo(() => trackingStage(payload?.timeline), [payload]);
  const progress = payload ? routeProgress(payload.timeline, now, payload.travelMinutes) : 0;
  const eta = payload
    ? estimateArrival(
        {
          moveDate: payload.moveDate,
          startHour: payload.startHour,
          duration: payload.duration,
          travelMinutes: payload.travelMinutes,
        },
        payload.timeline,
        now,
      )
    : null;

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading your move…
        </p>
      </div>
    );
  }

  if (missing || !payload) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <CircleAlert className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">
            This tracking link isn't available
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {error ||
              "The link may have expired or been replaced. Ask your moving company for a new tracking link."}
          </p>
        </div>
      </div>
    );
  }

  const contactPhone = (payload.foreman?.phone || payload.company.phone || "").replace(
    /[^\d+]/g,
    "",
  );
  const primaryPhone = contactPhone || "";
  const foremanRole =
    payload.foreman?.role === "crew_lead"
      ? "Crew foreman"
      : payload.foreman?.role === "driver"
        ? "Driver"
        : "Crew";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            {payload.company.monogram}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{payload.company.name}</p>
            <p className="text-xs text-slate-500">Live move update</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-600">
            {payload.reference}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-28">
        {/* Move summary + foreman */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Move date
              </p>
              <p className="text-base font-semibold">{formatDate(payload.moveDate)}</p>
              <p className="text-sm text-slate-500">
                Crew scheduled {arrivalTime(payload.startHour)}
              </p>
            </div>
            {payload.foreman ? (
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {payload.foreman.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{payload.foreman.name}</p>
                  <p className="text-xs text-slate-500">{foremanRole}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Crew not assigned yet</p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> Pickup
              </dt>
              <dd className="mt-1 text-slate-700">{payload.origin || "Address to be confirmed"}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> Delivery
              </dt>
              <dd className="mt-1 text-slate-700">
                {payload.destination || "Address to be confirmed"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Stage stepper */}
        <section
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          aria-label="Job status"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Move progress</h2>
            <span className="text-xs font-medium text-slate-500">
              {stage.index < 0 ? "Not started" : TRACKING_STAGES[stage.index]?.label}
            </span>
          </div>

          <ol className="mt-4 flex items-start justify-between gap-1">
            {TRACKING_STAGES.map((step, index) => {
              const done = stage.index >= 0 && index < stage.index;
              const current = index === stage.index;
              return (
                <li
                  key={step.key}
                  className="flex min-w-0 flex-1 flex-col items-center text-center"
                >
                  <div className="flex w-full items-center">
                    <span
                      className={`h-0.5 flex-1 ${index === 0 ? "opacity-0" : done || current ? "bg-blue-600" : "bg-slate-200"}`}
                    />
                    <span
                      aria-current={current ? "step" : undefined}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold ${
                        done
                          ? "border-blue-600 bg-blue-600 text-white"
                          : current
                            ? "border-blue-600 bg-white text-blue-700 ring-4 ring-blue-100"
                            : "border-slate-200 bg-white text-slate-400"
                      }`}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span
                      className={`h-0.5 flex-1 ${index === TRACKING_STAGES.length - 1 ? "opacity-0" : done ? "bg-blue-600" : "bg-slate-200"}`}
                    />
                  </div>
                  <span
                    className={`mt-2 text-[11px] leading-tight sm:text-xs ${
                      current
                        ? "font-semibold text-slate-900"
                        : done
                          ? "text-slate-700"
                          : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {stage.index < 0
              ? "Your crew hasn't started this move yet. This page updates automatically."
              : TRACKING_STAGES[stage.index]?.hint}
          </p>
        </section>

        {/* Map + ETA */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-blue-600" /> Truck location
            </h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
              Simulated
            </span>
          </div>

          <RouteMap
            progress={progress}
            originLabel={payload.origin || "pickup"}
            destinationLabel={payload.destination || "delivery"}
          />

          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 p-3 text-white">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                {eta?.label ?? "Estimated arrival"}
              </p>
              <p className="text-lg font-bold">{formatTime(eta?.at ?? null)}</p>
            </div>
            <div className="text-right">
              {eta?.basis === "completed" ? (
                <p className="text-sm font-semibold text-emerald-300">Move complete</p>
              ) : typeof eta?.minutes === "number" && eta.minutes > 0 ? (
                <p className="text-sm font-semibold">~{eta.minutes} min away</p>
              ) : typeof eta?.minutes === "number" ? (
                <p className="text-sm font-semibold text-amber-300">Running behind schedule</p>
              ) : (
                <p className="text-sm text-slate-300">Awaiting crew update</p>
              )}
              <p className="text-[11px] text-slate-400">
                {payload.distanceMiles > 0
                  ? `${Math.round(payload.distanceMiles)} mi route`
                  : "Route distance pending"}
              </p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            The map shows the scheduled route and an estimated truck position based on the crew's
            last update. It is not a live GPS feed, and traffic can change the arrival time.
          </p>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> Refreshes every 20 seconds · updated{" "}
          {sinceLabel(now - refreshedAt)}
        </p>
      </main>

      {/* Emergency contact quick actions */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2">
          <a
            href={primaryPhone ? `tel:${primaryPhone}` : undefined}
            aria-disabled={!primaryPhone}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white ${
              primaryPhone ? "active:scale-[.99]" : "pointer-events-none opacity-40"
            }`}
          >
            <Phone className="h-4 w-4" /> Contact Crew Foreman
          </a>
          <a
            href={primaryPhone ? `sms:${primaryPhone}` : undefined}
            aria-disabled={!primaryPhone}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${
              primaryPhone ? "active:scale-[.99]" : "pointer-events-none opacity-40"
            }`}
          >
            <MessageSquare className="h-4 w-4" /> Text the crew
          </a>
        </div>
        {!primaryPhone && (
          <p className="mt-2 text-center text-[11px] text-slate-500">
            No crew phone number is on file yet. Call {payload.company.name} for an update.
          </p>
        )}
      </div>
    </div>
  );
}
