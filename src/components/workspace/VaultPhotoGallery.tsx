import { Camera, Warehouse } from "lucide-react";
import { Link } from "@/lib/wouter";
import type { Job } from "@shared/crm";
import { jobVaultGallery } from "@shared/vault-photos";

const captured = (iso: string): string => {
  const at = new Date(iso);
  return Number.isFinite(at.getTime())
    ? at.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
};

/**
 * Office job-sheet gallery for vault inspection photos mirrored from `/app/storage`. Reads the
 * sanitised copy on the job record, so it never loads vault contact details or billing fields.
 */
export default function VaultPhotoGallery({ job }: { job: Job }) {
  const vaults = jobVaultGallery(job.vaultGallery);
  if (!vaults.length) {
    return (
      <section className="ws-card ws-card-pad" data-tour="vault-gallery">
        <div className="ws-card-title">
          <div>
            <h2>Vault Assets &amp; Photos</h2>
            <p>Inspection photos and stored assets linked from the warehouse vaults.</p>
          </div>
          <Warehouse size={18} />
        </div>
        <p className="ws-helper">
          No vault photos are linked to this job yet. Open{" "}
          <Link href="/app/storage" className="underline">
            Storage
          </Link>{" "}
          and add inspection photos to a vault linked to this job.
        </p>
      </section>
    );
  }

  return (
    <section className="ws-card ws-card-pad" data-tour="vault-gallery">
      <div className="ws-card-title">
        <div>
          <h2>Vault Assets &amp; Photos</h2>
          <p>Synced from the storage vaults linked to this move.</p>
        </div>
        <Camera size={18} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {vaults.map((vault) => (
          <article key={vault.vaultId} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>Vault {vault.code}</b>
              <span className="text-xs text-muted-foreground">
                {vault.photos.length} photo{vault.photos.length === 1 ? "" : "s"} ·{" "}
                {vault.assets.length} asset{vault.assets.length === 1 ? "" : "s"}
              </span>
            </div>
            {vault.assets.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {vault.assets.map((asset, index) => (
                  <li
                    key={`${asset.name}-${index}`}
                    className="rounded-full border border-border px-2 py-0.5"
                  >
                    {asset.name} × {asset.quantity}
                  </li>
                ))}
              </ul>
            )}
            {vault.photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {vault.photos.map((photo) => (
                  <figure key={photo.id} className="space-y-1">
                    <a href={photo.url} target="_blank" rel="noreferrer">
                      <img
                        src={photo.url}
                        alt={photo.caption || `Vault ${vault.code} inspection photo`}
                        loading="lazy"
                        className="h-28 w-full rounded-lg border border-border object-cover"
                      />
                    </a>
                    <figcaption className="text-[11px] leading-tight text-muted-foreground">
                      {photo.caption}
                      {photo.capturedAt ? ` · ${captured(photo.capturedAt)}` : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No inspection photos saved.</p>
            )}
          </article>
        ))}
      </div>
      <p className="ws-helper">
        Gallery photos come from linked vaults in{" "}
        <Link href="/app/storage" className="underline">
          Storage
        </Link>
        . Editing a vault re-syncs its latest photos and assets.
      </p>
    </section>
  );
}
