// Address autocomplete and driving-route lookups for the quote surfaces.
// Google Places/Routes is used when VITE_GOOGLE_MAPS_API_KEY is configured; without
// a key the same calls fall back to OpenStreetMap (Nominatim + OSRM), so address
// entry and mileage never depend on a paid key being present.
export type AddressSuggestion = {
  label: string;
  provider: "google" | "openstreetmap";
};

export type RoutePoint = { lat: number; lng: number };

export type AddressRoute = {
  miles: number;
  minutes: number;
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  provider: "google" | "openstreetmap";
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org";
const MIN_QUERY = 3;
const METRES_PER_MILE = 1609.344;

/** Browser key for Places/Routes. Read lazily so tests and SSR never touch env. */
export function googleMapsKey(): string {
  try {
    const value = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export function routeProvider(): "google" | "openstreetmap" {
  return googleMapsKey() ? "google" : "openstreetmap";
}

export function routeProviderLabel(provider: "google" | "openstreetmap"): string {
  return provider === "google" ? "Google Maps" : "OpenStreetMap";
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

async function getJson<T>(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json", ...(headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    signal,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as T;
}

type GoogleSuggestions = {
  suggestions?: { placePrediction?: { text?: { text?: string } } }[];
};

type NominatimPlace = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

/** Street-address suggestions, Google-first with a Nominatim fallback. */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const input = query.trim();
  if (input.length < MIN_QUERY) return [];
  const key = googleMapsKey();
  if (key) {
    try {
      const result = await postJson<GoogleSuggestions>(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          input,
          includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
        },
        { "X-Goog-Api-Key": key },
        signal,
      );
      const labels = (result.suggestions ?? [])
        .map((entry) => entry.placePrediction?.text?.text?.trim() ?? "")
        .filter(Boolean)
        .slice(0, 6);
      if (labels.length) return labels.map((label) => ({ label, provider: "google" }));
    } catch (reason) {
      // A blocked or unverified key must not stop address entry.
      if (signal?.aborted) throw reason;
    }
  }
  const places = await getJson<NominatimPlace[]>(
    `${NOMINATIM}/search?format=jsonv2&limit=6&addressdetails=0&q=${encodeURIComponent(input)}`,
    signal,
  );
  return (Array.isArray(places) ? places : [])
    .map((place) => (place.display_name ?? "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((label) => ({ label, provider: "openstreetmap" as const }));
}

async function geocode(address: string, signal?: AbortSignal): Promise<RoutePoint | null> {
  const places = await getJson<NominatimPlace[]>(
    `${NOMINATIM}/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(address)}`,
    signal,
  );
  const first = Array.isArray(places) ? places[0] : undefined;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: round4(lat), lng: round4(lng) };
}

type GoogleRoute = {
  routes?: {
    legs?: {
      distanceMeters?: number;
      duration?: string;
      startLocation?: { latLng?: { latitude?: number; longitude?: number } };
      endLocation?: { latLng?: { latitude?: number; longitude?: number } };
    }[];
  }[];
};

/** Driving distance, time and endpoints. Google Routes first, then OSRM. */
export async function planAddressRoute(
  origin: string,
  destination: string,
  signal?: AbortSignal,
): Promise<AddressRoute> {
  const from = origin.trim();
  const to = destination.trim();
  if (from.length < MIN_QUERY || to.length < MIN_QUERY) {
    throw new Error("Add both the pickup and drop-off address first.");
  }
  const key = googleMapsKey();
  if (key) {
    try {
      const result = await postJson<GoogleRoute>(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          origin: { address: from },
          destination: { address: to },
          travelMode: "DRIVE",
          units: "IMPERIAL",
        },
        {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation,routes.legs.endLocation",
        },
        signal,
      );
      const leg = result.routes?.[0]?.legs?.[0];
      if (leg?.distanceMeters && leg.duration) {
        const start = leg.startLocation?.latLng;
        const end = leg.endLocation?.latLng;
        return {
          miles: round1(leg.distanceMeters / METRES_PER_MILE),
          minutes: Math.max(1, Math.round(parseFloat(leg.duration) / 60)),
          origin:
            typeof start?.latitude === "number" && typeof start?.longitude === "number"
              ? { lat: round4(start.latitude), lng: round4(start.longitude) }
              : null,
          destination:
            typeof end?.latitude === "number" && typeof end?.longitude === "number"
              ? { lat: round4(end.latitude), lng: round4(end.longitude) }
              : null,
          provider: "google",
        };
      }
    } catch (reason) {
      if (signal?.aborted) throw reason;
    }
  }

  const [start, end] = await Promise.all([geocode(from, signal), geocode(to, signal)]);
  if (!start || !end)
    throw new Error("Those addresses could not be located. Add a city or ZIP code.");
  const route = await getJson<{ routes?: { distance?: number; duration?: number }[] }>(
    `${OSRM}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=false`,
    signal,
  );
  const leg = route.routes?.[0];
  if (!leg?.distance || !leg.duration)
    throw new Error("No driving route found between those addresses.");
  return {
    miles: round1(leg.distance / METRES_PER_MILE),
    minutes: Math.max(1, Math.round(leg.duration / 60)),
    origin: start,
    destination: end,
    provider: "openstreetmap",
  };
}
