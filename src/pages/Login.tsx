import { Link } from "@/lib/wouter";
import {
  ArrowRight,
  Check,
  Chrome,
  KeyRound,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Truck,
  ArrowLeft,
} from "lucide-react";
import MoveGridBrand from "@/components/MoveGridBrand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  AccessApiError,
  accessApi,
  googleStartUrl,
  invitationsApi,
} from "@/lib/access-api";
import {
  activeInviteToken,
  saveInviteIntent,
  clearBrowserInvite,
} from "@/lib/invite-intent";
import { finishAccess, workspaceDestination } from "./access/access-flow";
import EmailVerificationRequest from "./access/EmailVerificationRequest";
import "./access/access.css";

type AuthTab = "login" | "signup" | "magic" | "phone";

export default function Login() {
  const { tx } = useI18n();
  const { user, loading, refresh, logout } = useAuth();
  const [tab, setTab] = useState<AuthTab>(() => {
    if (typeof window === "undefined") return "login";
    return window.location.pathname === "/signup" ||
      new URLSearchParams(window.location.search).get("tab") === "signup"
      ? "signup"
      : "login";
  });
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    activeInviteToken()
  );
  const [capabilities, setCapabilities] = useState<{
    password: boolean;
    email: boolean;
    google: boolean;
    phone: boolean;
    reasons: { email: string; google: string; phone: string };
  } | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStarted, setPhoneStarted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

  useEffect(() => {
    const token = activeInviteToken();
    setInviteToken(token);
    let current = true;
    void accessApi
      .capabilities()
      .then(value => current && setCapabilities(value))
      .catch(reason => {
        if (current)
          setCapabilityError(
            reason instanceof Error
              ? reason.message
              : tx(
                  "Sign-in providers are unavailable.",
                  "Провайдеры входа недоступны."
                )
          );
      });
    return () => {
      current = false;
    };
  }, [tx]);

  const clearNotice = () => {
    setError("");
    setMessage("");
    setVerificationNeeded(false);
  };
  const persistInvite = async () => {
    const token = activeInviteToken() || inviteToken;
    if (!token) return null;
    saveInviteIntent(token);
    // The server cookie survives redirects, including Manus and Google OAuth.
    await invitationsApi.persistIntent(token);
    setInviteToken(token);
    return token;
  };
  const complete = async (
    result: Awaited<ReturnType<typeof accessApi.login>>
  ) => {
    if (result.emailVerificationRequired) {
      setVerificationEmail(result.user.email || email);
      setVerificationNeeded(true);
      return;
    }
    try {
      const enrollment = await finishAccess(result, inviteToken);
      // Update useAuth's cached user before the SPA sees the destination route.
      await refresh();
      window.location.assign(
        enrollment ? workspaceDestination(enrollment) : "/app/dashboard"
      );
    } catch (reason) {
      if (reason instanceof AccessApiError && reason.status === 409) {
        setVerificationEmail(result.user.email || email);
        setVerificationNeeded(true);
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not finish signing you in.",
                "Не удалось завершить вход."
              )
        );
      }
    }
  };
  const authenticate = async (event: React.FormEvent) => {
    event.preventDefault();
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      if (tab === "signup") {
        await complete(
          await accessApi.register({
            name: name.trim(),
            email: email.trim(),
            password,
            ...(token ? { inviteToken: token } : {}),
          })
        );
      } else {
        await complete(
          await accessApi.login({
            email: email.trim(),
            password,
            ...(token ? { inviteToken: token } : {}),
          })
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx("We could not sign you in.", "Не удалось выполнить вход.")
      );
    } finally {
      setSubmitting(false);
    }
  };
  const sendMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      const result = await accessApi.magicLink({
        email: email.trim(),
        ...(token ? { inviteToken: token } : {}),
      });
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "We could not send a sign-in link.",
              "Не удалось отправить ссылку для входа."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };
  const startPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      const result = await accessApi.phoneStart({
        phone: phone.trim(),
        ...(token ? { inviteToken: token } : {}),
      });
      setPhoneStarted(true);
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "We could not start phone verification.",
              "Не удалось начать подтверждение по телефону."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };
  const verifyPhone = async (event: React.FormEvent) => {
    event.preventDefault();
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      await complete(
        await accessApi.phoneVerify({
          phone: phone.trim(),
          code: code.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(token ? { inviteToken: token } : {}),
        })
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "We could not verify that code.",
              "Не удалось подтвердить этот код."
            )
      );
    } finally {
      setSubmitting(false);
    }
  };
  const startManus = async () => {
    clearNotice();
    setSubmitting(true);
    try {
      await persistInvite();
      startLogin();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx("Manus login is unavailable.", "Вход через Manus недоступен.")
      );
      setSubmitting(false);
    }
  };
  const startGoogle = async () => {
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      window.location.assign(googleStartUrl(token));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : tx(
              "Google sign-in is unavailable.",
              "Вход через Google недоступен."
            )
      );
      setSubmitting(false);
    }
  };
  const completeExistingInvite = async () => {
    clearNotice();
    setSubmitting(true);
    try {
      const token = await persistInvite();
      if (!token) return;
      const enrollment = await invitationsApi.accept(token);
      await refresh();
      window.location.assign(workspaceDestination(enrollment));
    } catch (reason) {
      if (reason instanceof AccessApiError && reason.status === 409) {
        setVerificationEmail(user?.email || email);
        setVerificationNeeded(true);
      } else
        setError(
          reason instanceof Error
            ? reason.message
            : tx(
                "We could not accept this invitation.",
                "Не удалось принять приглашение."
              )
        );
    } finally {
      setSubmitting(false);
    }
  };

  const passwordReady = Boolean(capabilities?.password);
  const magicReady = Boolean(capabilities?.email);
  const googleReady = Boolean(capabilities?.google);
  const phoneReady = Boolean(capabilities?.phone);
  const unavailable = (kind: "password" | "email" | "google" | "phone") => {
    if (!capabilities)
      return (
        capabilityError ||
        tx("Checking provider setup…", "Проверяем настройку провайдера…")
      );
    if (kind === "password")
      return tx(
        "Password sign-in is not configured.",
        "Вход по паролю не настроен."
      );
    return (
      capabilities.reasons[kind] ||
      tx(
        "This sign-in provider is not configured.",
        "Этот провайдер входа не настроен."
      )
    );
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <MoveGridBrand />
        <div>
          <span className="section-kicker">
            {tx("YOUR CREW. CONNECTED.", "ВАША КОМАНДА. НА СВЯЗИ.")}
          </span>
          <h1>
            {tx("A better day", "Лучший день")}
            <br />
            {tx("начинается с", "начинается с")}
            <br />
            <span>{tx("clearer plan.", "ясного плана.")}</span>
          </h1>
          <p>
            {tx(
              "Everything your moving business needs to keep the day moving—in one workspace.",
              "Всё, что нужно вашему бизнесу перевозок, чтобы день шёл по плану — в одном рабочем пространстве."
            )}
          </p>
          {[
            ["Every customer, in view.", "Каждый клиент на виду."],
            [
              "Every estimate, clearly planned.",
              "Каждая смета чётко спланирована.",
            ],
            [
              "Every crew, on the same page.",
              "Вся команда работает согласованно.",
            ],
          ].map(([english, russian]) => (
            <span className="login-benefit" key={english}>
              <Check size={17} />
              {tx(english, russian)}
            </span>
          ))}
        </div>
        <span className="login-brand-bottom">
          <Truck size={18} />
          MoveFlew · Moving Operations CRM
        </span>
      </section>
      <section className="login-form-panel">
        <div className="login-topbar">
          <Link href="/" className="back-home">
            <ArrowLeft size={16} />
            {tx("Back to home", "На главную")}
          </Link>
          <LanguageSwitcher className="login-language-switcher" />
        </div>
        <div className="login-box">
          <span className="login-icon">
            <MoveGridBrand />
          </span>
          <small className="section-kicker">
            {tx(
              "MOVEFLEW WORKSPACE",
              "РАБОЧЕЕ ПРОСТРАНСТВО MOVEFLEW"
            )}
          </small>
          <h2>
            {user
              ? tx("You’re ready to move.", "Всё готово к работе.")
              : tx("Good to see you.", "Рады вас видеть.")}
          </h2>
          {inviteToken && (
            <p className="access-invite-note">
              {tx(
                "Your crew invitation will continue after sign-in.",
                "Ваше приглашение в команду продолжится после входа."
              )}
              <button
                className="access-alt-button"
                type="button"
                onClick={() => {
                  clearBrowserInvite();
                  setInviteToken(null);
                  clearNotice();
                }}
              >
                {tx(
                  "Continue without invitation",
                  "Продолжить без приглашения"
                )}
              </button>
            </p>
          )}
          {loading ? (
            <button disabled className="btn btn-blue">
              {tx("Checking your session…", "Проверяем сеанс…")}
            </button>
          ) : user ? (
            <>
              <p>
                {tx("Signed in as {account}.", "Выполнен вход как {account}.", {
                  account:
                    user.name ||
                    user.email ||
                    tx("your account", "ваш аккаунт"),
                })}
              </p>
              <button
                type="button"
                className="access-alt-button"
                onClick={() => void logout()}
              >
                {tx("Use a different account", "Использовать другой аккаунт")}
              </button>
              {verificationNeeded ? (
                <EmailVerificationRequest
                  defaultEmail={verificationEmail || user.email}
                />
              ) : inviteToken ? (
                <button
                  className="btn btn-blue"
                  disabled={submitting}
                  onClick={() => void completeExistingInvite()}
                >
                  {submitting
                    ? tx("Joining…", "Присоединение…")
                    : tx("Join workspace", "Присоединиться")}
                </button>
              ) : (
                <Link href="/app/dashboard" className="btn btn-blue">
                  {tx("Open your workspace", "Открыть рабочее пространство")}{" "}
                  <ArrowRight size={18} />
                </Link>
              )}
            </>
          ) : verificationNeeded ? (
            <>
              <p>
                {tx(
                  "This sign-in needs email verification before access can continue.",
                  "Для продолжения входа требуется подтверждение адреса эл. почты."
                )}
              </p>
              <EmailVerificationRequest
                defaultEmail={verificationEmail || email}
              />
            </>
          ) : (
            <>
              <p>
                {tx(
                  "Sign in securely to access your customers, estimates, jobs, and crew.",
                  "Войдите безопасно, чтобы получить доступ к клиентам, сметам, заказам и команде."
                )}
              </p>
              <div
                className="access-tabs"
                role="tablist"
                aria-label={tx("Sign-in method", "Способ входа")}
              >
                {(
                  [
                    ["login", tx("Password", "Пароль")],
                    ["signup", tx("Sign up", "Регистрация")],
                    ["magic", tx("Email link", "Ссылка email")],
                    ["phone", tx("Phone", "Телефон")],
                  ] as Array<[AuthTab, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => {
                      setTab(value);
                      clearNotice();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {(tab === "login" || tab === "signup") && (
                <form className="access-form" onSubmit={authenticate}>
                  {tab === "signup" && (
                    <label>
                      {tx("Name", "Имя")}
                      <input
                        required
                        autoComplete="name"
                        value={name}
                        onChange={event => setName(event.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    {tx("Email", "Эл. почта")}
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    {tx("Password", "Пароль")}
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete={
                        tab === "signup" ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                    />
                  </label>
                  {!passwordReady && (
                    <p className="access-disabled">{unavailable("password")}</p>
                  )}
                  <button
                    className="btn btn-blue"
                    disabled={!passwordReady || submitting}
                  >
                    {submitting
                      ? tx("Working…", "Обработка…")
                      : tab === "signup"
                        ? tx("Create account", "Создать аккаунт")
                        : tx("Sign in", "Войти")}
                  </button>
                </form>
              )}
              {tab === "magic" && (
                <form className="access-form" onSubmit={sendMagicLink}>
                  <label>
                    {tx("Email", "Эл. почта")}
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                    />
                  </label>
                  {!magicReady && (
                    <p className="access-disabled">{unavailable("email")}</p>
                  )}
                  <button
                    className="btn btn-blue"
                    disabled={!magicReady || submitting}
                  >
                    <Mail size={16} />{" "}
                    {submitting
                      ? tx("Sending…", "Отправка…")
                      : tx("Send sign-in link", "Отправить ссылку для входа")}
                  </button>
                </form>
              )}
              {tab === "phone" && (
                <form
                  className="access-form"
                  onSubmit={phoneStarted ? verifyPhone : startPhone}
                >
                  <label>
                    {tx("Mobile phone", "Мобильный телефон")}
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      value={phone}
                      onChange={event => setPhone(event.target.value)}
                    />
                  </label>
                  {phoneStarted && (
                    <>
                      <label>
                        {tx("Verification code", "Код подтверждения")}
                        <input
                          inputMode="numeric"
                          required
                          autoComplete="one-time-code"
                          value={code}
                          onChange={event => setCode(event.target.value)}
                        />
                      </label>
                      <label>
                        {tx(
                          "Name for a new account (optional)",
                          "Имя для нового аккаунта (необязательно)"
                        )}
                        <input
                          autoComplete="name"
                          value={name}
                          onChange={event => setName(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {!phoneReady && (
                    <p className="access-disabled">{unavailable("phone")}</p>
                  )}
                  <button
                    className="btn btn-blue"
                    disabled={!phoneReady || submitting}
                  >
                    <Phone size={16} />{" "}
                    {submitting
                      ? tx("Working…", "Обработка…")
                      : phoneStarted
                        ? tx("Verify code", "Подтвердить код")
                        : tx(
                            "Send verification code",
                            "Отправить код подтверждения"
                          )}
                  </button>
                </form>
              )}
              <div className="access-divider">{tx("or", "или")}</div>
              {!googleReady && (
                <p className="access-disabled">{unavailable("google")}</p>
              )}
              <div className="access-actions">
                <button
                  type="button"
                  className="access-alt-button"
                  disabled={!googleReady || submitting}
                  onClick={() => void startGoogle()}
                >
                  <Chrome size={16} />{" "}
                  {tx("Continue with Google", "Продолжить через Google")}
                </button>
                <button
                  type="button"
                  className="access-alt-button"
                  disabled={submitting}
                  onClick={() => void startManus()}
                >
                  <KeyRound size={16} />{" "}
                  {tx("Continue with Manus", "Продолжить через Manus")}
                </button>
              </div>
            </>
          )}
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
          <div className="login-secure">
            <ShieldCheck size={15} />
            <span>
              {tx(
                "Secure account login. No extra password to remember.",
                "Безопасный вход в аккаунт. Никаких лишних паролей."
              )}
            </span>
          </div>
          <div className="login-help">
            <span>
              {tx(
                "New here? Sign in to create your company workspace.",
                "Впервые здесь? Войдите, чтобы создать рабочее пространство компании."
              )}
            </span>
            <Link href="/contact">
              {tx(
                "Need a hand? Contact the crew",
                "Нужна помощь? Свяжитесь с командой"
              )}{" "}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
        <small className="login-footer">
          {tx(
            "Your workspace keeps your company’s information separate.",
            "Ваше рабочее пространство хранит информацию компании отдельно."
          )}
        </small>
      </section>
    </main>
  );
}
