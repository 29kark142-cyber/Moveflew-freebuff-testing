import { Link, useLocation } from "@/lib/wouter";
import { CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { InvitationPreview } from "@shared/access";
import { useAuth } from "@/_core/hooks/useAuth";
import { AccessApiError, invitationsApi } from "@/lib/access-api";
import {
  clearBrowserInvite,
  inviteTokenFromSearch,
  saveInviteIntent,
} from "@/lib/invite-intent";
import { useI18n } from "@/lib/i18n";
import { selectEnrollment, workspaceDestination } from "./access-flow";
import EmailVerificationRequest from "./EmailVerificationRequest";
import "./access.css";

function expiredOrInvalid(error: unknown) {
  return (
    error instanceof AccessApiError &&
    [400, 403, 404, 410].includes(error.status)
  );
}

export default function InvitePage() {
  const { tx, locale } = useI18n();
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const token = inviteTokenFromSearch(
    typeof window === "undefined" ? "" : window.location.search
  );
  const attempted = useRef<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [verificationNeeded, setVerificationNeeded] = useState(false);

  useEffect(() => {
    if (!token) {
      clearBrowserInvite();
      setError(
        tx(
          "This invitation link is invalid.",
          "Ссылка приглашения недействительна."
        )
      );
      setLoading(false);
      return;
    }
    saveInviteIntent(token);
    let current = true;
    void (async () => {
      try {
        // Persist server-side intent before a person leaves this page to authenticate.
        await invitationsApi.persistIntent(token);
        const value = await invitationsApi.preview(token);
        if (current) setPreview(value);
      } catch (reason) {
        if (!current) return;
        if (expiredOrInvalid(reason)) clearBrowserInvite();
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not open this invitation.",
                "Не удалось открыть это приглашение."
              )
        );
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
    };
  }, [token, tx]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError("");
    try {
      const enrollment = await invitationsApi.accept(token);
      selectEnrollment(enrollment);
      navigate(workspaceDestination(enrollment));
    } catch (reason) {
      if (reason instanceof AccessApiError && reason.status === 409) {
        setVerificationNeeded(true);
      } else {
        if (expiredOrInvalid(reason)) clearBrowserInvite();
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not accept this invitation.",
                "Не удалось принять приглашение."
              )
        );
      }
    } finally {
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (!user || !preview || !token || attempted.current === token) return;
    attempted.current = token;
    void accept();
    // Only authenticated auto-accept is attempted once; manual retry remains available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, preview, token]);

  const loginUrl = token
    ? `/login?inviteToken=${encodeURIComponent(token)}`
    : "/login";
  const signupUrl = token
    ? `/login?tab=signup&inviteToken=${encodeURIComponent(token)}`
    : "/login?tab=signup";
  const expires = preview
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(preview.expiresAt))
    : "";

  return (
    <main className="access-page">
      <section className="access-card">
        <Link href="/" className="brand" aria-label="MoveFlew home">
          <span className="brand-words">
            <strong>
              Move<span>Flew</span>
            </strong>
          </span>
        </Link>
        <span className="section-kicker">
          {tx("CREW INVITATION", "ПРИГЛАШЕНИЕ В КОМАНДУ")}
        </span>
        <h1>
          {tx(
            "Join your crew workspace",
            "Присоединитесь к рабочему пространству"
          )}
        </h1>
        {loading && (
          <p>{tx("Checking this invitation…", "Проверяем приглашение…")}</p>
        )}
        {!loading && preview && (
          <>
            <p>
              {tx(
                "You have been invited to a MoveFlew workspace.",
                "Вас пригласили в рабочее пространство MoveFlew."
              )}
            </p>
            <div className="access-preview">
              <strong>{preview.workspaceName}</strong>
              <span>
                {tx("Role: {role}", "Роль: {role}", { role: preview.role })}
              </span>
              <span>
                {tx("Expires {date}", "Истекает {date}", { date: expires })}
              </span>
              {preview.requiresVerifiedEmail && (
                <span>
                  <ShieldCheck size={13} />{" "}
                  {tx(
                    "A verified email is required.",
                    "Требуется подтверждённый адрес эл. почты."
                  )}
                </span>
              )}
            </div>
            {user ? (
              <div className="access-card-actions">
                {verificationNeeded ? (
                  <>
                    <p className="access-disabled">
                      {tx(
                        "This email invitation needs a verified email address.",
                        "Для этого приглашения нужен подтверждённый адрес эл. почты."
                      )}
                    </p>
                    <EmailVerificationRequest defaultEmail={user.email} />
                  </>
                ) : (
                  <button
                    className="btn btn-blue"
                    onClick={() => void accept()}
                    disabled={accepting}
                  >
                    <CheckCircle2 size={17} />
                    {accepting
                      ? tx("Joining…", "Присоединение…")
                      : tx("Join workspace", "Присоединиться")}
                  </button>
                )}
              </div>
            ) : (
              <div className="access-card-actions">
                <Link href={loginUrl} className="btn btn-blue">
                  {tx("Log in to join", "Войти и присоединиться")}
                </Link>
                <Link href={signupUrl} className="access-alt-button">
                  {tx("Create an account", "Создать аккаунт")}
                </Link>
              </div>
            )}
          </>
        )}
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        {!authLoading && user && error && !verificationNeeded && (
          <button className="access-alt-button" onClick={() => void accept()}>
            <Clock3 size={15} />{" "}
            {tx("Retry accepting invitation", "Повторить принятие приглашения")}
          </button>
        )}
        <Link href="/" className="back-home">
          {tx("Back to home", "На главную")}
        </Link>
      </section>
    </main>
  );
}
