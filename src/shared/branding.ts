import { z } from "zod";

// White-label branding for workspace documents and public proposal pages. Stored in a
// workspace_records row (kind "branding") so no schema migration is required.

export const DEFAULT_BRAND_COLOR = "#1d4ed8";

export const brandImageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("url"),
      value: z
        .string()
        .trim()
        .max(2048)
        .url()
        .refine((value) => value.startsWith("https://"), "Use an HTTPS image URL"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("storage"),
      value: z
        .string()
        .trim()
        .regex(/^[1-9]\d*\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp)$/, "Invalid storage image"),
    })
    .strict(),
]);
export type BrandImage = z.infer<typeof brandImageSchema>;

export const brandingSchema = z
  .object({
    displayName: z.string().trim().max(120).default(""),
    logo: brandImageSchema.nullable().default(null),
    background: brandImageSchema.nullable().default(null),
    brandColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color")
      .default(DEFAULT_BRAND_COLOR),
    customDomain: z.string().trim().max(253).default(""),
  })
  .strict();

export type WorkspaceBranding = z.infer<typeof brandingSchema>;

export const DEFAULT_BRANDING: WorkspaceBranding = {
  displayName: "",
  logo: null,
  background: null,
  brandColor: DEFAULT_BRAND_COLOR,
  customDomain: "",
};

export function parseBranding(value: unknown): WorkspaceBranding {
  const parsed = brandingSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BRANDING;
}

/** Accepts "quotes.example.com", "https://quotes.example.com/path" or "" (no domain). */
export function normalizeDomain(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  const host = raw
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.replace(/:\d+$/, "")
    .trim();
  if (!host) return "";
  const valid = /^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(
    host,
  );
  return valid ? host : null;
}

export function isStorageImage(image: BrandImage | null | undefined, workspaceId: number): boolean {
  return image?.kind === "storage" && image.value.split("/")[0] === String(workspaceId);
}

/** Inline CSS variables that theme a public page with tenant branding. */
export function brandingVariables(
  branding: WorkspaceBranding | null | undefined,
): Record<string, string> {
  const brandColor =
    branding?.brandColor && /^#[0-9a-fA-F]{6}$/.test(branding.brandColor)
      ? branding.brandColor
      : DEFAULT_BRAND_COLOR;
  const variables: Record<string, string> = { "--proposal-brand": brandColor };
  const background = branding?.background;
  if (background?.kind === "url") variables["--proposal-background"] = `url("${background.value}")`;
  return variables;
}

export function brandDisplayName(
  branding: WorkspaceBranding | null | undefined,
  fallback: string,
): string {
  return branding?.displayName?.trim() || fallback;
}

export const POWERED_BY_LABEL = "Powered by MoveFlew";
