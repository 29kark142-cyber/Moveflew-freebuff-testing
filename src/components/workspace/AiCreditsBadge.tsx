import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal, useRemote } from "@/components/workspace/WorkspaceUI";
import { crmFetch } from "@/lib/crm";

type ScanPack = { id: string; credits: number; priceCents: number; label: string };
type PendingRequest = {
  id: number;
  packId: string;
  credits: number;
  amountCents: number;
  status?: string;
  requestedAt: string;
};
type CreditsInfo = {
  planId: string;
  included: number;
  purchased: number;
  used: number;
  remaining: number;
  percent: number;
  packs: ScanPack[];
  checkoutConfigured: boolean;
  pending: PendingRequest[];
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Plan-funded AI room survey credits, with a scan pack request modal. */
export default function AiCreditsBadge() {
  const { data, loading, refresh } = useRemote(() => crmFetch<CreditsInfo>("/ai-credits"), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");

  if (loading || !data) return null;

  const buy = async (packId: string) => {
    setBusy(`checkout:${packId}`);
    try {
      const result = await crmFetch<{ url: string }>("/ai-credits/checkout", {
        method: "POST",
        body: JSON.stringify({ packId }),
      });
      if (!result.url) throw new Error("Stripe did not return a checkout link.");
      window.location.assign(result.url);
      return;
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not start checkout");
    } finally {
      setBusy("");
    }
  };

  const requestInvoice = async (packId: string) => {
    setBusy(`invoice:${packId}`);
    try {
      await crmFetch("/ai-credits/purchase", { method: "POST", body: JSON.stringify({ packId }) });
      toast.success("Scan pack requested. Credits are added once payment is confirmed.");
      await refresh();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not request the scan pack");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <button
        type="button"
        className="ws-chip blue"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        onClick={() => setOpen(true)}
        aria-label="AI Room Survey Credits"
      >
        <Sparkles size={14} />
        AI Room Survey Credits: {data.remaining} / {data.included}
      </button>
      {open && (
        <Modal title="AI Room Survey Credits" onClose={() => setOpen(false)}>
          <div className="max-h-[85vh] overflow-y-auto p-4 md:p-6">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <p className="m-0 text-sm leading-normal">
                  <strong>
                    {data.remaining} of {data.included}
                  </strong>{" "}
                  credits remaining this month.
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={data.included}
                  aria-valuenow={data.remaining}
                  aria-label="Credit balance"
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: "var(--muted)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${data.percent}%`,
                      background: "var(--primary)",
                    }}
                  />
                </div>
                <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                  {data.used} used · {data.purchased} purchased · credits reset monthly with your
                  plan.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {data.packs.map((pack) => (
                  <div
                    key={pack.id}
                    className="ws-card flex flex-col gap-1"
                    style={{ padding: 16 }}
                  >
                    <b className="text-sm leading-snug">{pack.label}</b>
                    <p className="m-0 text-2xl font-bold leading-tight">
                      {dollars(pack.priceCents)}
                    </p>
                    <small className="text-muted-foreground">
                      {pack.credits} survey {pack.credits === 1 ? "scan" : "scans"}
                    </small>
                    <div className="mt-3 grid gap-2">
                      <Button
                        className="ws-btn w-full"
                        style={{ margin: 0 }}
                        disabled={Boolean(busy)}
                        onClick={() => void buy(pack.id)}
                      >
                        {busy === `checkout:${pack.id}` ? (
                          <Loader2 size={14} className="ws-spin" />
                        ) : null}{" "}
                        Buy Scan Pack
                      </Button>
                      <Button
                        variant="ghost"
                        className="ws-btn w-full text-xs"
                        style={{ margin: 0 }}
                        disabled={Boolean(busy)}
                        onClick={() => void requestInvoice(pack.id)}
                      >
                        {busy === `invoice:${pack.id}` ? (
                          <Loader2 size={14} className="ws-spin" />
                        ) : null}{" "}
                        Request on invoice
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="ws-helper" style={{ margin: 0 }}>
                {data.checkoutConfigured
                  ? "Buy opens a secure Stripe Checkout. Credits activate only after Stripe confirms payment."
                  : "Online checkout is not configured yet. Request a pack and it is added to your next invoice once payment is confirmed."}
              </p>

              {data.pending.length > 0 && (
                <div>
                  <b>Pending requests</b>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {data.pending.map((item) => (
                      <li key={item.id}>
                        {item.credits} credits · {dollars(item.amountCents)}
                        {item.status ? ` · ${item.status.replace(/_/g, " ")}` : ""} · requested{" "}
                        {new Date(item.requestedAt).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
