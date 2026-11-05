import { describe, expect, it } from "vitest";
import {
  PDF_LINK_REFRESH_MS,
  SIGNED_URL_TTL_MS,
  SIGNED_URL_TTL_SECONDS,
  WALLPAPER_REFRESH_MS,
  signedUrlExpiresAt,
  signedUrlIsUsable,
} from "./signed-url";

const MINUTE = 60_000;

describe("private signed download links", () => {
  it("keeps job document and wallpaper links valid for 5 minutes", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(300);
    expect(SIGNED_URL_TTL_MS).toBe(5 * MINUTE);
  });

  it("stays usable until the five minute mark and not after", () => {
    const issued = Date.parse("2026-11-01T14:30:00.000Z");
    expect(signedUrlExpiresAt(issued)).toBe(issued + 5 * MINUTE);
    expect(signedUrlIsUsable(issued, issued + 4 * MINUTE + 59_000)).toBe(true);
    expect(signedUrlIsUsable(issued, issued + 5 * MINUTE)).toBe(false);
  });

  it("re-signs the Bill of Lading and wallpaper before their links can lapse", () => {
    expect(PDF_LINK_REFRESH_MS).toBeGreaterThan(0);
    expect(PDF_LINK_REFRESH_MS).toBeLessThan(SIGNED_URL_TTL_MS);
    expect(WALLPAPER_REFRESH_MS).toBeGreaterThan(0);
    expect(WALLPAPER_REFRESH_MS).toBeLessThan(SIGNED_URL_TTL_MS);
  });
});
