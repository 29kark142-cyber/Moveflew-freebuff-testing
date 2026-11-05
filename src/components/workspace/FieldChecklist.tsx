import { Link } from "@/lib/wouter";
import { ClipboardCheck, BookOpen } from "lucide-react";
import { HELP_FIELD_CHECKLIST } from "@shared/help";
import { useI18n } from "@/lib/i18n";
import "./field-checklist.css";

export default function FieldChecklist() {
  const { tx, language } = useI18n();
  return (
    <aside className="field-checklist" aria-labelledby="field-checklist-title">
      <header>
        <div>
          <ClipboardCheck size={21} aria-hidden="true" />
          <h2 id="field-checklist-title">
            {tx("Move-day quick checklist", "Краткий чек-лист дня переезда")}
          </h2>
        </div>
        <Link href="/app/docs#field-crew-fast-checklist">
          <BookOpen size={15} aria-hidden="true" />
          {tx("Full instructions", "Полная инструкция")}
        </Link>
      </header>
      <ol>
        {HELP_FIELD_CHECKLIST.map(item => (
          <li key={item.step}>
            <span aria-hidden="true">{item.step}</span>
            <p>{language === "ru" ? item.ru : item.en}</p>
          </li>
        ))}
      </ol>
      <p className="field-checklist-note">
        {tx(
          "Use the shared job Clock In / Clock Out for customer-billable time—not the Individual clock for payroll. Checkout requires a finalized invoice and configured gateway. Verify payment in the saved ledger; a checkout redirect is not proof of payment.",
          "Для времени, оплачиваемого клиентом, используйте общий таймер задания, а не индивидуальный таймер расчета зарплаты. Для оплаты нужны итоговый счет и настроенный шлюз. Проверьте оплату в реестре: переход со страницы оплаты не подтверждает платеж."
        )}
      </p>
    </aside>
  );
}
