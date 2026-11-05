import { lazy, type ComponentType } from "react";
import type { ModuleProps } from "@shared/expansion";
const operations = (
  name:
    | "StoragePage"
    | "BillingPage"
    | "ClaimsPage"
    | "PayrollPage"
    | "ExpensesPage"
    | "OperationsPage"
    | "BolPage"
) =>
  lazy(() =>
    import("./OperationsPages").then(module => ({ default: module[name] }))
  );
const engagement = (
  name:
    | "PipelinePage"
    | "CommunicationsPage"
    | "ReportsPage"
    | "MarketingPage"
    | "ReviewsPage"
    | "IntegrationsPage"
    | "InventoryCatalogPage"
) =>
  lazy(() =>
    import("./EngagementPages").then(module => ({ default: module[name] }))
  );
export const DocumentPage = operations("BolPage");
export const expandedPages: Record<string, ComponentType<ModuleProps>> = {
  "/app/workers": lazy(() => import("../workers/WorkersPage")),
  "/app/docs": lazy(() => import("../help/HelpPage")),
  "/app/storage": operations("StoragePage"),
  "/app/billing": operations("BillingPage"),
  "/app/claims": operations("ClaimsPage"),
  "/app/payroll": operations("PayrollPage"),
  "/app/expenses": operations("ExpensesPage"),
  "/app/operations": operations("OperationsPage"),
  "/app/documents": DocumentPage,
  "/app/pipeline": engagement("PipelinePage"),
  "/app/communications": engagement("CommunicationsPage"),
  "/app/reports": engagement("ReportsPage"),
  "/app/marketing": engagement("MarketingPage"),
  "/app/reviews": engagement("ReviewsPage"),
  "/app/integrations": engagement("IntegrationsPage"),
  "/app/inventory-catalog": engagement("InventoryCatalogPage"),
  "/app/trips": lazy(() => import("./TripPlanning")),
  "/app/automation": lazy(() => import("./AutomationPage")),
  "/app/dispatch": lazy(() => import("../core/DispatchTimeline")),
  "/app/payment-gateway": lazy(() => import("../core/PaymentsPage")),
  "/app/transactional-messages": lazy(() => import("../core/MessagingPage")),
  "/app/accounting": lazy(() => import("../core/AccountingPage")),
  "/app/scanner": lazy(() => import("../core/ScannerPage")),
  "/app/tariffs": lazy(() => import("../core/TariffsPage")),
  "/app/claim-settlements": lazy(() => import("../core/ClaimsDesk")),
};

export const WorkerDetailPage = lazy(
  () => import("../workers/WorkerDetailPage")
);
