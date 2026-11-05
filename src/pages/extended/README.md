# Operations pages

`OperationsPages.tsx` exports the route components required by the expansion contract:

| Export | Intended route / use | Required operations backend fields |
|---|---|---|
| `StoragePage` | Storage module | facilities, vaults (including `occupiedCuft`), storage accounts/items/movements |
| `BillingPage` | Billing module | invoices, payments, monthly billing run, Stripe TEST checkout |
| `ClaimsPage` | Claims module | claims and claim events |
| `PayrollPage` | Payroll module | timecards, payroll report, tips |
| `ExpensesPage` | Expense module | expenses |
| `OperationsPage` | Operations module | unavailability plus existing CRM crew, trucks, jobs/inventory |
| `BolPage` | `/app/jobs/:id/bol`; `/app/documents` picker fallback | BOL document with job, customer, company, damages, terms, `generatedAt` |

The pages use `client/src/lib/ops-api.ts`, which calls contract paths through `crmFetch`, and `client/src/operations.css`. Client role guards only provide a clear UI notice; the operations backend must continue to enforce authorization and tenant foreign-ID validation. Monetary form inputs convert USD strings to integer cents immediately before POST/PATCH.

No page creates demo records, assumes payment success, or stores card details. The invoice checkout button is explicitly **Stripe TEST** and refreshes the verified ledger after focus returns.
