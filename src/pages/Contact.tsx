import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Mail,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { submitContact } from "@/lib/contact.functions";
import PublicLayout from "@/components/PublicLayout";
import { useI18n } from "@/lib/i18n";

const SAVE_ERROR = "Your inquiry could not be saved. Please contact us directly.";
const UNKNOWN_ERROR = "Unable to save inquiry.";

export default function Contact() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const errorMessage =
    error === SAVE_ERROR
      ? t("Your inquiry could not be saved. Please contact us directly.")
      : error === UNKNOWN_ERROR
        ? t("Unable to save inquiry.")
        : t(error);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await submitContact({ data: values });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : UNKNOWN_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicLayout>
      <section className="contact-page wrap">
        <div className="contact-info">
          <span className="section-kicker">{t("REAL PEOPLE. CLEAR ANSWERS.")}</span>
          <h1>
            {t("Let’s make your")}
            <br />
            <span>{t("next move easier.")}</span>
          </h1>
          <p>
            {t("Moving a home? Planning a busy day for your crew? We’re here to help you put the right plan in place.")}
          </p>
          <div className="contact-methods">
            <a href="mailto:support@moveflew.com">
              <span>
                 <Mail />
              </span>
              <div>
                <small>{t("SEND US AN EMAIL")}</small>
                <strong>support@moveflew.com</strong>
              </div>
              <ArrowRight size={18} />
            </a>
          </div>
          <img
            className="contact-photo"
            src="/assets/northwest-packing.webp"
            alt={t("Careful packing by the MoveFlew crew")}
          />
        </div>
        <div className="contact-form-panel">
          {success ? (
            <div className="contact-success">
              <CheckCircle2 size={46} />
              <h2>{t("Your inquiry is saved.")}</h2>
              <p>
                {t("Thank you for sharing the details. For a time-sensitive moving request, email the MoveFlew team directly.")}
              </p>
              <a className="btn btn-blue" href="mailto:support@moveflew.com">
                <Mail size={18} />
                {t("Email the crew")}
              </a>
              <button className="text-link" onClick={() => setSuccess(false)}>
                {t("Send another inquiry")} <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <span className="form-icon">
                <MessageSquare />
              </span>
              <h2>{t("Tell us what’s moving.")}</h2>
              <p>{t("A few details now. A clearer plan next.")}</p>
              <form onSubmit={submit}>
                <div className="form-pair">
                  <label>
                    {t("Your name")}
                    <input
                      name="name"
                      required
                      maxLength={120}
                      placeholder={t("First and last name")}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    {t("Phone number")}
                    <input
                      name="phone"
                      required
                      maxLength={40}
                      placeholder="(312) 555-0123"
                      type="tel"
                      autoComplete="tel"
                    />
                  </label>
                </div>
                <label>
                  {t("Email address")}
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={200}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                <label>
                  {t("Company")} <small>{t("(optional)")}</small>
                  <input
                    name="company"
                    maxLength={160}
                    placeholder={t("Your company name")}
                    autoComplete="organization"
                  />
                </label>
                <label>
                  {t("How can we help?")}
                  <textarea
                    name="message"
                    rows={5}
                    required
                    maxLength={3000}
                    placeholder={t("Tell us about your move, dates, or workspace questions…")}
                  />
                </label>
                <p className="form-note">
                  {t("We’ll store this inquiry securely. This form does not automatically send an email or text message.")}
                </p>
                {error && (
                  <p className="form-error" role="alert">
                    {errorMessage}
                  </p>
                )}
                <button className="btn btn-blue" disabled={pending}>
                  {pending ? t("Saving your inquiry…") : t("Send inquiry")}
                  <ArrowRight size={18} />
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
