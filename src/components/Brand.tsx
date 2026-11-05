import { Link } from "@/lib/wouter";
import { useI18n } from "@/lib/i18n";

export default function Brand({
  compact = false,
  light = false,
}: {
  compact?: boolean;
  light?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label={`${t("Home")} — MoveFlew`}
    >
      <span className="brand-symbol">
        <svg viewBox="0 0 64 68" fill="none" aria-hidden="true">
          <path
            d="M32 3 60 19v30L32 65 4 49V19L32 3Z M4 19l28 16 28-16 M32 35v30"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinejoin="round"
          />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="m13.33 13.67 28 16 M22.67 8.33l28 16 M13.33 24.33l28-16 M22.67 29.67l28-16 M13.33 24.33v30 M22.67 29.67v30 M41.33 29.67v30 M50.67 24.33v30 M4 29l28 16 28-16 M4 39l28 16 28-16" />
          </g>
        </svg>
      </span>
      <span className="brand-words">
        <strong>
          Move<span>Flew</span>
        </strong>
        {!compact && <small>{t("MOVING OPERATIONS CRM")}</small>}
      </span>
    </Link>
  );
}
