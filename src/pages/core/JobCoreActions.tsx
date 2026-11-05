import type { ModuleProps } from "@shared/expansion";
import { FileText, Mail, ShieldCheck, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function JobCoreActions({
  jobId,
  role,
  navigate,
}: Pick<ModuleProps, "role" | "navigate"> & { jobId: number }) {
  const { tx } = useI18n();
  if (role === "crew") return null;
  const finance = role === "admin" || role === "office_admin";
  return (
    <section className="ws-card ws-card-pad" style={{ marginBottom: 18 }}>
      <div className="ws-card-title">
        <div>
          <h2>{tx("Connected job tools", "Инструменты заказа")}</h2>
          <p>
            {tx(
              "Apply an approved tariff before sending, manage notifications, and track customer settlements.",
              "Примените утверждённый тариф перед отправкой, управляйте уведомлениями и возмещением клиенту."
            )}
          </p>
        </div>
      </div>
      <div
        className="ws-inline"
        style={{ display: "flex", flexWrap: "wrap", gap: 9 }}
      >
        <button
          className="ws-btn"
          onClick={() => navigate(`/app/tariffs?job=${jobId}`)}
        >
          <FileText size={15} />
          {tx("Advanced tariff", "Расширенный тариф")}
        </button>
        {finance && (
          <>
            <button
              className="ws-btn"
              onClick={() =>
                navigate(`/app/transactional-messages?job=${jobId}`)
              }
            >
              <Mail size={15} />
              {tx("Transactional messages", "Уведомления клиенту")}
            </button>
            <button
              className="ws-btn"
              onClick={() => navigate(`/app/payment-gateway?job=${jobId}`)}
            >
              <Wallet size={15} />
              {tx("Payment authorization", "Авторизация оплаты")}
            </button>
            <button
              className="ws-btn"
              onClick={() => navigate(`/app/claim-settlements?job=${jobId}`)}
            >
              <ShieldCheck size={15} />
              {tx("Claims portal", "Портал претензий")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
