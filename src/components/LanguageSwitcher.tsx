import { Globe2 } from "lucide-react";
import { useI18n, type Language } from "@/lib/i18n";

export default function LanguageSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { language, setLanguage } = useI18n();
  return (
    <label className={`language-switcher ${className}`}>
      <Globe2 size={16} aria-hidden="true" />
      <select
        aria-label="Language / Язык"
        value={language}
        onChange={event => setLanguage(event.target.value as Language)}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="ru" lang="ru">
          Русский
        </option>
      </select>
    </label>
  );
}
