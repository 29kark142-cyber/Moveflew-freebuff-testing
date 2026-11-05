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
          <div className="ws-stack" style={{ display: "grid", gap: 16 }}>
            <div>
              <p style={{ margin: 0 }}>
                <strong>
                  {data.remaining} of {data.included}
                </strong>{" "}
                credits remaining this month.
              </p>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: "var(--muted)",
                  marginTop: 8,
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
              <small style={{ color: "var(--muted-foreground)" }}>
                {data.used} used · {data.purchased} purchased · credits reset monthly with your
                plan.
              </small>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              }}
            >
              {data.packs.map((pack) => (
                <div key={pack.id} className="ws-card" style={{ padding: 14 }}>
                  <b>{pack.label}</b>
                  <p style={{ fontSize: 22, fontWeight: 700, margin: "4px 0" }}>
                    {dollars(pack.priceCents)}
                  </p>
                  <small style={{ color: "var(--muted-foreground)" }}>
                    {pack.credits} survey {pack.credits === 1 ? "scan" : "scans"}
                  </small>
                  <Button
                    className="ws-btn"
                    style={{ width: "100%", marginTop: 10 }}
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
                    className="ws-btn"
                    style={{ width: "100%", marginTop: 4, fontSize: 12 }}
                    disabled={Boolean(busy)}
                    onClick={() => void requestInvoice(pack.id)}
                  >
                    {busy === `invoice:${pack.id}` ? (
                      <Loader2 size={14} className="ws-spin" />
                    ) : null}{" "}
                    Request on invoice
                  </Button>
                </div>
              ))}
            </div>

            <p className="ws-helper">
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
        </Modal>
      )}
    </>
  );
}
