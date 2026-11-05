import { describe, expect, it } from "vitest";
import {
  brandDisplayName,
  brandingVariables,
  DEFAULT_BRANDING,
  isStorageImage,
  normalizeDomain,
  parseBranding,
} from "./branding";

describe("white-label branding", () => {
  it("validates and normalizes a stored branding document", () => {
    const branding = parseBranding({
      displayName: "John's Moving",
      brandColor: "#ff5500",
      logo: { kind: "url", value: "https://cdn.example.test/logo.png" },
      background: { kind: "storage", value: "12/abc-123.webp" },
      customDomain: "quotes.johnsmoving.com",
    });
    expect(branding.displayName).toBe("John's Moving");
    expect(branding.brandColor).toBe("#ff5500");
    expect(branding.logo?.kind).toBe("url");
  });

  it("falls back to defaults for invalid or missing documents", () => {
    expect(parseBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(parseBranding({ brandColor: "red" })).toEqual(DEFAULT_BRANDING);
    expect(parseBranding({ logo: { kind: "url", value: "http://example.test/logo.png" } })).toEqual(
      DEFAULT_BRANDING,
    );
  });

  it("rejects cross-workspace storage images", () => {
    const image = { kind: "storage" as const, value: "9/logo.webp" };
    expect(isStorageImage(image, 9)).toBe(true);
    expect(isStorageImage(image, 10)).toBe(false);
    expect(isStorageImage({ kind: "url", value: "https://example.test/a.png" }, 9)).toBe(false);
  });

  it("normalizes custom domains and rejects malformed hosts", () => {
    expect(normalizeDomain("https://Quotes.JohnsMoving.com/path")).toBe("quotes.johnsmoving.com");
    expect(normalizeDomain("quotes.johnsmoving.com:443")).toBe("quotes.johnsmoving.com");
    expect(normalizeDomain("")).toBe("");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("-bad.example.com")).toBeNull();
  });

  it("produces theme variables and a display name", () => {
    const variables = brandingVariables({
      ...DEFAULT_BRANDING,
      brandColor: "#123456",
      background: { kind: "url", value: "https://cdn.example.test/bg.jpg" },
    });
    expect(variables["--proposal-brand"]).toBe("#123456");
    expect(variables["--proposal-background"]).toContain("bg.jpg");
    expect(brandingVariables(null)["--proposal-brand"]).toBe("#1d4ed8");
    expect(brandDisplayName({ ...DEFAULT_BRANDING, displayName: "  " }, "Workspace name")).toBe(
      "Workspace name",
    );
    expect(brandDisplayName({ ...DEFAULT_BRANDING, displayName: "Acme" }, "Workspace")).toBe(
      "Acme",
    );
  });
});
