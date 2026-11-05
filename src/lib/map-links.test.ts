import { describe, expect, it } from "vitest";
import { formatCoords, googleMapsDirectionsUrl, wazeUrl } from "@/lib/map-links";

const pickup = { lat: 41.881832, lng: -87.623177 };
const dropoff = { lat: 42.045073, lng: -87.687698 };

describe("map links", () => {
  it("formats coordinates to four decimals", () => {
    expect(formatCoords(pickup)).toBe("41.8818,-87.6232");
  });

  it("builds driving directions for the whole route", () => {
    const url = new URL(googleMapsDirectionsUrl(pickup, dropoff));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("travelmode")).toBe("driving");
    expect(url.searchParams.get("origin")).toBe("41.8818,-87.6232");
    expect(url.searchParams.get("destination")).toBe("42.0451,-87.6877");
  });

  it("builds a Waze navigation link to the drop-off", () => {
    const url = new URL(wazeUrl(dropoff, pickup));
    expect(url.hostname).toBe("waze.com");
    expect(url.pathname).toBe("/ul");
    expect(url.searchParams.get("ll")).toBe("42.0451,-87.6877");
    expect(url.searchParams.get("from")).toBe("41.8818,-87.6232");
    expect(url.searchParams.get("navigate")).toBe("yes");
  });

  it("omits the Waze start when the pickup is unknown", () => {
    expect(new URL(wazeUrl(dropoff)).searchParams.get("from")).toBeNull();
  });
});
