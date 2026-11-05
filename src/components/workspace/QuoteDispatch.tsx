import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";
import type { Job } from "@shared/crm";
import { QUOTE_EMAIL_RE, QUOTE_PHONE_RE, type QuoteDelivery } from "@shared/quote-dispatch";

type Preview = {
  reference: string;
  customerName: string;
  email: string;
  phone: string;
  link: string;
  providers: { email: boolean; sms: boolean };
  preview: { emailSubject: string; emailBody: string; smsBody: string };
  history: QuoteDelivery[];
};

type DispatchResult = {
  link: string;
  status: string;
  sent: boolean;
  deliveries: QuoteDelivery[];
};

const ALLOWED = ["admin", "office_admin", "dispatcher", "estimator"];
const json = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

const TONE: Record<QuoteDelivery["status"], string> = {
  accepted: "green",
  logged: "blue",
  failed: "red",
};

/**
 * One-click quote dispatch from the job sheet: pre-filled email and SMS copy, recipient
 * confirmation, then a recorded delivery attempt on the job.
 */
export default function QuoteDispatch({
  job,
  role,
  variant = "panel",
  onSent,
}: {
  job: Job;
  role: string;
  variant?: "header" | "panel";
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [email, setEmail] = useState(job.customerEmail || "");
  const [phone, setPhone] = useState(job.customerPhone || "");
  const [channels, setChannels] = useState({ email: true, sms: true });
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [smsBody, setSmsBody] = useState("");

  const close = useCallback(() => {
    setOpen(false);
    setError("");
    setResult(null);
  }, []);

  // Modal behaviour: Escape closes, the page behind cannot scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const next = await crmFetch<Preview>(`/jobs/${job.id}/quote-dispatch`);
      setPreview(next);
      setEmail(next.email || job.customerEmail || "");
      setPhone(next.phone || job.customerPhone || "");
      setSubject(next.preview.emailSubject);
      setEmailBody(next.preview.emailBody);
      setSmsBody(next.preview.smsBody);
      setChannels({ email: true, sms: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not prepare this quote");
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const selected = (["email", "sms"] as const).filter((channel) => channels[channel]);
    if (!selected.length) return setError("Choose email, SMS, or both");
    if (selected.includes("email") && !QUOTE_EMAIL_RE.test(email.trim()))
      return setError("Add a valid customer email address");
    if (selected.includes("sms") && !QUOTE_PHONE_RE.test(phone.trim()))
      return setError("Add a valid customer mobile number");
    setBusy(true);
    setError("");
    try {
      const next = await crmFetch<DispatchResult>(
        `/jobs/${job.id}/quote-dispatch`,
        json({
          email: email.trim(),
          phone: phone.trim(),
          channels: selected,
          subject: subject.trim(),
          emailBody,
          smsBody,
        }),
      );
      setResult(next);
      toast[next.sent ? "success" : "message"](
        next.sent ? "Quote dispatched" : "Dispatch logged — no provider is configured",
      );
      onSent();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send this quote");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!preview?.link) return;
    try {
      await navigator.clipboard.writeText(preview.link);
      toast.success("Quote link copied");
    } catch {
      toast.error("Copy the link from the field below");
    }
  };

  if (!ALLOWED.includes(role)) return null;

  const button =
    variant === "header" ? (
      <button className="ws-btn primary" onClick={() => void openModal()} type="button">
        <Send size={15} /> Send Quote to Customer
      </button>
    ) : (
      <Button className="min-h-12 w-full" onClick={() => void openModal()}>
        <Send size={15} /> Send Quote to Customer
      </Button>
    );

  return (
    <>
      {variant === "panel" ? (
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>Customer quote</h2>
              <p>Email and SMS the customer their live quote link, in one click.</p>
            </div>
          </div>
          {button}
          <p className="ws-helper" style={{ marginTop: 8 }}>
            Previews the exact email and SMS text before anything is sent. The customer opens a
            private tokenised quote page.
          </p>
        </section>
      ) : (
        button
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3"
          role="dialog"
          aria-modal="true"
          aria-label="Send quote to customer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Send quote to customer</h2>
                <p className="text-sm text-muted-foreground">
                  {preview
                    ? `${preview.reference} · ${preview.customerName || "Customer"}`
                    : "Preparing…"}
                </p>
              </div>
              <button type="button" className="ws-btn" onClick={close} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            {loading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" /> Loading the customer details…
              </p>
            )}

            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}

            {preview && !result && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={channels.email}
                        onChange={(event) =>
                          setChannels((current) => ({ ...current, email: event.target.checked }))
                        }
                      />
                      <Mail size={14} /> Email
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="customer@example.com"
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-foreground">
                    <span className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={channels.sms}
                        onChange={(event) =>
                          setChannels((current) => ({ ...current, sms: event.target.checked }))
                        }
                      />
                      <MessageSquare size={14} /> SMS
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+1 555 123 4567"
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                    />
                  </label>
                </div>

                {(!preview.providers.email || !preview.providers.sms) && (
                  <p className="rounded-xl bg-muted p-3 text-xs text-foreground">
                    {preview.providers.email ? "Email" : "Email is not configured"} ·{" "}
                    {preview.providers.sms ? "SMS" : "SMS is not configured"}. Unconfigured channels
                    are logged on the job instead of sent, so nothing claims a delivery that did not
                    happen.
                  </p>
                )}

                <div className="space-y-2">
                  <label className="block space-y-1 text-sm font-medium text-foreground">
                    Email subject
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                      maxLength={200}
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium text-foreground">
                    Email body
                    <textarea
                      value={emailBody}
                      onChange={(event) => setEmailBody(event.target.value)}
                      rows={9}
                      className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs text-foreground"
                      maxLength={4000}
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-medium text-foreground">
                    SMS message
                    <textarea
                      value={smsBody}
                      onChange={(event) => setSmsBody(event.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-input bg-background p-3 text-sm text-foreground"
                      maxLength={1000}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {smsBody.length} characters · the quote link is included in both messages.
                  </p>
                </div>

                {preview.link ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                    <code className="min-w-0 flex-1 break-all text-xs text-foreground">
                      {preview.link}
                    </code>
                    <button type="button" className="ws-btn" onClick={() => void copyLink()}>
                      <Copy size={14} /> Copy
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A new private quote link is created when you send.
                  </p>
                )}

                <Button className="min-h-12 w-full" disabled={busy} onClick={() => void send()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {busy ? "Sending…" : "Send quote"}
                </Button>
              </div>
            )}

            {result && (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CheckCircle2 size={16} className="text-primary" />
                  {result.sent ? "Quote dispatched" : "Dispatch logged (no provider configured)"}
                </p>
                <ul className="space-y-2">
                  {result.deliveries.map((delivery) => (
                    <li
                      key={`${delivery.channel}-${delivery.at}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                    >
                      <span className="min-w-0">
                        <b className="text-foreground">
                          {delivery.channel === "email" ? "Email" : "SMS"} · {delivery.target}
                        </b>
                        <small className="block text-xs text-muted-foreground">
                          {delivery.detail}
                        </small>
                      </span>
                      <span className={`ws-chip ${TONE[delivery.status]}`}>{delivery.status}</span>
                    </li>
                  ))}
                </ul>
                <p className="break-all text-xs text-muted-foreground">Quote link: {result.link}</p>
                <Button variant="outline" className="min-h-11 w-full" onClick={close}>
                  Done
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
