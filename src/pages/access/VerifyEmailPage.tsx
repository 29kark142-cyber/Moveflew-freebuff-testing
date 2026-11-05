import { Link } from "@/lib/wouter";
import { useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { AccessApiError, accessApi } from "@/lib/access-api";
import { activeInviteToken } from "@/lib/invite-intent";
import { useI18n } from "@/lib/i18n";
import { finishAccess, navigateAfterAccess } from "./access-flow";
import EmailVerificationRequest from "./EmailVerificationRequest";
import "./access.css";

export default function VerifyEmailPage() {
  const { tx } = useI18n();
  const isMagicLink =
    typeof window !== "undefined" &&
    window.location.pathname === "/auth/verify";
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token")?.trim() ??
        "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [verificationNeeded, setVerificationNeeded] = useState(false);

  const verify = async () => {
    if (!token) return;
    setSubmitting(true);
    setError("");
    try {
      // Deliberately user initiated: mail scanners and browser prefetches must not consume this token.
      const result = await accessApi.verifyEmail(token);
      if (result.emailVerificationRequired) {
        setVerificationNeeded(true);
        return;
      }
      const enrollment = await finishAccess(result, activeInviteToken());
      navigateAfterAccess(enrollment);
    } catch (reason) {
      if (reason instanceof AccessApiError && reason.status === 409)
        setVerificationNeeded(true);
      else
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not verify this link.",
                "Не удалось подтвердить эту ссылку."
              )
        );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="access-page">
      <section className="access-card">
        <span className="login-icon">
          <MailCheck size={28} />
        </span>
        <span className="section-kicker">
          {isMagicLink
            ? tx("MAGIC LINK", "ВОЛШЕБНАЯ ССЫЛКА")
            : tx("EMAIL VERIFICATION", "ПОДТВЕРЖДЕНИЕ ЭЛ. ПОЧТЫ")}
        </span>
        <h1>
          {isMagicLink
            ? tx("Complete sign in", "Завершите вход")
            : tx("Confirm your email", "Подтвердите адрес эл. почты")}
        </h1>
        <p>
          {isMagicLink
            ? tx(
                "Select the button below to use this sign-in link.",
                "Нажмите кнопку ниже, чтобы использовать ссылку для входа."
              )
            : tx(
                "Select the button below to verify this email link.",
                "Нажмите кнопку ниже, чтобы подтвердить ссылку из письма."
              )}
        </p>
        {!token ? (
          <p className="access-error">
            {tx(
              "This verification link is incomplete.",
              "Эта ссылка для подтверждения неполная."
            )}
          </p>
        ) : verificationNeeded ? (
          <EmailVerificationRequest />
        ) : (
          <button
            className="btn btn-blue"
            onClick={() => void verify()}
            disabled={submitting}
          >
            <CheckCircle2 size={17} />
            {submitting
              ? tx("Verifying…", "Подтверждение…")
              : isMagicLink
                ? tx("Complete sign in", "Завершить вход")
                : tx("Verify email", "Подтвердить адрес")}
          </button>
        )}
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <Link href="/login" className="back-home">
          {tx("Back to sign in", "Вернуться ко входу")}
        </Link>
      </section>
    </main>
  );
}
