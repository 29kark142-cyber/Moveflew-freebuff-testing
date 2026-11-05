import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, RefreshCw, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planAddressRoute, routeProviderLabel, type AddressRoute } from "@/lib/places";
import { routeSummaryLabel } from "@shared/route-pricing";

type Props = {
  origin: string;
  destination: string;
  onRoute?: (route: AddressRoute | null) => void;
  auto?: boolean;
  className?: string;
};

/**
 * Compact route summary: driving distance, transit time and the geocoded endpoints.
 * Recalculates when either address settles; failures are shown, never hidden.
 */
export default function RouteSummaryCard({
  origin,
  destination,
  onRoute,
  auto = true,
  className,
}: Props) {
  const [route, setRoute] = useState<AddressRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Parent callbacks are stored in a ref so a re-render never triggers a new lookup.
  const notify = useRef(onRoute);
  useEffect(() => {
    notify.current = onRoute;
  }, [onRoute]);

  useEffect(() => {
    const from = origin.trim();
    const to = destination.trim();
    if (!auto || from.length < 3 || to.length < 3) {
      setRoute(null);
      setError("");
      notify.current?.(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      planAddressRoute(from, to, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setRoute(result);
          setError("");
          notify.current?.(result);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setRoute(null);
          notify.current?.(null);
          setError(reason instanceof Error ? reason.message : "Route lookup failed.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [auto, destination, origin, attempt]);

  return (
    <div className={`rounded-xl border border-border bg-background p-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <b className="flex items-center gap-1.5 text-sm text-foreground">
          <Route size={15} /> Route summary
        </b>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={loading || origin.trim().length < 3 || destination.trim().length < 3}
          onClick={() => setAttempt((count) => count + 1)}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Recalculate
        </Button>
      </div>

      {loading && !route && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating driving route…
        </p>
      )}

      {!loading && !route && !error && (
        <p className="mt-2 text-sm text-muted-foreground">
          Add both the pickup and drop-off address to calculate mileage and drive time.
        </p>
      )}

      {error && !route && (
        <p className="mt-2 text-sm text-destructive" role="status">
          {error}
        </p>
      )}

      {route && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted p-2">
              <small className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Driving distance
              </small>
              <b className="text-base text-foreground">{route.miles} mi</b>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <small className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Transit time
              </small>
              <b className="text-base text-foreground">{route.minutes} min</b>
            </div>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {route.origin
                ? `${route.origin.lat}, ${route.origin.lng}`
                : "Pickup point unavailable"}
            </span>
            <span aria-hidden="true">→</span>
            <span>
              {route.destination
                ? `${route.destination.lat}, ${route.destination.lng}`
                : "Drop-off point unavailable"}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {routeSummaryLabel(route.miles, route.minutes)} · {routeProviderLabel(route.provider)} ·
            driving estimate, traffic can change it.
          </p>
        </div>
      )}
    </div>
  );
}
