import { useEffect, useState } from "react";
import Brand from "@/components/Brand";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { CoreCard, CoreNotice } from "./CoreUI";
export default function PaymentMethodPage() {
  const { tx } = useI18n();
  const token = window.location.pathname.split("/").at(-1) || "";
  const [data, setData] = useState<{
    consentText: string;
    methodType: string;
    status: string;
  } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = async (suffix = "", init: RequestInit = {}) => {
    const response = await fetch(
      `/api/payment-methods/${encodeURIComponent(token)}${suffix}`,
      {
        ...init,
        credentials: "omit",
        headers: { "content-type": "application/json" },
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  };
  useEffect(() => {
    void request()
      .then(setData)
      .catch(reason => setError(reason.message));
  }, [token]);
  return (
    <main
      className="core-page"
      style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}
    >
      <div className="core-actions">
        <Brand />
        <LanguageSwitcher />
      </div>
      <CoreCard
        title={tx(
          "Authorize a saved payment method",
          "Разрешить сохранение платёжного способа"
        )}
      >
        {error && <CoreNotice tone="error">{error}</CoreNotice>}
        {data && (
          <>
            <p>
              {tx(
                "Your payment details are handled only by Stripe. MoveFlew stores only a provider token and your agreement. A card hold is not a completed payment; bank ACH does not support card-style holds.",
                "Платёжные реквизиты обрабатывает только Stripe. MoveFlew хранит лишь токен сервиса и ваше согласие. Удержание по карте не является завершённым платежом; ACH не поддерживает такие удержания."
              )}
            </p>
            <blockquote style={{ whiteSpace: "pre-wrap" }}>
              {data.consentText}
            </blockquote>
            <p>
              {tx("Method", "Способ")}: {data.methodType}
            </p>
            <label>
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
              />{" "}
              {tx(
                "I have read and accept the agreement above.",
                "Я прочитал(а) и принимаю указанное соглашение."
              )}
            </label>
            <br />
            <button
              className="ws-button"
              disabled={busy || !accepted}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await request("/authorize", {
                    method: "POST",
                    body: JSON.stringify({
                      accepted: true,
                      origin: window.location.origin,
                    }),
                  });
                  window.location.assign(result.url);
                } catch (reason) {
                  setError(
                    reason instanceof Error ? reason.message : "Request failed"
                  );
                  setBusy(false);
                }
              }}
            >
              {tx(
                "Continue securely to Stripe",
                "Безопасно продолжить в Stripe"
              )}
            </button>
          </>
        )}
        {!data && !error && (
          <p>{tx("Loading your agreement…", "Загрузка соглашения…")}</p>
        )}
        {new URLSearchParams(window.location.search).has("setup") && (
          <p>
            {tx(
              "Returning from Stripe is not proof of success. The agreement becomes active only after verified provider evidence; completed links then expire.",
              "Возврат из Stripe не подтверждает успех. Соглашение активируется только после проверенного подтверждения сервиса; затем ссылка прекращает действие."
            )}
          </p>
        )}
      </CoreCard>
    </main>
  );
}
