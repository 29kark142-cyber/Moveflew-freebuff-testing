import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Clock,
  MapPin,
  MessageSquare,
  Navigation,
  PackageCheck,
  PackageOpen,
  Phone,
  RefreshCw,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import RouteMap from "@/components/tracking/RouteMap";
import { readTracking } from "@/lib/tracking-api";
import { DEMO_TRACKING_TOKEN, demoTrackingPayload } from "@/lib/tracking-demo";
import {
  estimateArrival,
  routeProgress,
  trackingItemStatus,
  trackingStage,
  TRACKING_STAGES,
  type PublicTrackingPayload,
  type TrackingItemStatus,
} from "@shared/tracking";

const REFRESH_MS = 20_000;

const ITEM_FILTERS: { key: TrackingItemStatus; label: string; icon: typeof Truck }[] = [
  { key: "loaded", label: "Loaded", icon: PackageCheck },
  { key: "in_transit", label: "In-Transit", icon: Truck },
  { key: "unloaded", label: "Unloaded", icon: PackageOpen },
];

const ITEM_TONE: Record<TrackingItemStatus, string> = {
  loaded: "border-blue-200 bg-blue-50 text-blue-700",
  in_transit: "border-amber-200 bg-amber-50 text-amber-800",
  unloaded: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

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

const crewRoleLabel = (role: string): string =>
  role === "crew_lead" ? "Crew foreman" : role === "driver" ? "Driver" : "Mover";

const sinceLabel = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
};

/** mm:ss (or h:mm:ss) remaining until the estimated arrival. */
const countdownLabel = (at: string | null, now: number): string | null => {
  if (!at) return null;
  const remaining = Date.parse(at) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const total = Math.floor(remaining / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
};

export default function TrackingPage({ token }: { token: string }) {
  const demo = token === DEMO_TRACKING_TOKEN;
  const [payload, setPayload] = useState<PublicTrackingPayload | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  // Ticks every second so the route bar and the arrival countdown move smoothly.
  const [tick, setTick] = useState(() => Date.now());
  const [filter, setFilter] = useState<TrackingItemStatus>("loaded");
  const filterInitialised = useRef(false);

  const load = useCallback(async () => {
    if (demo) {
      setPayload(demoTrackingPayload());
      setMissing(false);
      setError("");
      setRefreshedAt(Date.now());
      setLoading(false);
      return;
    }
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
  }, [demo, token]);

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
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stage = useMemo(() => trackingStage(payload?.timeline), [payload]);
  const progress = payload ? routeProgress(payload.timeline, tick, payload.travelMinutes) : 0;
  const eta = payload
    ? estimateArrival(
        {
          moveDate: payload.moveDate,
          startHour: payload.startHour,
          duration: payload.duration,
          travelMinutes: payload.travelMinutes,
        },
        payload.timeline,
        tick,
      )
    : null;

  const inventory = useMemo(() => payload?.inventory ?? [], [payload]);
  const counts = useMemo(() => {
    const base: Record<TrackingItemStatus, number> = { loaded: 0, in_transit: 0, unloaded: 0 };
    for (const item of inventory) if (item.status) base[item.status] += 1;
    return base;
  }, [inventory]);

  // Open on the category that matches the crew's current stage, once.
  useEffect(() => {
    if (!payload || filterInitialised.current) return;
    filterInitialised.current = true;
    setFilter(trackingItemStatus(payload.timeline) ?? "loaded");
  }, [payload]);

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

  const driverPhone = (payload.foreman?.phone || payload.company.phone || "").replace(
    /[^\d+]/g,
    "",
  );
  const dispatchPhone = (payload.company.phone || payload.foreman?.phone || "").replace(
    /[^\d+]/g,
    "",
  );
  const foremanRole =
    payload.foreman?.role === "crew_lead"
      ? "Crew foreman"
      : payload.foreman?.role === "driver"
        ? "Driver"
        : "Crew";
  const countdown = countdownLabel(eta?.at ?? null, tick);
  const shownItems = inventory.filter((item) => item.status === filter);
  const itemStatusStarted = inventory.some((item) => item.status !== null);
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

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
        {demo && (
          <p
            className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            role="status"
          >
            <b>Sample preview.</b> This is illustrative demo data for the tracking screen — no
            customer record, address or crew phone number is shown.
          </p>
        )}

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

        {/* Driver check-in progress */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Navigation className="h-4 w-4 text-blue-600" /> Driver progress
            </h2>
            <span className="text-xs text-slate-500">
              {payload.lastCheckin
                ? `Updated ${sinceLabel(Math.max(0, tick - Date.parse(payload.lastCheckin.at)))}`
                : "Awaiting first check-in"}
            </span>
          </div>
          {payload.lastCheckin ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{payload.lastCheckin.label}</p>
                <span className="text-xs text-slate-500">{formatTime(payload.lastCheckin.at)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {payload.lastCheckin.by || "Your crew"}
                {payload.lastCheckin.note ? ` · ${payload.lastCheckin.note}` : ""}
              </p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Your crew lead hasn't checked in yet. Progress updates appear here automatically.
            </p>
          )}
          {payload.checkins.length > 1 && (
            <ol className="mt-3 space-y-2 border-l border-slate-200 pl-3">
              {payload.checkins.slice(0, 4).map((entry) => (
                <li key={entry.id} className="text-xs">
                  <span className="font-semibold text-slate-700">{entry.label}</span>
                  <span className="ml-2 text-slate-400">{formatTime(entry.at)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Check-ins are sent by the crew lead from the job site, not a continuous GPS feed.
          </p>
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

        {/* Assigned crew and driver */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-blue-600" /> Your crew
            </h2>
            <span className="text-xs text-slate-500">
              {payload.crew.length} crew member{payload.crew.length === 1 ? "" : "s"} assigned
            </span>
          </div>
          {payload.crew.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {payload.crew.map((member) => (
                <li
                  key={`${member.name}-${member.role}`}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
                    {member.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{member.name}</span>
                    <span className="text-xs text-slate-500">
                      {crewRoleLabel(member.role)}
                      {member.isDriver ? " · driver" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Crew assignment is being confirmed. This list updates automatically.
            </p>
          )}
        </section>

        {/* Map + animated route progress + ETA countdown */}
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Pickup</span>
              <span className="tabular-nums text-slate-700">{percent}% of route</span>
              <span>Delivery</span>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Route progress"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400 transition-[width] duration-1000 ease-out"
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 p-3 text-white">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                {eta?.label ?? "Estimated arrival"}
              </p>
              <p className="text-lg font-bold">{formatTime(eta?.at ?? null)}</p>
              {countdown && (
                <p className="mt-0.5 text-xs tabular-nums text-sky-300">In {countdown}</p>
              )}
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

        {/* Interactive shipment checklist */}
        <section
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          aria-label="Shipment checklist"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Your belongings</h2>
            <span className="text-xs text-slate-500">
              {inventory.length} item{inventory.length === 1 ? "" : "s"} on the shipment
            </span>
          </div>

          <div
            className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
            aria-label="Filter items by status"
          >
            {ITEM_FILTERS.map(({ key, label, icon: Icon }) => {
              const selected = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(key)}
                  className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    selected
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                  <span className="tabular-nums text-[11px] text-slate-500">{counts[key]}</span>
                </button>
              );
            })}
          </div>

          {inventory.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Your moving company hasn't added an inventory list to this move yet.
            </p>
          ) : !itemStatusStarted ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              Loading hasn't started yet, so nothing is marked as loaded. Statuses update as your
              crew works through the move.
            </p>
          ) : shownItems.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
              No items are {ITEM_FILTERS.find((entry) => entry.key === filter)?.label.toLowerCase()}{" "}
              right now. Pick another category to see the rest of your shipment.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {shownItems.map((item) => {
                const status = item.status as TrackingItemStatus;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300" />
                      <span className="truncate text-sm text-slate-700">{item.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs tabular-nums text-slate-500">×{item.quantity}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ITEM_TONE[status]}`}
                      >
                        {ITEM_FILTERS.find((entry) => entry.key === status)?.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-[11px] text-slate-500">
            Item status follows your crew's last move update. Tap a category above to filter the
            list.
          </p>
        </section>

        {/* Vault assets and inspection photos */}
        {payload.vaults.length > 0 && (
          <section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            aria-label="Vault assets and photos"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Warehouse className="h-4 w-4 text-blue-600" /> Vault assets &amp; photos
              </h2>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Camera className="h-3.5 w-3.5" />
                {payload.vaults.reduce((total, vault) => total + vault.photos.length, 0)} photo(s)
              </span>
            </div>
            <div className="mt-3 space-y-4">
              {payload.vaults.map((vault) => (
                <article key={vault.code}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Vault {vault.code}</p>
                    <span className="text-xs text-slate-500">
                      {vault.assets.length} asset{vault.assets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {vault.assets.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {vault.assets.map((asset, index) => (
                        <li
                          key={`${asset.name}-${index}`}
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
                        >
                          {asset.name} × {asset.quantity}
                        </li>
                      ))}
                    </ul>
                  )}
                  {vault.photos.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {vault.photos.map((photo) => (
                        <figure key={photo.id}>
                          <a href={photo.url} target="_blank" rel="noreferrer">
                            <img
                              src={photo.url}
                              alt={photo.caption || `Inspection photo for vault ${vault.code}`}
                              loading="lazy"
                              className="h-28 w-full rounded-lg border border-slate-200 object-cover"
                            />
                          </a>
                          <figcaption className="mt-1 text-[11px] leading-tight text-slate-500">
                            {photo.caption}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Photos are taken by the warehouse team when your items are checked into storage.
            </p>
          </section>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" /> Refreshes every 20 seconds · updated{" "}
          {sinceLabel(tick - refreshedAt)}
        </p>
      </main>

      {/* Quick actions: call the driver directly, or message the dispatch office */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2">
          <a
            href={driverPhone ? `tel:${driverPhone}` : undefined}
            aria-disabled={!driverPhone}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white ${
              driverPhone ? "active:scale-[.99]" : "pointer-events-none opacity-40"
            }`}
          >
            <Phone className="h-4 w-4" /> Call Driver
          </a>
          <a
            href={dispatchPhone ? `sms:${dispatchPhone}` : undefined}
            aria-disabled={!dispatchPhone}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 ${
              dispatchPhone ? "active:scale-[.99]" : "pointer-events-none opacity-40"
            }`}
          >
            <MessageSquare className="h-4 w-4" /> Message Dispatch
          </a>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          {driverPhone
            ? `${payload.foreman?.name || "Your driver"} · ${foremanRole.toLowerCase()}`
            : "No driver phone number is on file yet."}
          {" · "}Dispatch {payload.company.phone || "not configured"}
        </p>
      </div>
    </div>
  );
}
