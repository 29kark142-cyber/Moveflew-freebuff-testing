import { MessageSquare } from "lucide-react";
import { smsWorkerUrl } from "@shared/workers";
import { useI18n } from "@/lib/i18n";

type TextWorkerProps = {
  phone: string;
  body?: string;
  compact?: boolean;
};

/** Opens the device's SMS composer only; it does not deliver a message itself. */
export default function TextWorker({
  phone,
  body,
  compact = false,
}: TextWorkerProps) {
  const { tx } = useI18n();
  const href = smsWorkerUrl(phone, body);
  const label = tx("Text worker", "Написать сотруднику");

  if (!href) {
    return (
      <button
        type="button"
        className={compact ? "ws-icon-btn" : "ws-btn worker-text-link"}
        disabled
        aria-disabled="true"
        title={tx(
          "A valid phone number is required to open an SMS draft.",
          "Чтобы открыть черновик SMS, нужен корректный номер телефона."
        )}
        aria-label={label}
      >
        <MessageSquare size={compact ? 16 : 15} />
        {!compact && label}
      </button>
    );
  }

  return (
    <a
      className={compact ? "ws-icon-btn" : "ws-btn worker-text-link"}
      href={href}
      title={tx(
        "Open an SMS draft; no message is sent automatically.",
        "Открыть черновик SMS; сообщение не отправляется автоматически."
      )}
      aria-label={label}
    >
      <MessageSquare size={compact ? 16 : 15} />
      {!compact && label}
    </a>
  );
}
