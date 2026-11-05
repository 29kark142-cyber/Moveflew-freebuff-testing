import { useState } from "react";
import { accessApi } from "@/lib/access-api";
import { useI18n } from "@/lib/i18n";

type Props = { defaultEmail?: string | null };

export default function EmailVerificationRequest({ defaultEmail = "" }: Props) {
  const { tx } = useI18n();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await accessApi.requestEmailVerification(
        email.trim() || undefined
      );
      setMessage(
        result.message ||
          tx(
            "Verification email submitted. Open the email to finish verification, then return here.",
            "Письмо для подтверждения отправлено. Откройте письмо, завершите подтверждение и вернитесь сюда."
          )
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "We could not submit the verification email.",
              "Не удалось отправить письмо для подтверждения."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="access-form" onSubmit={submit}>
      <label>
        {tx("Invited email address", "Приглашённый адрес эл. почты")}
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
      </label>
      <button className="btn btn-blue" disabled={submitting}>
        {submitting
          ? tx("Submitting…", "Отправка…")
          : tx("Send verification email", "Отправить письмо для подтверждения")}
      </button>
      {message && (
        <p className="access-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="access-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
