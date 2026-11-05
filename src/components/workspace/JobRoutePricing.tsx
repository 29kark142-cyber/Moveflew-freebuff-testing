import { useEffect, useState } from "react";
import { Calculator, ExternalLink, Map as MapIcon, Save, X } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import RouteSummaryCard from "@/components/workspace/RouteSummaryCard";
import RouteMap from "@/components/workspace/RouteMap";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { googleMapsDirectionsUrl, wazeUrl } from "@/lib/map-links";
import type { AddressRoute } from "@/lib/places";
import { money, type Job, type WorkspaceRole } from "@shared/crm";
import { routeTravelPricing } from "@shared/route-pricing";

const OFFICE_ROLES: WorkspaceRole[] = ["admin", "office_admin", "dispatcher"];

const toAmount = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Route and mileage pricing for a saved job. Distance × per-mile rate and drive
 * time × crew rate are calculated automatically; office staff can override the
 * travel charge or apply a percentage discount before the estimate is finalized.
 */
export default function JobRoutePricing({
  job,
  role,
  onSaved,
}: {
  job: Job;
  role: WorkspaceRole;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const canPrice = OFFICE_ROLES.includes(role);
  const [origin, setOrigin] = useState(job.origin ?? "");
  const [destination, setDestination] = useState(job.destination ?? "");
  const [storage, setStorage] = useState(job.storageAddress ?? "");
  const [route, setRoute] = useState<AddressRoute | null>(null);
  const [perMile, setPerMile] = useState(String(job.mileRate ?? 0));
  const [crewRate, setCrewRate] = useState(String(job.hourlyRate ?? 0));
  const [override, setOverride] = useState("");
  const [discount, setDiscount] = useState(job.discountPercent ? String(job.discountPercent) : "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mapOpen, setMapOpen] = useState(false);

  // The freshly calculated route wins; saved job coordinates keep the map after reload.
  const savedCoords = job.routeCoords ?? { origin: null, destination: null };
  const mapOrigin = route?.origin ?? savedCoords.origin;
  const mapDestination = route?.destination ?? savedCoords.destination;

  // The full map is a modal: lock scrolling and close on Escape.
  useEffect(() => {
    if (!mapOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [mapOpen]);

  const pricing = routeTravelPricing({
    distanceMiles: route?.miles ?? job.distanceMiles,
    travelMinutes: route?.minutes ?? job.travelMinutes,
    perMileRate: toAmount(perMile),
    crewHourlyRate: toAmount(crewRate),
    manualOverride: override.trim() === "" ? null : Number(override),
    discountPercent: toAmount(discount),
  });

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await crm.updateJob(job.id, {
        origin,
        destination,
        storageAddress: storage,
        distanceMiles: pricing.miles,
        travelMinutes: pricing.minutes,
        travelFee: pricing.travelCharge,
        mileRate: toAmount(perMile),
        discountPercent: pricing.discountPercent,
        routeCoords: route
          ? { origin: route.origin, destination: route.destination }
          : (job.routeCoords ?? null),
      });
      setMessage(t("Route and pricing saved."));
      await onSaved();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : t("Could not save the route pricing."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ws-card ws-card-pad" data-tour="job-route">
      <div className="ws-card-title">
        <div>
          <h2>
            <Calculator size={16} /> {t("Route & mileage pricing")}
          </h2>
          <p>{t("Driving distance is billed per mile and drive time at the crew rate.")}</p>
        </div>
      </div>

      <div className="ws-form-grid">
        <AddressAutocomplete
          label={t("Pickup address")}
          placeholder={t("Street, city, state ZIP")}
          inputClassName="ws-input"
          value={origin}
          onChange={setOrigin}
          disabled={!canPrice}
        />
        <AddressAutocomplete
          label={t("Drop-off address")}
          placeholder={t("Street, city, state ZIP")}
          inputClassName="ws-input"
          value={destination}
          onChange={setDestination}
          disabled={!canPrice}
        />
        <AddressAutocomplete
          label={t("Storage address (optional)")}
          placeholder={t("Storage facility or unit address")}
          inputClassName="ws-input"
          value={storage}
          onChange={setStorage}
          disabled={!canPrice}
        />
      </div>

      <RouteSummaryCard
        origin={origin}
        destination={destination}
        onRoute={setRoute}
        className="mt-3"
      />

      <div className="mt-3 rounded-xl border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="flex items-center gap-1.5 text-sm text-foreground">
            <MapIcon size={15} /> {t("Route map")}
          </b>
          <div className="flex flex-wrap items-center gap-2">
            {mapOrigin && mapDestination && (
              <>
                <a
                  className="ws-btn"
                  href={googleMapsDirectionsUrl(mapOrigin, mapDestination)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} /> {t("Google Maps")}
                </a>
                <a
                  className="ws-btn"
                  href={wazeUrl(mapDestination, mapOrigin)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={14} /> {t("Waze")}
                </a>
              </>
            )}
            <button
              type="button"
              className="ws-btn primary"
              disabled={!mapOrigin || !mapDestination}
              onClick={() => setMapOpen(true)}
            >
              {t("View Full Map")}
            </button>
          </div>
        </div>
        <RouteMap origin={mapOrigin} destination={mapDestination} className="mt-2" />
        <p className="ws-helper mt-1">
          {mapOrigin && mapDestination
            ? t(
                "Green pin is the pickup, red pin the drop-off. Open the full map for driver hand-off.",
              )
            : t("Calculate both addresses to draw the route map.")}
        </p>
      </div>

      <div className="ws-form-grid" style={{ marginTop: 12 }}>
        <label className="ws-field">
          <span>{t("Per-mile rate ($)")}</span>
          <input
            className="ws-input"
            type="number"
            min={0}
            step="0.01"
            value={perMile}
            disabled={!canPrice}
            onChange={(event) => setPerMile(event.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Crew hourly rate ($)")}</span>
          <input
            className="ws-input"
            type="number"
            min={0}
            step="0.01"
            value={crewRate}
            disabled={!canPrice}
            onChange={(event) => setCrewRate(event.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Travel override ($, optional)")}</span>
          <input
            className="ws-input"
            type="number"
            min={0}
            step="0.01"
            value={override}
            placeholder={t("Replace calculated travel")}
            disabled={!canPrice}
            onChange={(event) => setOverride(event.target.value)}
          />
        </label>
        <label className="ws-field">
          <span>{t("Discount (%)")}</span>
          <input
            className="ws-input"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={discount}
            placeholder="0"
            disabled={!canPrice}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </label>
      </div>

      <div className="ws-quote-lines" style={{ marginTop: 12 }}>
        <div>
          <span>
            {t("Mileage surcharge · {miles} mi × {rate}/mi", {
              miles: pricing.miles,
              rate: money(toAmount(perMile)),
            })}
          </span>
          <strong>{money(pricing.mileageSurcharge)}</strong>
        </div>
        <div>
          <span>
            {t("Transit time · {minutes} min × {rate}/h", {
              minutes: pricing.minutes,
              rate: money(toAmount(crewRate)),
            })}
          </span>
          <strong>{money(pricing.transitCost)}</strong>
        </div>
        <div>
          <span>
            {pricing.overrideUsed
              ? t("Travel charge (manual override)")
              : t("Travel charge (calculated)")}
          </span>
          <strong>{money(pricing.travelCharge)}</strong>
        </div>
        {pricing.discountPercent > 0 && (
          <div>
            <span>{t("Discount · {percent}%", { percent: pricing.discountPercent })}</span>
            <strong>-{money(pricing.discountAmount)}</strong>
          </div>
        )}
        <div>
          <span>{t("Travel after discount")}</span>
          <strong>{money(pricing.total)}</strong>
        </div>
      </div>

      <div className="ws-actions" style={{ marginTop: 12 }}>
        <button
          className="ws-btn primary"
          type="button"
          disabled={!canPrice || saving}
          onClick={() => void save()}
        >
          <Save size={15} />
          {saving ? t("Saving…") : t(" Save route & pricing")}
        </button>
        {!canPrice && (
          <span className="ws-helper">
            {t("Only admins and dispatchers can override travel pricing or apply a discount.")}
          </span>
        )}
        {message && <span className="ws-helper">{message}</span>}
      </div>

      {mapOpen && mapOrigin && mapDestination && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3"
          role="dialog"
          aria-modal="true"
          aria-label={t("Route map")}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMapOpen(false);
          }}
        >
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-background p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{t("Route map")}</h2>
                <p className="text-xs text-muted-foreground">
                  {t("{miles} mi · {minutes} min", {
                    miles: pricing.miles,
                    minutes: pricing.minutes,
                  })}
                </p>
              </div>
              <button
                type="button"
                className="ws-btn"
                onClick={() => setMapOpen(false)}
                aria-label={t("Close map")}
              >
                <X size={15} /> {t("Close")}
              </button>
            </div>

            <RouteMap
              variant="full"
              origin={mapOrigin}
              destination={mapDestination}
              className="mt-3"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                className="ws-btn primary"
                href={googleMapsDirectionsUrl(mapOrigin, mapDestination)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} /> {t("Open in Google Maps")}
              </a>
              <a
                className="ws-btn"
                href={wazeUrl(mapDestination, mapOrigin)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} /> {t("Open in Waze")}
              </a>
              <span className="ws-helper">
                {t("Hand the route to the driver's phone for turn-by-turn navigation.")}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
