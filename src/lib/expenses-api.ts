import { crmFetch } from "@/lib/crm";
import type { FinanceExpense } from "@shared/finance";

const json = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

export const expensesApi = {
  list: () => crmFetch<FinanceExpense[]>("/expenses"),
  create: (value: Omit<FinanceExpense, "id">) =>
    crmFetch<FinanceExpense>("/expenses", json("POST", value)),
};
