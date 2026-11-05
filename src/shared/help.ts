import manual from "./help-manual.json";
import reference from "./help-reference.json";
import type { WorkspaceRole } from "./crm";

export type HelpChunk = {
  id: string;
  anchor: string;
  heading: string;
  level: number;
  chapter: string;
  headingPath: string[];
  markdown: string;
  text: string;
  routes: string[];
  roles: WorkspaceRole[];
  instructions: string[];
  notes: string[];
};
const currentBrand = (text: string) => text.replace(/NW Crew CRM|NW CREW CRM|NW CREW KNOWLEDGE CENTER/g, 'MoveFlew');
export const HELP_CHUNKS = (manual.chunks as HelpChunk[]).map(chunk => ({ ...chunk, heading: currentBrand(chunk.heading), markdown: currentBrand(chunk.markdown), text: currentBrand(chunk.text) }));
export const HELP_MANUAL_MARKDOWN = currentBrand(manual.markdown);
export const HELP_REFERENCES = currentBrand(manual.references);
export const HELP_VERSION = manual.version;
export const HELP_TERMS = manual.terms;
export const HELP_QUICK_TASKS = reference.quickTasks as Array<{
  id: string;
  title: string;
  route: string;
  minimumRole: string;
  roles: WorkspaceRole[];
  note: string;
}>;
export const HELP_FIELD_CHECKLIST = reference.fieldChecklist;
export const HELP_ROLES: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "estimator",
  "dispatcher",
  "crew",
];
export function roleLabel(role: WorkspaceRole): string {
  return {
    admin: "Admin",
    office_admin: "Office admin",
    estimator: "Sales & estimator",
    dispatcher: "Dispatcher",
    crew: "Field crew",
  }[role];
}
const finance: WorkspaceRole[] = ["admin", "office_admin"];
const management: WorkspaceRole[] = [...finance, "dispatcher"];
const office: WorkspaceRole[] = [...management, "estimator"];
const permissions: Record<string, WorkspaceRole[]> = {
  "/app/docs": HELP_ROLES,
  "/app/dashboard": HELP_ROLES,
  "/app/jobs": HELP_ROLES,
  "/app/documents": HELP_ROLES,
  "/app/field": [...management, "crew"],
  "/app/leads": office,
  "/app/pipeline": office,
  "/app/estimates": office,
  "/app/estimates/new": office,
  "/app/tariffs": office,
  "/app/communications": office,
  "/app/inventory-catalog": office,
  "/app/reports": office,
  "/app/marketing": office,
  "/app/reviews": office,
  "/app/dispatch": management,
  "/app/calendar": management,
  "/app/fleet": management,
  "/app/crew": management,
  "/app/operations": management,
  "/app/storage": management,
  "/app/trips": management,
  "/app/scanner": management,
  "/app/invoices": management,
  "/app/billing": finance,
  "/app/expenses": finance,
  "/app/payroll": finance,
  "/app/claims": finance,
  "/app/payment-gateway": finance,
  "/app/accounting": finance,
  "/app/claim-settlements": finance,
  "/app/integrations": finance,
  "/app/transactional-messages": finance,
  "/app/automation": finance,
  "/app/settings": finance,
};
export function canUseHelpRoute(route: string, role: WorkspaceRole): boolean {
  const clean = route.split(/[?#]/)[0];
  const lookup = /^\/app\/jobs\/(?:\d+|:id)(?:\/bol)?$/.test(clean)
    ? "/app/jobs"
    : clean === "/app"
      ? "/app/dashboard"
      : clean;
  return (permissions[lookup] || []).includes(role);
}
export function normalizeHelpSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export function searchHelp(
  query: string,
  chunks: HelpChunk[] = HELP_CHUNKS
): HelpChunk[] {
  let normalized = normalizeHelpSearch(query);
  if (!normalized) return chunks;
  for (const term of HELP_TERMS) {
    const russian = normalizeHelpSearch(term.ru);
    if (normalized.includes(russian))
      normalized = normalized.replace(russian, normalizeHelpSearch(term.en));
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return chunks.filter(chunk => {
    const haystack = normalizeHelpSearch(
      `${chunk.text} ${chunk.routes.join(" ")} ${chunk.roles.map(roleLabel).join(" ")}`
    );
    return tokens.every(token => haystack.includes(token));
  });
}
export function matchesHelpRoute(chunk: HelpChunk, route: string): boolean {
  return chunk.routes.some(candidate => {
    const pattern = candidate
      .split("?")[0]
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/:id/g, "\\d+");
    return new RegExp(`^${pattern}(?:[?#].*)?$`).test(route);
  });
}
