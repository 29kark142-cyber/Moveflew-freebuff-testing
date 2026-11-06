import { z } from "zod";

export const PRESETS = [
  { id: "enterprise", name: "Enterprise Light" },
  { id: "midnight", name: "Midnight Fleet" },
  { id: "driver", name: "Emerald Driver" },
  { id: "bronze", name: "Warm Bronze" },
  { id: "contrast", name: "High Contrast" },
] as const;

export const ACCENTS = [
  { id: "brand", name: "MoveFlew Blue" },
  { id: "emerald", name: "Emerald" },
  { id: "violet", name: "Violet" },
  { id: "ocean", name: "Ocean Blue" },
  { id: "amber", name: "Amber" },
  { id: "crimson", name: "Crimson" },
  { id: "cyan", name: "Cyan" },
  { id: "rose", name: "Rose" },
  { id: "slate", name: "Slate" },
] as const;

export const THEME_MODES = [
  { id: "light", name: "Light", description: "Bright surfaces for daytime office work." },
  { id: "dark", name: "Dark", description: "Lower-glare surfaces for long dispatch shifts." },
  { id: "system", name: "System", description: "Follow the device appearance automatically." },
] as const;

export const DENSITIES = [
  { id: "comfortable", name: "Comfortable", description: "Roomier cards and controls for everyday navigation." },
  { id: "compact", name: "Compact", description: "Tighter rows and controls for dispatch and CRM tables." },
] as const;

export const ELEVATIONS = [
  { id: "flat", name: "Flat", description: "Quiet surfaces with no lifted shadow." },
  { id: "border", name: "Subtle border", description: "Crisp outlines with a restrained shadow." },
  { id: "elevated", name: "Elevated shadow", description: "Layered depth for dashboards and overlays." },
] as const;

export type ThemeMode = (typeof THEME_MODES)[number]["id"];
export type ResolvedThemeMode = "light" | "dark";
export type Density = (typeof DENSITIES)[number]["id"];
export type CardElevation = (typeof ELEVATIONS)[number]["id"];

export const wallpaperSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("url"),
      value: z.string().url().max(2048).refine((v) => {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "Use an HTTPS image URL"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("storage"),
      value: z
        .string()
        .regex(/^[1-9]\d*\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/)
        .max(200),
    })
    .strict(),
]);

export const appearanceSchema = z
  .object({
    preset: z.enum(["enterprise", "midnight", "driver", "bronze", "contrast"]),
    accent: z.enum([
      "brand",
      "emerald",
      "violet",
      "ocean",
      "amber",
      "crimson",
      "cyan",
      "rose",
      "slate",
    ]),
    mode: z.enum(["light", "dark", "system"]).default("light"),
    density: z.enum(["comfortable", "compact"]).default("comfortable"),
    elevation: z.enum(["flat", "border", "elevated"]).default("border"),
    wallpaper: wallpaperSchema.nullable(),
  })
  .strict();

export type WorkspaceAppearance = z.infer<typeof appearanceSchema>;

export const DEFAULT_APPEARANCE: WorkspaceAppearance = {
  preset: "enterprise",
  accent: "emerald",
  mode: "light",
  density: "comfortable",
  elevation: "border",
  wallpaper: null,
};

export function parseAppearance(value: unknown): WorkspaceAppearance {
  const parsed = appearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

export function resolveThemeMode(mode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  return mode === "system" ? (prefersDark ? "dark" : "light") : mode;
}

export function appearanceKey(userId: string, workspaceId: number) {
  return `moveflew.appearance.${userId}.${workspaceId}`;
}

export function canSaveAppearance(role: string, writable: boolean) {
  return writable && ["admin", "office_admin"].includes(role);
}

export function validWallpaperScope(appearance: WorkspaceAppearance, workspaceId: number) {
  return (
    appearance.wallpaper?.kind !== "storage" ||
    appearance.wallpaper.value.split("/")[0] === String(workspaceId)
  );
}
