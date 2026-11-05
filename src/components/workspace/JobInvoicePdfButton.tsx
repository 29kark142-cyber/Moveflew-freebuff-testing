import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";
import type { DamagePhoto } from "@shared/damage";
import type { StorageVault } from "@shared/storage-vaults";

type JobLike = Record<string, unknown> & { id: number };

/**
 * Downloads a formatted invoice/estimate PDF built in the browser from records the
 * caller can already open. Optional data (photos, vault fees) is skipped rather than
 * blocking the download when a role or screen cannot read it.
 */
export default function JobInvoicePdfButton({
  job,
  className,
}: {
  job: JobLike;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [settings, photos, vaults] = await Promise.all([
        crmFetch<{ officeEmail?: string; companyName?: string; phone?: string }>(
          "/field/settings",
        ).catch(() => null),
        crmFetch<DamagePhoto[]>(`/field/jobs/${job.id}/photos`).catch(() => [] as DamagePhoto[]),
        crmFetch<StorageVault[]>("/vaults").catch(() => [] as StorageVault[]),
      ]);
      const customerId = Number(job.customerId ?? 0);
      const jobVaults = vaults.filter(
        (vault) =>
          (vault.jobId !== null && vault.jobId === job.id) ||
          (customerId > 0 && vault.customerId === customerId),
      );
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf");
      await downloadInvoicePdf({
        job,
        company: {
          name: settings?.companyName || "MoveFlew",
          phone: settings?.phone || "",
          email: settings?.officeEmail || "",
        },
        photos,
        signature: typeof job.completedSignature === "string" ? job.completedSignature : null,
        vaults: jobVaults,
      });
      toast.success("Invoice PDF downloaded");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not build the invoice PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" className={className} disabled={busy} onClick={() => void download()}>
      {busy ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
      Download PDF Invoice
    </Button>
  );
}
