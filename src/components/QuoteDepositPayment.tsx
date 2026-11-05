import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@shared/crm";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe Payment Element for the quote deposit. `confirmPayment` stays on this page when no
 * extra action is needed, so the caller can verify the payment server-side and book the job.
 */
export default function QuoteDepositPayment({
  clientSecret,
  amountCents,
  onPaid,
}: {
  clientSecret: string;
  amountCents: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
}) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <DepositForm amountCents={amountCents} onPaid={onPaid} />
    </Elements>
  );
}

function DepositForm({
  amountCents,
  onPaid,
}: {
  amountCents: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "The card payment was not completed.");
        return;
      }
      const intentId = result.paymentIntent?.id;
      if (!intentId) {
        setError("The payment did not return a transaction id. Contact the office to confirm.");
        return;
      }
      await onPaid(intentId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The card payment failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="min-h-12 w-full" disabled={busy || !stripe} onClick={() => void pay()}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
        {busy ? "Processing…" : `Pay ${money(amountCents / 100)} deposit & confirm`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Card details are handled by Stripe. Your booking is confirmed only after the payment is
        verified on our server.
      </p>
    </div>
  );
}
