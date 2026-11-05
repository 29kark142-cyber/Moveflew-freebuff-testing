import type { RoutePoint } from "@/lib/places";

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** "lat,lng" — the form both Google Maps and Waze accept. */
export function formatCoords(point: RoutePoint): string {
  return `${round4(point.lat)},${round4(point.lng)}`;
}

/** Driving directions between the geocoded pickup and drop-off. */
export function googleMapsDirectionsUrl(origin: RoutePoint, destination: RoutePoint): string {
  const params = new URLSearchParams({
    api: "1",
    origin: formatCoords(origin),
    destination: formatCoords(destination),
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Waze navigation to the drop-off, starting from the pickup when it is known. */
export function wazeUrl(destination: RoutePoint, origin?: RoutePoint | null): string {
  const params = new URLSearchParams({
    ll: formatCoords(destination),
    navigate: "yes",
  });
  if (origin) params.set("from", formatCoords(origin));
  return `https://waze.com/ul?${params.toString()}`;
}
