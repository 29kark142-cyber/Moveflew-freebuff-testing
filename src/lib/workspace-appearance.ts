import { z } from "zod";

export const PRESETS = [{ id: "enterprise", name: "Enterprise Light" }, { id: "midnight", name: "Midnight Fleet" }, { id: "driver", name: "Emerald Driver" }, { id: "bronze", name: "Warm Bronze" }, { id: "contrast", name: "High Contrast" }] as const;
export const ACCENTS = [{ id: "emerald", name: "Emerald" }, { id: "violet", name: "Violet" }, { id: "ocean", name: "Ocean Blue" }, { id: "amber", name: "Amber" }, { id: "crimson", name: "Crimson" }, { id: "cyan", name: "Cyan" }, { id: "rose", name: "Rose" }, { id: "slate", name: "Slate" }] as const;
export const wallpaperSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), value: z.string().url().max(2048).refine(v => { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; }, "Use an HTTPS image URL") }).strict(),
  z.object({ kind: z.literal("storage"), value: z.string().regex(/^[1-9]\d*\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/).max(200) }).strict(),
]);
export const appearanceSchema = z.object({
  preset: z.enum(["enterprise", "midnight", "driver", "bronze", "contrast"]),
  accent: z.enum(["emerald", "violet", "ocean", "amber", "crimson", "cyan", "rose", "slate"]),
  wallpaper: wallpaperSchema.nullable(),
}).strict();
export type WorkspaceAppearance = z.infer<typeof appearanceSchema>;
export const DEFAULT_APPEARANCE: WorkspaceAppearance = { preset: "enterprise", accent: "emerald", wallpaper: null };
export function parseAppearance(value: unknown): WorkspaceAppearance { const parsed = appearanceSchema.safeParse(value); return parsed.success ? parsed.data : DEFAULT_APPEARANCE; }
export function appearanceKey(userId: string, workspaceId: number) { return `moveflew.appearance.${userId}.${workspaceId}`; }
export function canSaveAppearance(role: string, writable: boolean) { return writable && ["admin", "office_admin"].includes(role); }
export function validWallpaperScope(appearance: WorkspaceAppearance, workspaceId: number) { return appearance.wallpaper?.kind !== "storage" || appearance.wallpaper.value.split("/")[0] === String(workspaceId); }