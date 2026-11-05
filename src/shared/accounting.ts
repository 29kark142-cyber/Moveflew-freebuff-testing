export const QBO_ACCOUNT_KEYS = [
  "sales_revenue",
  "storage_sit_revenue",
  "materials_cogs",
  "inventory_asset",
  "tip_liability",
  "sales_tax_liability",
  "unearned_prepayments",
  "cash",
  "receivables",
  "claims_expense",
  "claims_liability",
] as const;

export type QboAccountKey = (typeof QBO_ACCOUNT_KEYS)[number];

export const QBO_ACCOUNT_EXPECTATIONS: Record<
  QboAccountKey,
  { label: string; classifications: readonly string[] }
> = {
  sales_revenue: {
    label: "Sales revenue",
    classifications: ["Revenue", "Income"],
  },
  storage_sit_revenue: {
    label: "Storage / SIT revenue",
    classifications: ["Revenue", "Income"],
  },
  materials_cogs: { label: "Materials COGS", classifications: ["Expense"] },
  inventory_asset: { label: "Inventory asset", classifications: ["Asset"] },
  tip_liability: { label: "Tip liability", classifications: ["Liability"] },
  sales_tax_liability: {
    label: "Sales tax liability",
    classifications: ["Liability"],
  },
  unearned_prepayments: {
    label: "Unearned customer prepayments",
    classifications: ["Liability"],
  },
  cash: { label: "Cash / undeposited funds", classifications: ["Asset"] },
  receivables: { label: "Accounts receivable", classifications: ["Asset"] },
  claims_expense: { label: "Claims expense", classifications: ["Expense"] },
  claims_liability: {
    label: "Claims liability",
    classifications: ["Liability"],
  },
};

export type AccountingLine = {
  accountKey: QboAccountKey;
  debitCents: number;
  creditCents: number;
  memo?: string;
};

export type AccountingJournal = {
  sourceKey: string;
  transactionDate: string;
  memo: string;
  lines: AccountingLine[];
};

export type MappedQboAccount = {
  accountKey: QboAccountKey;
  qboAccountId: string;
  name?: string;
  classification?: string;
};

export type QboJournalEntry = {
  TxnDate: string;
  PrivateNote: string;
  Line: Array<{
    DetailType: "JournalEntryLineDetail";
    Amount: number;
    Description?: string;
    JournalEntryLineDetail: {
      PostingType: "Debit" | "Credit";
      AccountRef: { value: string };
    };
  }>;
};

export type QboInboundEntity = "invoice" | "payment" | "journalentry";
export type InboundDecision =
  | "pending"
  | "accepted"
  | "ignored"
  | "conflict"
  | "unsupported";

function wholeCents(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${field} must be a non-negative integer cents value`);
}

export function isQboAccountKey(value: unknown): value is QboAccountKey {
  return (
    typeof value === "string" &&
    (QBO_ACCOUNT_KEYS as readonly string[]).includes(value)
  );
}

/** QBO account Classification is provider data; names are display-only and never mapping evidence. */
export function isExpectedQboAccountClassification(
  accountKey: QboAccountKey,
  classification: unknown
): boolean {
  if (typeof classification !== "string") return false;
  return QBO_ACCOUNT_EXPECTATIONS[accountKey].classifications.some(
    value => value.toLowerCase() === classification.trim().toLowerCase()
  );
}

/** Throws before anything can be queued or serialized with an unbalanced amount. */
export function assertBalancedJournal(lines: AccountingLine[]): {
  debitCents: number;
  creditCents: number;
} {
  if (!Array.isArray(lines) || lines.length < 2)
    throw new Error("A journal needs at least two lines");
  let debitCents = 0;
  let creditCents = 0;
  for (const [index, line] of lines.entries()) {
    if (!isQboAccountKey(line.accountKey))
      throw new Error(`lines[${index}].accountKey is not a supported mapping`);
    wholeCents(line.debitCents, `lines[${index}].debitCents`);
    wholeCents(line.creditCents, `lines[${index}].creditCents`);
    if ((line.debitCents === 0) === (line.creditCents === 0))
      throw new Error(`lines[${index}] must have exactly one debit or credit`);
    debitCents += line.debitCents;
    creditCents += line.creditCents;
  }
  if (!Number.isSafeInteger(debitCents) || !Number.isSafeInteger(creditCents))
    throw new Error("Journal total exceeds safe integer cents range");
  if (debitCents !== creditCents)
    throw new Error(
      `Journal is not balanced (${debitCents} debit / ${creditCents} credit)`
    );
  return { debitCents, creditCents };
}

export function dateOnlyUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** QBO uses decimal amounts; all application calculations remain integer cents. */
export function qboAmountFromCents(cents: number): number {
  wholeCents(cents, "cents");
  return Number((cents / 100).toFixed(2));
}

export function toQboJournalEntry(
  journal: AccountingJournal,
  accountMappings: Iterable<MappedQboAccount>
): QboJournalEntry {
  assertBalancedJournal(journal.lines);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(journal.transactionDate))
    throw new Error("transactionDate must be YYYY-MM-DD");
  if (!journal.sourceKey.trim() || journal.sourceKey.length > 160)
    throw new Error(
      "sourceKey is required and must be 160 characters or fewer"
    );
  const mapping = new Map<string, MappedQboAccount>();
  for (const entry of accountMappings) mapping.set(entry.accountKey, entry);
  return {
    TxnDate: journal.transactionDate,
    PrivateNote: `${journal.memo}\nNW Crew source: ${journal.sourceKey}`.slice(
      0,
      4000
    ),
    Line: journal.lines.map(line => {
      const account = mapping.get(line.accountKey);
      if (!account?.qboAccountId)
        throw new Error(`No QuickBooks account mapping for ${line.accountKey}`);
      const debit = line.debitCents > 0;
      return {
        DetailType: "JournalEntryLineDetail",
        Amount: qboAmountFromCents(debit ? line.debitCents : line.creditCents),
        ...(line.memo ? { Description: line.memo.slice(0, 4000) } : {}),
        JournalEntryLineDetail: {
          PostingType: debit ? "Debit" : "Credit",
          AccountRef: { value: account.qboAccountId },
        },
      };
    }),
  };
}

export type ReconciliationCandidate = {
  localKind: "invoice" | "payment" | "journal" | null;
  localId: number | null;
  localCents: number | null;
  localStatus?: string | null;
};

export function inboundDecisionFor(
  entity: QboInboundEntity,
  remote: Record<string, unknown>,
  candidate: ReconciliationCandidate
): { decision: InboundDecision; reason: string; remoteCents: number | null } {
  const numericAmount =
    typeof remote.TotalAmt === "number"
      ? remote.TotalAmt
      : typeof remote.TotalAmt === "string"
        ? Number(remote.TotalAmt)
        : NaN;
  const remoteCents = Number.isFinite(numericAmount)
    ? Math.round(numericAmount * 100)
    : null;
  if (entity === "journalentry")
    return {
      decision: "unsupported",
      reason:
        "QuickBooks JournalEntry is retained for reconciliation only; there is no safe local apply path.",
      remoteCents,
    };
  if (!candidate.localId)
    return {
      decision: "pending",
      reason: `Imported QuickBooks ${entity} has no safe local match`,
      remoteCents,
    };
  if (
    remoteCents !== null &&
    candidate.localCents !== null &&
    remoteCents !== candidate.localCents
  )
    return {
      decision: "conflict",
      reason: `Amount differs from local ${candidate.localKind ?? "record"}`,
      remoteCents,
    };
  if (candidate.localStatus === "paid" && entity === "invoice")
    return {
      decision: "conflict",
      reason:
        "Local invoice is paid; remote changes require manual reconciliation",
      remoteCents,
    };
  return {
    decision: "pending",
    reason:
      "Review before applying; inbound data never changes local money automatically",
    remoteCents,
  };
}

function remoteCents(value: unknown): number | null {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

function linkedInvoiceId(remote: Record<string, unknown>): string | null {
  if (!Array.isArray(remote.Line)) return null;
  for (const line of remote.Line) {
    if (!line || typeof line !== "object") continue;
    const linked = (line as Record<string, unknown>).LinkedTxn;
    if (!Array.isArray(linked)) continue;
    for (const item of linked) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (
        row.TxnType === "Invoice" &&
        typeof row.TxnId === "string" &&
        row.TxnId
      )
        return row.TxnId;
    }
  }
  return null;
}

export type InboundApplyPlan =
  | {
      kind: "invoice";
      remoteCents: number;
      balanceCents: number;
      dueDate: string | null;
    }
  | { kind: "payment"; remoteCents: number; linkedInvoiceQboId: string };

/**
 * Validates only facts that can safely be applied to a deliberately mapped local row.
 * It never permits an inbound amount to create or alter local money.
 */
export function inboundApplyPlan(
  entity: Extract<QboInboundEntity, "invoice" | "payment">,
  remote: Record<string, unknown>,
  candidate: ReconciliationCandidate
): InboundApplyPlan {
  const decision = inboundDecisionFor(entity, remote, candidate);
  if (decision.decision !== "pending") throw new Error(decision.reason);
  const totalCents = remoteCents(remote.TotalAmt);
  if (totalCents === null)
    throw new Error("QuickBooks record has no valid non-negative TotalAmt");
  if (entity === "invoice") {
    const balanceCents = remoteCents(remote.Balance);
    if (balanceCents === null || balanceCents > totalCents)
      throw new Error("QuickBooks invoice has no valid Balance");
    const dueDate =
      typeof remote.DueDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(remote.DueDate)
        ? remote.DueDate
        : null;
    return { kind: "invoice", remoteCents: totalCents, balanceCents, dueDate };
  }
  const invoiceId = linkedInvoiceId(remote);
  if (!invoiceId)
    throw new Error(
      "QuickBooks payment is not explicitly linked to an invoice"
    );
  return {
    kind: "payment",
    remoteCents: totalCents,
    linkedInvoiceQboId: invoiceId,
  };
}

export function sameQboSyncToken(
  expected: string | null | undefined,
  actual: unknown
): boolean {
  return (
    typeof expected === "string" && expected.length > 0 && expected === actual
  );
}

export type CdcChange = {
  entityType: QboInboundEntity;
  id: string;
  syncToken: string | null;
  deleted: boolean;
  payload: Record<string, unknown>;
};

const entityNames: Array<[string, QboInboundEntity]> = [
  ["Invoice", "invoice"],
  ["Payment", "payment"],
  ["JournalEntry", "journalentry"],
];

/** Extracts only CDC entity records, not nested transaction lines. */
export function extractQboCdcChanges(payload: unknown): CdcChange[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const cdc = Array.isArray(root.CDCResponse) ? root.CDCResponse : [];
  const result: CdcChange[] = [];
  for (const batch of cdc) {
    if (!batch || typeof batch !== "object") continue;
    const responses = (batch as Record<string, unknown>).QueryResponse;
    const items = Array.isArray(responses) ? responses : [responses];
    for (const response of items) {
      if (!response || typeof response !== "object") continue;
      const records = response as Record<string, unknown>;
      for (const [qboName, entityType] of entityNames) {
        const values = records[qboName];
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          if (!value || typeof value !== "object") continue;
          const item = value as Record<string, unknown>;
          const id = typeof item.Id === "string" ? item.Id : "";
          if (!id) continue;
          result.push({
            entityType,
            id,
            syncToken:
              typeof item.SyncToken === "string" ? item.SyncToken : null,
            deleted: item.status === "Deleted",
            payload: item,
          });
        }
      }
    }
  }
  return result;
}
