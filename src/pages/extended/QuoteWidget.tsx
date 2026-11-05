import { CheckCircle2, CircleAlert, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { CrmApiError } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  engage,
  type QuoteSubmission,
  type QuoteSettings,
} from "@/lib/engage-api";
import "@/engagement.css";
import { utmFromQuery } from "@/lib/utm";

export default function QuoteWidget({ params }: { params: { token: string } }) {
  const { t } = useI18n();
  const token = params.token;
  const [settings, setSettings] = useState<QuoteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ reference?: string } | null>(null);
  const utm = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    return utmFromQuery(query);
  }, []);
  const [form, setForm] = useState<QuoteSubmission>({
    name: "",
    email: "",
    phone: "",
    origin: "",
    destination: "",
    moveDate: "",
    moveSize: "",
    notes: "",
    consent: false,
    utm,
    website: "",
  });
  useEffect(() => {
    let active = true;
    void engage
      .quoteSettings(token)
      .then(value => active && setSettings(value))
      .catch(
        reason =>
          active &&
          setError(
            publicError(
              reason,
              "This quote request link is unavailable or has expired."
            )
          )
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await engage.submitQuote(token, form);
      setSent(result);
    } catch (reason) {
      setError(
        publicError(
          reason,
          "We could not receive your request. Please try again."
        )
      );
    }
  };
  if (loading)
    return (
      <PublicFrame>
        <p className="eg-public-loading">{t("Loading quote request…")}</p>
      </PublicFrame>
    );
  if (error && !settings)
    return (
      <PublicFrame>
        <PublicError message={error} />
      </PublicFrame>
    );
  if (sent)
    return (
      <PublicFrame company={settings?.company?.name}>
        <section className="eg-public-card eg-public-success">
          <CheckCircle2 size={30} />
          <h1>{t("Request received")}</h1>
          <p>
            {t(
              "Thank you. Your details were received for review. This request does not guarantee an estimate, price, availability, or booking."
            )}
          </p>
          {sent.reference && (
            <small>
              {t("Reference")}: {sent.reference}
            </small>
          )}
        </section>
      </PublicFrame>
    );
  return (
    <PublicFrame company={settings?.company?.name}>
      <section className="eg-public-card">
        <span className="eg-public-kicker">{t("Moving request")}</span>
        <h1>{t("Tell us about your move")}</h1>
        <p>
          {t(
            "Share the details below and our team can review them. No price or booking is created automatically."
          )}
        </p>
        <form className="eg-public-form" onSubmit={submit}>
          <div className="eg-public-grid">
            <label>
              {t("Name")}
              <input
                required
                value={form.name}
                onChange={event =>
                  setForm(value => ({ ...value, name: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Email")}
              <input
                required
                type="email"
                value={form.email}
                onChange={event =>
                  setForm(value => ({ ...value, email: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Phone")}
              <input
                required
                value={form.phone}
                onChange={event =>
                  setForm(value => ({ ...value, phone: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Move date")}
              <input
                required
                type="date"
                value={form.moveDate}
                onChange={event =>
                  setForm(value => ({ ...value, moveDate: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Pickup address")}
              <input
                required
                value={form.origin}
                onChange={event =>
                  setForm(value => ({ ...value, origin: event.target.value }))
                }
              />
            </label>
            <label>
              {t("Delivery address")}
              <input
                required
                value={form.destination}
                onChange={event =>
                  setForm(value => ({
                    ...value,
                    destination: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {t("Move size")}
              <input
                required
                list="quote-move-sizes"
                value={form.moveSize}
                onChange={event =>
                  setForm(value => ({ ...value, moveSize: event.target.value }))
                }
              />
            </label>
            <datalist id="quote-move-sizes">
              <option value="Studio" />
              <option value="Apartment" />
              <option value="House" />
              <option value="Office" />
            </datalist>
          </div>
          <label>
            {t("Notes")}
            <textarea
              value={form.notes}
              onChange={event =>
                setForm(value => ({ ...value, notes: event.target.value }))
              }
            />
          </label>
          <label className="eg-honeypot" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={event =>
                setForm(value => ({ ...value, website: event.target.value }))
              }
            />
          </label>
          <label className="eg-public-check">
            <input
              required
              type="checkbox"
              checked={form.consent}
              onChange={event =>
                setForm(value => ({ ...value, consent: event.target.checked }))
              }
            />
            {t(
              "I consent to having these move details reviewed to respond to my request."
            )}
          </label>
          {error && <div className="eg-public-error-inline">{t(error)}</div>}
          <button className="eg-public-submit">
            <Send size={16} />
            {t("Send request")}
          </button>
        </form>
      </section>
    </PublicFrame>
  );
}

function PublicFrame({
  children,
  company,
}: {
  children: React.ReactNode;
  company?: string;
}) {
  const { t } = useI18n();
  return (
    <main className="eg-public-page">
      <header className="eg-public-header">
        <Brand light />
        <span>{company || t("Quote request")}</span>
        <LanguageSwitcher />
      </header>
      <div className="eg-public-body">{children}</div>
    </main>
  );
}
function PublicError({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <section className="eg-public-card eg-public-error">
      <CircleAlert size={30} />
      <h1>{t("Request link unavailable")}</h1>
      <p>{t(message)}</p>
    </section>
  );
}
function publicError(reason: unknown, fallback: string) {
  return reason instanceof CrmApiError && reason.status === 404
    ? fallback
    : reason instanceof Error
      ? reason.message
      : fallback;
}
