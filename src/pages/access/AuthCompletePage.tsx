import { Link, useLocation } from "@/lib/wouter";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AccessApiError, invitationsApi } from "@/lib/access-api";
import { clearBrowserInvite, readInviteIntent } from "@/lib/invite-intent";
import { useI18n } from "@/lib/i18n";
import { selectEnrollment, workspaceDestination } from "./access-flow";
import EmailVerificationRequest from "./EmailVerificationRequest";
import "./access.css";

export default function AuthCompletePage() {
  const { tx } = useI18n();
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const attempted = useRef(false);
  const [error, setError] = useState("");
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const token = readInviteIntent();
  const callbackParams = new URLSearchParams(window.location.search);
  const callbackWorkspaceId = Number(callbackParams.get("workspaceId"));
  const callbackRole = callbackParams.get("role") === "crew" ? "crew" : "admin";

  const complete = async () => {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {
      /* optional browser hint */
    }
    if (!token) {
      if (callbackParams.get("invitation") === "review") {
        setVerificationNeeded(true);
        return;
      }
      if (
        Number.isSafeInteger(callbackWorkspaceId) &&
        callbackWorkspaceId > 0
      ) {
        // Selection is only a UI preference; bootstrap revalidates membership.
        selectEnrollment({
          workspaceId: callbackWorkspaceId,
          role: callbackRole,
          workerId: null,
        });
        navigate(callbackRole === "crew" ? "/app/field" : "/app/dashboard");
        return;
      }
      navigate("/app/dashboard");
      return;
    }
    try {
      const enrollment = await invitationsApi.accept(token);
      selectEnrollment(enrollment);
      navigate(workspaceDestination(enrollment));
    } catch (reason) {
      if (reason instanceof AccessApiError && reason.status === 409) {
        setVerificationNeeded(true);
      } else {
        if (
          reason instanceof AccessApiError &&
          [400, 403, 404, 410].includes(reason.status)
        )
          clearBrowserInvite();
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not complete your invitation.",
                "Не удалось завершить приглашение."
              )
        );
      }
    }
  };

  useEffect(() => {
    if (loading || !user || attempted.current) return;
    attempted.current = true;
    void complete();
    // Authentication callback acceptance must happen only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  return (
    <main className="access-page">
      <section className="access-card">
        <span className="login-icon">
          <CheckCircle2 size={28} />
        </span>
        <span className="section-kicker">
          {tx("SIGN-IN COMPLETE", "ВХОД ЗАВЕРШЁН")}
        </span>
        <h1>
          {tx(
            "Finishing your workspace access",
            "Завершаем доступ к рабочему пространству"
          )}
        </h1>
        {loading && <p>{tx("Checking your session…", "Проверяем сеанс…")}</p>}
        {!loading && !user && (
          <>
            <p className="access-error">
              {tx(
                "We could not find an active sign-in session.",
                "Не удалось найти активный сеанс входа."
              )}
            </p>
            <Link href="/login" className="btn btn-blue">
              {tx("Return to sign in", "Вернуться ко входу")}
            </Link>
          </>
        )}
        {!loading && user && verificationNeeded && (
          <>
            <p>
              {tx(
                "This invitation needs a verified email address.",
                "Для этого приглашения нужен подтверждённый адрес эл. почты."
              )}
            </p>
            <EmailVerificationRequest defaultEmail={user.email} />
          </>
        )}
        {error && (
          <>
            <p className="access-error" role="alert">
              {error}
            </p>
            <button
              className="access-alt-button"
              onClick={() => void complete()}
            >
              {tx("Retry", "Повторить")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
