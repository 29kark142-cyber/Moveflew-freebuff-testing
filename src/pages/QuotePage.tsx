import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import Brand from "@/components/Brand";
import SignaturePad from "@/components/workspace/SignaturePad";
import QuoteDepositPayment from "@/components/QuoteDepositPayment";
import { formatDate, LoadingBlock } from "@/components/workspace/WorkspaceUI";
import { readQuote, type PublicQuote } from "@/lib/quote.functions";
import { paymentsConfigured } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { money } from "@shared/crm";
import { QUOTE_TERMS_HREF, QUOTE_TERMS_LABEL } from "@shared/quote-accept";
import {
  PACKING_MATERIALS,
  PACKING_SERVICES,
  parsePackingSelection,
  type PackingSelection,
} from "@shared/packing";
import "@/workspace.css";

const hourLabel = (value = 8) => {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

type AcceptResult = {
  reference: string;
  depositCents: number;
  paymentId: string;
  paymentMode: string;
  confirmation: { email: string; sms: string };
};

const postJson = async (url: string, body?: unknown) => {
  const response = await fetch(url, {
    method: "POST",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data["error"] ?? "Something went wrong"));
  return data;
};

/**
 * Public quote portal: read-only estimate that becomes an interactive booking flow —
 * terms acceptance, customer signature, and the deposit payment that books the job.
 */
export default function QuotePage({ token }: { token?: string }) {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<{ clientSecret: string; amountCents: number } | null>(null);
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [packing, setPacking] = useState<PackingSelection>({ materials: {}, services: [] });
  const [packingBusy, setPackingBusy] = useState(false);
  const [packingError, setPackingError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const next = await readQuote({ data: { token: token ?? "" } });
        setQuote(next);
        setPacking(next.packing);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "This quote could not be found.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  useEffect(() => {
    if (quote?.customerName) setName((current) => current || quote.customerName);
  }, [quote?.customerName]);

  const resolvedToken = token ?? "";
  const accepted = Boolean(result) || Boolean(quote?.acceptance);
  const ready = Boolean(signature) && terms;

  const accept = async (payment: { paymentIntentId?: string; paymentMode?: "test" }) => {
    if (packingBusy) return setError("Wait for the packing selection to finish saving.");
    if (!signature) return setError("Please sign in the box before confirming your booking.");
    if (!terms) return setError("Please accept the terms of service and cancellation policy.");
    setBusy(true);
    setError("");
    try {
      const data = await postJson(`/api/quote/${resolvedToken}/accept`, {
        signature,
        termsAccepted: true,
        customerName: name.trim(),
        ...payment,
      });
      setResult(data as unknown as AcceptResult);
      setQuote(await readQuote({ data: { token: resolvedToken } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not accept this quote.");
    } finally {
      setBusy(false);
    }
  };

  const savePacking = async (next: PackingSelection) => {
    const previous = packing;
    setPacking(next);
    setPackingBusy(true);
    setPackingError("");
    try {
      const data = await postJson(`/api/quote/${resolvedToken}/packing`, { selection: next });
      setQuote((current) => {
        if (!current) return current;
        const lines = Array.isArray(data["lines"])
          ? (data["lines"] as { label?: unknown; amountCents?: unknown }[]).map((line) => ({
              label: String(line.label ?? ""),
              amount: (Number(line.amountCents) || 0) / 100,
            }))
          : current.packingLines;
        return {
          ...current,
          packing: parsePackingSelection(data["selection"]),
          packingSubtotal: (Number(data["subtotalCents"]) || 0) / 100,
          packingLines: lines,
          total: Number(data["total"]) || current.total,
          depositCents: Number(data["depositCents"]) || 0,
        };
      });
    } catch (reason) {
      setPacking(previous);
      setPackingError(
        reason instanceof Error ? reason.message : "Could not update the packing selection.",
      );
    } finally {
      setPackingBusy(false);
    }
  };

  const setMaterial = (id: string, quantity: number) => {
    const materials = { ...packing.materials };
    if (quantity > 0) materials[id] = quantity;
    else delete materials[id];
    void savePacking(parsePackingSelection({ ...packing, materials }));
  };

  const toggleService = (id: string) => {
    const services = packing.services.includes(id)
      ? packing.services.filter((service) => service !== id)
      : [...packing.services, id];
    void savePacking(parsePackingSelection({ ...packing, services }));
  };

  const startPayment = async () => {
    if (packingBusy) return setError("Wait for the packing selection to finish saving.");
    setBusy(true);
    setError("");
    try {
      const data = await postJson(`/api/quote/${resolvedToken}/deposit-intent`);
      setIntent({
        clientSecret: String(data["clientSecret"] ?? ""),
        amountCents: Number(data["amountCents"]) || 0,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Card payment is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="ws-proposal-page">
        <div className="ws-proposal">
          <LoadingBlock label="Loading your quote…" />
        </div>
      </div>
    );

  if (error && !quote)
    return (
      <div className="ws-proposal-page">
        <div className="ws-public-error">
          <CircleAlert size={26} />
          <h1>Quote unavailable</h1>
          <p>{error || "This quote link is unavailable or has expired."}</p>
        </div>
      </div>
    );

  if (!quote) return null;

  const phone = quote.company.phone.replace(/[^\d+]/g, "");
  const deposit = money(quote.depositCents / 100);
  const receipt = result?.paymentId ?? quote.acceptance?.paymentId ?? "";
  const paymentMode = result?.paymentMode ?? quote.acceptance?.mode ?? "";

  return (
    <div className="ws-proposal-page">
      <main className="ws-proposal">
        <header className="ws-proposal__head">
          <Brand />
          <span className="ws-chip">{quote.reference}</span>
        </header>

        <h1>Your moving quote</h1>
        <p className="ws-helper">
          Prepared for {quote.customerName || "you"} by {quote.company.name || "your mover"}
          {quote.sentAt ? ` · sent ${new Date(quote.sentAt).toLocaleDateString()}` : ""}
        </p>

        <section className="ws-quote-lines" style={{ marginTop: 20 }}>
          <div>
            <span>Move date</span>
            <strong>
              {quote.moveDate ? formatDate(quote.moveDate) : "To be confirmed"} ·{" "}
              {hourLabel(quote.startHour)}
            </strong>
          </div>
          <div>
            <span>Crew</span>
            <strong>
              {quote.crewSize} mover{quote.crewSize === 1 ? "" : "s"}
            </strong>
          </div>
          {quote.distanceMiles > 0 && (
            <div>
              <span>Route distance</span>
              <strong>
                {quote.distanceMiles} mi
                {quote.travelMinutes ? ` · ${quote.travelMinutes} min` : ""}
              </strong>
            </div>
          )}
          {quote.lines.map((line) => (
            <div key={line.label}>
              <span>{line.label}</span>
              <strong>{money(line.amount)}</strong>
            </div>
          ))}
          {quote.surge && quote.surge.amount > 0 && (
            <p className="ws-helper" style={{ marginTop: 10 }} role="note">
              Seasonal pricing is included in the lines above: {quote.surge.percent}% based on
              your move date. It is shown separately so you can see exactly what changed.
            </p>
          )}
        </section>

        <section
          className="ws-card ws-card-pad"
          style={{ marginTop: 20 }}
          aria-labelledby="quote-packing"
        >
          <h2 id="quote-packing" style={{ marginTop: 0 }}>
            Packing supplies &amp; add-ons
          </h2>
          <p className="ws-helper">
            Optional. Boxes, wrap and covers are delivered with the crew. Your total and deposit
            update as you choose, and nothing is charged until you pay the deposit.
          </p>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              marginTop: 12,
            }}
          >
            {PACKING_MATERIALS.map((material) => {
              const quantity = packing.materials[material.id] ?? 0;
              return (
                <div
                  key={material.id}
                  style={{
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <strong style={{ display: "block", fontSize: 14 }}>{material.label}</strong>
                  <span className="ws-helper">
                    {money(material.unitCents / 100)} / {material.unit}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      className="ws-btn"
                      aria-label={`Remove one ${material.label}`}
                      disabled={packingBusy || quantity === 0}
                      onClick={() => setMaterial(material.id, quantity - 1)}
                    >
                      −
                    </button>
                    <span aria-live="polite" style={{ minWidth: 18, textAlign: "center" }}>
                      {quantity}
                    </span>
                    <button
                      type="button"
                      className="ws-btn"
                      aria-label={`Add one ${material.label}`}
                      disabled={packingBusy || quantity >= material.max}
                      onClick={() => setMaterial(material.id, quantity + 1)}
                    >
                      +
                    </button>
                    <span className="ws-helper" style={{ marginLeft: "auto" }}>
                      {money((quantity * material.unitCents) / 100)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <h3 style={{ marginBottom: 6, marginTop: 16 }}>Add-on services</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {PACKING_SERVICES.map((service) => (
              <label key={service.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={packing.services.includes(service.id)}
                  disabled={packingBusy}
                  onChange={() => toggleService(service.id)}
                />
                <span>
                  <strong>
                    {service.label} · {money(service.amountCents / 100)}
                  </strong>
                  <br />
                  <span className="ws-helper">{service.description}</span>
                </span>
              </label>
            ))}
          </div>
          {packingError && (
            <p role="alert" className="ws-helper" style={{ color: "#b91c1c" }}>
              {packingError}
            </p>
          )}
          {packingBusy && (
            <p className="ws-helper" role="status">
              Updating your total…
            </p>
          )}
        </section>

        <div className="ws-quote-total">
          <span>
            <small>Estimated total</small>
            <br />
            Final charges are confirmed on the signed bill of lading.
          </span>
          <b>{money(quote.total)}</b>
        </div>
        {quote.packingSubtotal > 0 && (
          <p className="ws-helper" style={{ marginTop: 8 }}>
            Includes {money(quote.packingSubtotal)} of packing supplies and add-on services.
          </p>
        )}

        {(quote.origin || quote.destination) && (
          <p className="ws-helper" style={{ marginTop: 16 }}>
            <MapPin size={14} /> {quote.origin || "Pickup to be confirmed"} →{" "}
            {quote.destination || "Drop-off to be confirmed"}
          </p>
        )}

        {accepted ? (
          <section
            className="ws-card ws-card-pad"
            style={{ marginTop: 24 }}
            aria-labelledby="quote-confirmed"
          >
            <h2 id="quote-confirmed" className="text-lg font-semibold text-foreground">
              <CheckCircle2 className="mr-1 inline" size={18} /> Booking confirmed
            </h2>
            <p className="ws-helper">
              Deposit {money((quote.acceptance?.amountCents ?? result?.depositCents ?? 0) / 100)}{" "}
              received · receipt {receipt || "recorded"}
              {paymentMode === "test" ? " (test mode)" : ""}
            </p>
            <p className="ws-helper">
              Signed{" "}
              {quote.acceptance?.signedAt
                ? new Date(quote.acceptance.signedAt).toLocaleString()
                : "and recorded on your booking"}
              . Your confirmation has been sent
              {quote.acceptance?.confirmation.email === "accepted" ? " by email" : ""}
              {quote.acceptance?.confirmation.sms === "accepted" ? " by SMS" : ""}.
            </p>
            {quote.acceptance?.signature && (
              <img
                src={quote.acceptance.signature}
                alt="Your signature on the booking"
                className="mt-2 h-20 rounded-md border border-border bg-background object-contain"
              />
            )}
            <p className="ws-helper">
              Reference {quote.reference}. The office will call before move day to confirm arrival
              details.
            </p>
          </section>
        ) : (
          <section
            className="ws-card ws-card-pad"
            style={{ marginTop: 24 }}
            aria-labelledby="quote-book"
          >
            <h2 id="quote-book" className="text-lg font-semibold text-foreground">
              Book this move
            </h2>
            <p className="ws-helper">
              {quote.depositCents > 0
                ? `Deposit due today: ${deposit}. It is applied to your final balance.`
                : "No deposit is due on this quote — sign below to confirm your booking."}
            </p>

            <div className="mt-3 space-y-3">
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={terms}
                  onChange={(event) => setTerms(event.target.checked)}
                />
                <span>
                  {QUOTE_TERMS_LABEL.replace("MoveFlew Terms of Service", "")}
                  <a className="underline" href={QUOTE_TERMS_HREF} target="_blank" rel="noreferrer">
                    MoveFlew Terms of Service
                  </a>{" "}
                  and Cancellation Policy
                </span>
              </label>

              <label className="block space-y-1 text-sm font-medium text-foreground">
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                />
              </label>

              <SignaturePad
                onChange={setSignature}
                label="Sign here to accept your quote and booking terms"
              />
              {signature && (
                <img
                  src={signature}
                  alt="Captured signature"
                  className="h-16 w-full rounded-md border border-border bg-background object-contain"
                />
              )}

              {error && (
                <p className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" /> {error}
                </p>
              )}

              {quote.depositCents === 0 ? (
                <Button
                  className="min-h-12 w-full"
                  disabled={!ready || busy}
                  onClick={() => void accept({})}
                >
                  {busy ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  {busy ? "Confirming…" : "Accept quote & confirm booking"}
                </Button>
              ) : paymentsConfigured && quote.payments.stripe ? (
                intent ? (
                  <QuoteDepositPayment
                    clientSecret={intent.clientSecret}
                    amountCents={intent.amountCents || quote.depositCents}
                    onPaid={(paymentIntentId) => accept({ paymentIntentId })}
                  />
                ) : (
                  <Button
                    className="min-h-12 w-full"
                    disabled={!ready || busy}
                    onClick={() => void startPayment()}
                  >
                    {busy ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CreditCard size={15} />
                    )}
                    {busy ? "Preparing payment…" : `Continue to pay ${deposit} deposit`}
                  </Button>
                )
              ) : quote.payments.testMode ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
                  <p className="text-xs text-foreground">
                    Test mode — Stripe keys are not configured on this preview, so no card is
                    charged. The signed booking is recorded with a test deposit.
                  </p>
                  <Button
                    className="min-h-12 w-full"
                    disabled={!ready || busy}
                    onClick={() => void accept({ paymentMode: "test" })}
                  >
                    {busy ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={15} />
                    )}
                    {busy ? "Confirming…" : `Record ${deposit} test deposit & confirm`}
                  </Button>
                </div>
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-foreground">
                  Online card payment isn't available on this site yet. Call{" "}
                  {quote.company.phone || quote.company.name} to pay your deposit and confirm the
                  booking.
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Your signature, the date and time, and the network address it was captured from are
                stored with the booking as your acceptance record.
              </p>
            </div>
          </section>
        )}

        <div className="ws-actions" style={{ marginTop: 20 }}>
          {phone && (
            <a className="ws-btn primary" href={`tel:${phone}`}>
              <Phone size={15} /> Call to book
            </a>
          )}
          {quote.company.email && (
            <a
              className="ws-btn"
              href={`mailto:${quote.company.email}?subject=${encodeURIComponent(`Quote ${quote.reference}`)}`}
            >
              Email us
            </a>
          )}
          <button type="button" className="ws-btn" onClick={() => window.print()}>
            Print quote
          </button>
        </div>
        <p className="ws-helper" style={{ marginTop: 12 }}>
          This link is personal to your move. The estimate can change if the inventory, access or
          move date changes; the deposit is applied to your final balance.
        </p>
      </main>
    </div>
  );
}
