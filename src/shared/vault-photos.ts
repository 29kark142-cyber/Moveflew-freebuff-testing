// Vault inspection photos shared by the storage screen, the office job sheet and the customer
// tracking page. Photos are compressed JPEG data URLs on the vault; a sanitised copy is mirrored
// onto the linked job so the gallery never exposes vault contact details or notes.
export const VAULT_PHOTO_LIMIT = 6;
/** Keeps six photos inside the 900 KB CRM request cap. */
export const VAULT_PHOTO_MAX_CHARS = 120_000;
export const JOB_VAULT_LIMIT = 4;
export const JOB_VAULT_PHOTO_LIMIT = 6;
/** The public tracking feed carries fewer photos so the customer page stays light. */
export const PUBLIC_VAULT_LIMIT = 2;
export const PUBLIC_VAULT_PHOTO_LIMIT = 3;

const PHOTO_DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,/i;
const HTTPS_RE = /^https:\/\//i;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Only compressed raster data URLs or HTTPS links are ever rendered or mirrored. */
export function isVaultPhotoUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= VAULT_PHOTO_MAX_CHARS &&
    (PHOTO_DATA_RE.test(value) || HTTPS_RE.test(value))
  );
}

export type VaultPhotoKind = "inspection" | "asset";

export type VaultPhoto = {
  id: string;
  dataUrl: string;
  caption: string;
  kind: VaultPhotoKind;
  capturedAt: string;
};

/** Saved photos are untrusted JSONB: keep only well-formed, newest first, capped. */
export function vaultPhotos(value: unknown): VaultPhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      id: text(entry["id"], 60),
      dataUrl: typeof entry["dataUrl"] === "string" ? entry["dataUrl"] : "",
      caption: text(entry["caption"], 140),
      kind: entry["kind"] === "asset" ? ("asset" as const) : ("inspection" as const),
      capturedAt: text(entry["capturedAt"], 40),
    }))
    .filter(
      (photo) =>
        Boolean(photo.id) &&
        isVaultPhotoUrl(photo.dataUrl) &&
        Number.isFinite(Date.parse(photo.capturedAt)),
    )
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
    .slice(0, VAULT_PHOTO_LIMIT);
}

export function appendVaultPhoto(value: unknown, photo: VaultPhoto): VaultPhoto[] {
  return [photo, ...vaultPhotos(value).filter((entry) => entry.id !== photo.id)].slice(
    0,
    VAULT_PHOTO_LIMIT,
  );
}

export function removeVaultPhoto(value: unknown, id: string): VaultPhoto[] {
  return vaultPhotos(value).filter((entry) => entry.id !== id);
}

export type JobVaultAsset = { name: string; quantity: number };

export type JobVaultPhoto = {
  id: string;
  url: string;
  caption: string;
  capturedAt: string;
};

/** One linked vault's assets and photos, mirrored on the job for the office and customer views. */
export type JobVaultRecord = {
  vaultId: number;
  code: string;
  syncedAt: string;
  assets: JobVaultAsset[];
  photos: JobVaultPhoto[];
};

function jobAssets(value: unknown): JobVaultAsset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      name: text(entry["name"], 80) || "Stored item",
      quantity: Math.max(1, Math.round(Number(entry["quantity"]) || 1)),
    }))
    .slice(0, 40);
}

function jobPhotos(value: unknown): JobVaultPhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      id: text(entry["id"], 60),
      url: typeof entry["url"] === "string" ? entry["url"] : "",
      caption: text(entry["caption"], 140),
      capturedAt: text(entry["capturedAt"], 40),
    }))
    .filter(
      (photo) =>
        Boolean(photo.id) &&
        isVaultPhotoUrl(photo.url) &&
        Number.isFinite(Date.parse(photo.capturedAt)),
    )
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
    .slice(0, JOB_VAULT_PHOTO_LIMIT);
}

/** Defensive parse of the job's mirrored gallery. */
export function jobVaultGallery(value: unknown): JobVaultRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      vaultId: finite(entry["vaultId"]) ?? 0,
      code: text(entry["code"], 24).toUpperCase(),
      syncedAt: text(entry["syncedAt"], 40),
      assets: jobAssets(entry["assets"]),
      photos: jobPhotos(entry["photos"]),
    }))
    .filter((record) => record.vaultId > 0 && record.code)
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, JOB_VAULT_LIMIT);
}

/**
 * Snapshot one vault for the job. A linked vault with no assets and no photos has nothing to
 * show, so it is not mirrored at all.
 */
export function jobVaultRecord(
  vault: {
    id: number;
    code: string;
    items?: unknown;
    photos?: unknown;
  },
  at = new Date().toISOString(),
): JobVaultRecord | null {
  const code = text(vault.code, 24).toUpperCase();
  const photos = vaultPhotos(vault.photos).map((photo) => ({
    id: photo.id,
    url: photo.dataUrl,
    caption: photo.caption || `Vault ${code} inspection`,
    capturedAt: photo.capturedAt,
  }));
  const assets = jobAssets(vault.items);
  if (!photos.length && !assets.length) return null;
  return {
    vaultId: vault.id,
    code,
    syncedAt: at,
    assets,
    photos,
  };
}

/** Replaces this vault's entry, keeping the job gallery alphabetical and bounded. */
export function mergeJobVaultGallery(value: unknown, record: JobVaultRecord): JobVaultRecord[] {
  return [record, ...jobVaultGallery(value).filter((entry) => entry.vaultId !== record.vaultId)]
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, JOB_VAULT_LIMIT);
}

export type PublicVaultPhoto = JobVaultPhoto;
export type PublicVaultAsset = JobVaultAsset;
export type PublicVault = {
  code: string;
  assets: PublicVaultAsset[];
  photos: PublicVaultPhoto[];
};

/** Customer-safe slice: vault codes, asset names/quantities and captioned photos only. */
export function publicVaultGallery(value: unknown): PublicVault[] {
  return jobVaultGallery(value)
    .slice(0, PUBLIC_VAULT_LIMIT)
    .map((record) => ({
      code: record.code,
      assets: record.assets,
      photos: record.photos.slice(0, PUBLIC_VAULT_PHOTO_LIMIT),
    }));
}
