import { useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import { getStripe, getStripeEnvironment, paymentsConfigured, paymentsTestMode } from "@/lib/stripe";
import { createProposalDepositCheckout } from "@/lib/proposal-payments.functions";

export default function DepositPayment({ token, depositCents, paid, signed }: { token: string; depositCents: number; paid: boolean; signed: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const returned = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("session_id");
  const options = useMemo(() => ({
    fetchClientSecret: async () => {
      const result = await createProposalDepositCheckout({ data: {
        token, environment: getStripeEnvironment(),
        returnUrl: `${window.location.origin}/proposal/${token}?session_id={CHECKOUT_SESSION_ID}`,
      } });
      if ("error" in result) { setError(result.error); setOpen(false); throw new Error(result.error); }
      return result.clientSecret;
    },
  }), [token]);

  if (paid) return <p className="text-primary">Deposit received · booking confirmed</p>;
  if (returned) return <p className="text-primary">Thank you — your deposit payment was submitted. The office will confirm your booking shortly.</p>;
  if (depositCents === 0) return <p className="text-sm text-muted-foreground">No deposit required on this proposal. Contact the office to confirm your booking.</p>;
  if (!paymentsConfigured) return <p className="text-sm text-muted-foreground">Online payment isn't available yet. Contact the office to complete your booking.</p>;
  if (!signed) return <p className="text-sm text-muted-foreground">Sign the estimate above to pay your deposit online.</p>;

  return (
    <div className="space-y-3">
      {paymentsTestMode && <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">Test mode — no real money is charged in the preview.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {open ? (
        <div id="checkout"><EmbeddedCheckoutProvider stripe={getStripe()} options={options}><EmbeddedCheckout /></EmbeddedCheckoutProvider></div>
      ) : (
        <Button onClick={() => { setError(""); setOpen(true); }}><CreditCard size={15} /> Pay deposit</Button>
      )}
    </div>
  );
}
