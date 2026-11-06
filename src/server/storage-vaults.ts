// Mirrors a vault's assets and inspection photos onto its linked job, so the office job sheet
// and the customer tracking page render one sanitised gallery instead of raw vault records.
import { appendJobActivity } from "../shared/job-activity";
import {
  jobVaultRecord,
  mergeJobVaultGallery,
  vaultPhotos,
  type JobVaultRecord,
} from "../shared/vault-photos";

export type VaultSyncInput = {
  id: number;
  code: string;
  jobId: number | null;
  items: unknown;
  photos?: unknown;
};

export type VaultSyncDeps = {
  getJob: (id: number) => Promise<{ id: number; data: Record<string, unknown> }>;
  saveJob: (id: number, patch: Record<string, unknown>) => Promise<unknown>;
  actor: string;
  at?: string;
};

export type VaultJobSync = {
  synced: boolean;
  jobId: number | null;
  photoCount: number;
  assetCount: number;
};

const EMPTY: VaultJobSync = { synced: false, jobId: null, photoCount: 0, assetCount: 0 };

const photoSignature = (record: JobVaultRecord) => record.photos.map((photo) => photo.id).join(",");

/**
 * Saves the gallery and one timeline event, but only when the linked vault changed. Repeated
 * saves of an unchanged vault leave the job payload and activity log untouched.
 */
export async function syncVaultToJob(
  deps: VaultSyncDeps,
  vault: VaultSyncInput,
): Promise<VaultJobSync> {
  if (!vault.jobId) return EMPTY;
  const record = jobVaultRecord(
    { id: vault.id, code: vault.code, items: vault.items, photos: vault.photos },
    deps.at,
  );
  if (!record) return { ...EMPTY, jobId: vault.jobId };

  let job: { id: number; data: Record<string, unknown> };
  try {
    job = await deps.getJob(vault.jobId);
  } catch {
    // A vault can outlive the job it was linked to; saving the vault must still succeed.
    return { ...EMPTY, jobId: vault.jobId };
  }

  const gallery = mergeJobVaultGallery(job.data["vaultGallery"], record);
  const previous = Array.isArray(job.data["vaultGallery"])
    ? (job.data["vaultGallery"] as { vaultId?: unknown; photos?: unknown }[]).find(
        (entry) => Number(entry?.vaultId) === record.vaultId,
      )
    : undefined;
  const changed =
    !previous ||
    JSON.stringify(previous.photos ?? []) !== JSON.stringify(record.photos) ||
    JSON.stringify((previous as { assets?: unknown }).assets ?? []) !==
      JSON.stringify(record.assets);

  const patch: Record<string, unknown> = { vaultGallery: gallery };
  if (changed) {
    patch["activity"] = appendJobActivity(job.data["activity"], [
      {
        id: `vault-photos:${record.vaultId}:${photoSignature(record)}:${record.assets.length}`,
        kind: "vault_photos_synced",
        title: "Vault Photos Synced",
        detail: `${record.code} · ${record.photos.length} photo(s) · ${record.assets.length} asset(s)`,
        at: record.syncedAt,
        by: deps.actor,
      },
    ]);
  }
  await deps.saveJob(job.id, patch);
  return {
    synced: true,
    jobId: job.id,
    photoCount: record.photos.length,
    assetCount: record.assets.length,
  };
}
