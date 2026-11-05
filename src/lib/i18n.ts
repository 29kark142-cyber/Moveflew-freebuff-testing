import { useSyncExternalStore } from "react";
import russian from "@/locales/ru.json";

export type Language = "en" | "ru";
export const LANGUAGE_STORAGE_KEY = "northwest-crew-language";
const messages: Record<string, string> = russian;
const listeners = new Set<() => void>();
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const validationFields: Record<string, string> = {
  id: "ID",
  name: "Name",
  title: "Title",
  email: "Email",
  phone: "Phone",
  source: "Source",
  score: "Score",
  notes: "Notes",
  origin: "Pickup address",
  destination: "Delivery address",
  originNotes: "Pickup notes",
  destinationNotes: "Delivery notes",
  moveDate: "Move date",
  startHour: "Start time",
  duration: "Duration",
  crewSize: "Crew size",
  hourlyRate: "Hourly rate",
  estimatedHours: "Estimated hours",
  distanceMiles: "Distance",
  travelFee: "Travel fee",
  requiredSkill: "Required skill",
  signature: "Signature",
  photoData: "Photo",
  role: "Role",
  status: "Status",
  template: "Template",
  delayHours: "Delay hours",
  capacityCuft: "Truck capacity",
  weightLimit: "Weight limit",
  skillLevel: "Skill level",
  minimumHours: "Minimum hours",
};
const validationRules: Array<[RegExp, string]> = [
  [/^(\w+) is required$/, "{field} is required"],
  [/^(\w+) is too long$/, "{field} is too long"],
  [/^(\w+) must be a string$/, "{field} must be a string"],
  [/^(\w+) must be a valid number$/, "{field} must be a valid number"],
  [/^(\w+) must be at least ([\d.]+)$/, "{field} must be at least {value}"],
  [/^(\w+) must be at most ([\d.]+)$/, "{field} must be at most {value}"],
  [/^(\w+) must be YYYY-MM-DD$/, "{field} must be YYYY-MM-DD"],
  [/^(\w+) must be true or false$/, "{field} must be true or false"],
  [/^(\w+) must be an array$/, "{field} must be an array"],
  [/^(\w+) is invalid$/, "{field} is invalid"],
  [/^(\w+) must be a PNG data URL$/, "{field} must be a PNG data URL"],
  [
    /^(\w+) must contain valid base64 PNG data$/,
    "{field} must contain valid base64 PNG data",
  ],
  [
    /^(\w+) must contain a PNG image smaller than 1 MB$/,
    "{field} must contain a PNG image smaller than 1 MB",
  ],
];
function knownValidation(message: string): string | null {
  for (const [pattern, key] of validationRules) {
    const match = message.match(pattern);
    if (!match || !validationFields[match[1]] || !messages[key]) continue;
    return messages[key]
      .replace(
        /\{field\}/g,
        messages[validationFields[match[1]]] ?? validationFields[match[1]]
      )
      .replace(/\{value\}/g, match[2] ?? "");
  }
  return null;
}

export function readSavedLanguage(): Language {
  try {
    return typeof window !== "undefined" &&
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "ru"
      ? "ru"
      : "en";
  } catch {
    return "en";
  }
}
let language: Language = readSavedLanguage();
export const getLanguage = () => language;
export const getLocale = () => (language === "ru" ? "ru-RU" : "en-US");

function applyLanguage(next: Language) {
  const changed = language !== next;
  language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (changed) listeners.forEach(listener => listener());
}
export function setLanguage(next: Language) {
  if (next !== "en" && next !== "ru") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* In-memory selection still works when storage is unavailable. */
  }
  applyLanguage(next);
}
function onStorage(event: StorageEvent) {
  if (event.key === LANGUAGE_STORAGE_KEY || event.key === null)
    applyLanguage(readSavedLanguage());
}
function subscribe(listener: () => void) {
  if (!listeners.size && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}
if (typeof document !== "undefined") document.documentElement.lang = language;

/** Static interface copy only. Never translate customer names, addresses, notes or API enum values. */
export function translate(
  message: string,
  selected: Language,
  values: Record<string, string | number> = {}
): string {
  const key = normalize(message);
  if (!key) return message;
  const template =
    selected === "ru" ? (knownValidation(key) ?? messages[key] ?? key) : key;
  const result = template.replace(/\{([\w]+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key])
  );
  const leading = message.match(/^\s*/)?.[0] ?? "";
  const trailing = message.match(/\s*$/)?.[0] ?? "";
  return leading + result + trailing;
}
export const t = (
  message: string,
  values: Record<string, string | number> = {}
) => translate(message, language, values);

/** Paired fixed UI copy for independently maintained modules, never stored business data. */
export function tx(
  english: string,
  russianText: string,
  values: Record<string, string | number> = {}
) {
  const template = language === "ru" ? russianText : english;
  return template.replace(/\{([\w]+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key])
  );
}

/** Subscribe in each localized component, so switching language preserves its React state. */
export function useI18n() {
  const selected = useSyncExternalStore(
    subscribe,
    getLanguage,
    () => "en" as const
  );
  return {
    t,
    tx,
    language: selected,
    locale: selected === "ru" ? "ru-RU" : "en-US",
    setLanguage,
  };
}
export function moverCount(count: number): string {
  if (language === "en") return `${count} mover${count === 1 ? "" : "s"}`;
  const category = new Intl.PluralRules("ru-RU").select(count);
  return `${count} ${category === "one" ? "грузчик" : category === "few" ? "грузчика" : "грузчиков"}`;
}
