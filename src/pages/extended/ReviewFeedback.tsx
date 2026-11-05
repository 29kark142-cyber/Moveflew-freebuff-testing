import { CheckCircle2, CircleAlert, Star } from "lucide-react";
import { useEffect, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { CrmApiError } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import { engage, type PublicReview } from "@/lib/engage-api";
import "@/engagement.css";

export default function ReviewFeedback({
  params,
}: {
  params: { token: string };
}) {
  const { t } = useI18n();
  const token = params.token;
  const [review, setReview] = useState<PublicReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let active = true;
    void engage
      .publicReview(token)
      .then(value => {
        if (active) {
          setReview(value);
          setRating(value.rating || 0);
          setFeedback(value.feedback || "");
        }
      })
      .catch(
        reason =>
          active &&
          setError(
            publicError(
              reason,
              "This feedback link is unavailable or has expired."
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
    if (!rating) return;
    setSaving(true);
    setError("");
    try {
      const saved = await engage.submitPublicReview(token, {
        rating,
        feedback,
      });
      setReview(saved);
      setComplete(true);
    } catch (reason) {
      setError(
        publicError(
          reason,
          "We could not save your feedback. Please try again."
        )
      );
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <ReviewFrame>
        <p className="eg-public-loading">{t("Loading feedback form…")}</p>
      </ReviewFrame>
    );
  if (error && !review)
    return (
      <ReviewFrame>
        <PublicError message={error} />
      </ReviewFrame>
    );
  if (!review) return null;
  return (
    <ReviewFrame company={review.company?.name}>
      <section className="eg-public-card">
        <span className="eg-public-kicker">
          {t("Private service feedback")}
        </span>
        {complete || review.status === "submitted" ? (
          <div className="eg-public-success">
            <CheckCircle2 size={30} />
            <h1>{t("Thank you for your feedback")}</h1>
            <p>
              {t(
                "Your rating and comments were saved for private service review. They are not automatically published to a social or review network."
              )}
            </p>
            {review.publicReviewUrl && (
              <a
                className="eg-public-submit eg-inline-link"
                href={review.publicReviewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("Open the public review link")}
              </a>
            )}
          </div>
        ) : (
          <>
            <h1>{t("How was your experience?")}</h1>
            <p>
              {t(
                "Please share an honest rating and feedback. All ratings are treated equally and this form is private service feedback, not a public post."
              )}
            </p>
            <form className="eg-public-form" onSubmit={submit}>
              <fieldset className="eg-rating-picker">
                <legend>{t("Rating")}</legend>
                {[1, 2, 3, 4, 5].map(value => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                    />
                    <span>
                      <Star
                        size={26}
                        fill={rating >= value ? "currentColor" : "none"}
                      />{" "}
                      <small>{value}</small>
                    </span>
                    <span className="sr-only">
                      {t("{value} out of 5", { value })}
                    </span>
                  </label>
                ))}
              </fieldset>
              <label>
                {t("Feedback (optional)")}
                <textarea
                  value={feedback}
                  onChange={event => setFeedback(event.target.value)}
                />
              </label>
              {error && (
                <div className="eg-public-error-inline">{t(error)}</div>
              )}
              <button className="eg-public-submit" disabled={!rating || saving}>
                {t(saving ? "Saving feedback…" : "Submit private feedback")}
              </button>
            </form>
            {review.publicReviewUrl && (
              <p className="eg-muted">
                {t(
                  "A public review link is available independently of the rating selected above."
                )}{" "}
                <a
                  href={review.publicReviewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("Open the public review link")}
                </a>
              </p>
            )}
          </>
        )}
      </section>
    </ReviewFrame>
  );
}

function ReviewFrame({
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
        <span>{company || t("Private feedback")}</span>
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
      <h1>{t("Feedback link unavailable")}</h1>
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
