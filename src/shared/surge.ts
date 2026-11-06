import { z } from "zod";

/**
 * Automatic date-based pricing. Rules are additive percentages on the discounted
 * estimate subtotal, and are capped so a saved configuration can never multiply a
 * customer's quote without bound. Weekend pricing reuses the workspace's existing
 * `weekendPercent` setting so the estimate builder and the server agree.
 */
export type SurgeRule = {
  id: string;
  name: string;
  /** Inclusive YYYY-MM-DD range. */
  startDate: string;
  endDate: string;
  percent: number;
  enabled: boolean;
};

export type EndOfMonthSurge = {
  enabled: boolean;
  /** First day of each month the surcharge applies (1–31). */
  startDay: number;
  percent: number;
};

export type SurgeSettings = {
  enabled: boolean;
  /** Maximum combined percentage. Zero means no cap. */
  maxPercent: number;
  endOfMonth: EndOfMonthSurge;
  peakRules: SurgeRule[];
};

export type SurgeLineKind = "peak" | "weekend" | "end_of_month" | "cap";

export type SurgeLine = {
  id: string;
  kind: SurgeLineKind;
  label: string;
  percent: number;
  amount: number;
};

export type SurgeResult = {
  enabled: boolean;
  base: number;
  percent: number;
  amount: number;
  total: number;
  capped: boolean;
  lines: SurgeLine[];
};

export type QuoteSurgeSnapshot = {
  version: 1;
  moveDate: string;
  percent: number;
  amount: number;
  lines: SurgeLine[];
  appliedAt: string;
};

export const DEFAULT_SURGE_SETTINGS: SurgeSettings = {
  enabled: false,
  maxPercent: 50,
  endOfMonth: { enabled: false, startDay: 25, percent: 0 },
  peakRules: [],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (value: number) => Math.round(value * 100) / 100;

const surgeRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(80),
    startDate: z.string().regex(DATE_RE),
    endDate: z.string().regex(DATE_RE),
    percent: z.number().finite().min(0).max(100),
    enabled: z.boolean(),
  })
  .strip()
  .superRefine((rule, ctx) => {
    if (rule.endDate < rule.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Peak season end date must be on or after its start date",
        path: ["endDate"],
      });
    }
  });

export const surgeSettingsSchema = z
  .object({
    enabled: z.boolean(),
    maxPercent: z.number().finite().min(0).max(200),
    endOfMonth: z
      .object({
        enabled: z.boolean(),
        startDay: z.number().int().min(1).max(31),
        percent: z.number().finite().min(0).max(100),
      })
      .strip(),
    peakRules: z.array(surgeRuleSchema).max(30),
  })
  .strip();

/** Never throws: an old or malformed workspace setting falls back to no surcharge. */
export function parseSurgeSettings(value: unknown): SurgeSettings {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const endOfMonth =
    source["endOfMonth"] && typeof source["endOfMonth"] === "object"
      ? (source["endOfMonth"] as Record<string, unknown>)
      : {};
  const parsed = surgeSettingsSchema.safeParse({
    ...DEFAULT_SURGE_SETTINGS,
    ...source,
    endOfMonth: {
      ...DEFAULT_SURGE_SETTINGS.endOfMonth,
      ...endOfMonth,
    },
  });
  return parsed.success ? parsed.data : DEFAULT_SURGE_SETTINGS;
}

function dayParts(value: string): { day: number; weekday: number; key: string } | null {
  const key = String(value ?? "").slice(0, 10);
  if (!DATE_RE.test(key)) return null;
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== key) return null;
  return { day: at.getUTCDate(), weekday: at.getUTCDay(), key };
}

/**
 * Applies every rule that matches the move date. Overlapping peak ranges do not
 * multiply each other: the highest matching seasonal range wins. Weekend and
 * end-of-month surcharges may stack on top, then the configured cap is enforced.
 */
export function applySurge(
  moveDate: string,
  base: number,
  settings: SurgeSettings,
  weekendPercent: number,
): SurgeResult {
  const safeBase = Number.isFinite(base) && base > 0 ? round2(base) : 0;
  const empty: SurgeResult = {
    enabled: settings.enabled,
    base: safeBase,
    percent: 0,
    amount: 0,
    total: safeBase,
    capped: false,
    lines: [],
  };
  if (!settings.enabled || safeBase <= 0) return empty;

  const date = dayParts(moveDate);
  if (!date) return empty;

  const lines: SurgeLine[] = [];
  const seasonal = settings.peakRules
    .filter(
      (rule) =>
        rule.enabled && rule.percent > 0 && rule.startDate <= date.key && date.key <= rule.endDate,
    )
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name))[0];
  if (seasonal) {
    lines.push({
      id: `peak:${seasonal.id}`,
      kind: "peak",
      label: `Peak season · ${seasonal.name}`,
      percent: seasonal.percent,
      amount: round2(safeBase * (seasonal.percent / 100)),
    });
  }

  const weekend = Math.min(100, Math.max(0, Number(weekendPercent) || 0));
  if (weekend > 0 && (date.weekday === 0 || date.weekday === 6)) {
    lines.push({
      id: "weekend",
      kind: "weekend",
      label: "Weekend service",
      percent: weekend,
      amount: round2(safeBase * (weekend / 100)),
    });
  }

  const eom = settings.endOfMonth;
  if (eom.enabled && eom.percent > 0 && date.day >= Math.max(1, eom.startDay)) {
    lines.push({
      id: "end_of_month",
      kind: "end_of_month",
      label: `End-of-month peak (from day ${Math.max(1, eom.startDay)})`,
      percent: eom.percent,
      amount: round2(safeBase * (eom.percent / 100)),
    });
  }

  if (!lines.length) return empty;

  const rawPercent = round2(lines.reduce((sum, line) => sum + line.percent, 0));
  const cap = Math.min(200, Math.max(0, Number(settings.maxPercent) || 0));
  const appliedPercent = cap > 0 ? Math.min(rawPercent, cap) : rawPercent;
  const capped = cap > 0 && rawPercent > appliedPercent;
  let amount = round2(lines.reduce((sum, line) => sum + line.amount, 0));

  if (capped) {
    const target = round2(safeBase * (appliedPercent / 100));
    const adjustment = round2(target - amount);
    if (Math.abs(adjustment) >= 0.01) {
      lines.push({
        id: "cap",
        kind: "cap",
        label: `Surge cap (${cap}% maximum)`,
        percent: 0,
        amount: adjustment,
      });
      amount = round2(amount + adjustment);
    }
  }

  return {
    enabled: true,
    base: safeBase,
    percent: appliedPercent,
    amount,
    total: round2(safeBase + amount),
    capped,
    lines,
  };
}

/** Alias used by the quote calculator; keeps the evaluator's public name explicit. */
export const surgeFor = applySurge;

/** Only a positive, internally consistent surge is stored on a quote. */
export function quoteSurgeFrom(
  result: SurgeResult,
  moveDate: string,
  appliedAt: string,
): QuoteSurgeSnapshot | null {
  if (!result.enabled || result.amount <= 0 || !result.lines.length) return null;
  return {
    version: 1,
    moveDate: String(moveDate ?? "").slice(0, 10),
    percent: result.percent,
    amount: result.amount,
    lines: result.lines,
    appliedAt,
  };
}

const LINE_KINDS = new Set<SurgeLineKind>(["peak", "weekend", "end_of_month", "cap"]);

export function parseQuoteSurge(value: unknown): QuoteSurgeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source["version"] !== 1) return null;
  const moveDate = typeof source["moveDate"] === "string" ? source["moveDate"] : "";
  const appliedAt = typeof source["appliedAt"] === "string" ? source["appliedAt"] : "";
  const percent = Number(source["percent"]);
  const amount = Number(source["amount"]);
  if (!DATE_RE.test(moveDate) || !appliedAt || !Number.isFinite(percent) || percent < 0) {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const lines = Array.isArray(source["lines"])
    ? source["lines"]
        .filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
        )
        .map((entry) => ({
          id: typeof entry["id"] === "string" ? entry["id"] : "",
          kind: entry["kind"] as SurgeLineKind,
          label: typeof entry["label"] === "string" ? entry["label"] : "",
          percent: Number(entry["percent"]),
          amount: Number(entry["amount"]),
        }))
        .filter(
          (line) =>
            line.id &&
            line.label &&
            LINE_KINDS.has(line.kind) &&
            Number.isFinite(line.percent) &&
            Number.isFinite(line.amount),
        )
    : [];
  if (!lines.length) return null;
  const lineTotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(lineTotal - round2(amount)) > 0.02) return null;
  return {
    version: 1,
    moveDate,
    percent: round2(percent),
    amount: round2(amount),
    lines,
    appliedAt,
  };
}
