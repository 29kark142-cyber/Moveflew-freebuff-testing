import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  PRESETS,
  appearanceKey,
  appearanceSchema,
  canSaveAppearance,
  parseAppearance,
  resolveThemeMode,
  validWallpaperScope,
} from "./workspace-appearance";

describe("workspace appearance", () => {
  it("offers all five requested presets", () => {
    expect(PRESETS.map((p) => p.name)).toEqual([
      "Enterprise Light",
      "Midnight Fleet",
      "Emerald Driver",
      "Warm Bronze",
      "High Contrast",
    ]);
  });

  it("offers the MoveFlew brand accent alongside the existing palette", () => {
    expect(ACCENTS.map((a) => a.id)).toEqual([
      "brand",
      "emerald",
      "violet",
      "ocean",
      "amber",
      "crimson",
      "cyan",
      "rose",
      "slate",
    ]);
    expect(ACCENTS.find((a) => a.id === "brand")?.name).toBe("MoveFlew Blue");
  });

  it("migrates legacy saved appearance values with safe defaults", () => {
    expect(
      parseAppearance({ preset: "enterprise", accent: "emerald", wallpaper: null }),
    ).toEqual(DEFAULT_APPEARANCE);
    expect(DEFAULT_APPEARANCE.mode).toBe("light");
    expect(DEFAULT_APPEARANCE.density).toBe("comfortable");
    expect(DEFAULT_APPEARANCE.elevation).toBe("border");
  });

  it("resolves light, dark, and system theme modes", () => {
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });

  it("rejects unsafe or credential-bearing wallpaper links", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.com/image.jpg",
      "https://user:password@example.com/image.jpg",
    ])
      expect(
        appearanceSchema.safeParse({
          ...DEFAULT_APPEARANCE,
          wallpaper: { kind: "url", value: url },
        }).success,
      ).toBe(false);
    expect(
      appearanceSchema.safeParse({
        ...DEFAULT_APPEARANCE,
        wallpaper: { kind: "url", value: "https://example.com/image.jpg" },
      }).success,
    ).toBe(true);
  });

  it("rejects wallpapers stored under another workspace", () => {
    const value = appearanceSchema.parse({
      ...DEFAULT_APPEARANCE,
      wallpaper: { kind: "storage", value: "12/abc.webp" },
    });
    expect(validWallpaperScope(value, 12)).toBe(true);
    expect(validWallpaperScope(value, 13)).toBe(false);
  });

  it("allows manager saves only in writable workspaces", () => {
    expect(canSaveAppearance("admin", true)).toBe(true);
    expect(canSaveAppearance("office_admin", true)).toBe(true);
    for (const role of ["crew", "dispatcher", "estimator"])
      expect(canSaveAppearance(role, true)).toBe(false);
    expect(canSaveAppearance("admin", false)).toBe(false);
  });

  it("isolates local preferences by user and workspace", () => {
    expect(appearanceKey("alice", 1)).not.toBe(appearanceKey("bob", 1));
    expect(appearanceKey("alice", 1)).not.toBe(appearanceKey("alice", 2));
    expect(parseAppearance({ preset: "not-a-theme" })).toEqual(DEFAULT_APPEARANCE);
  });
});
