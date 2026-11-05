/** Workspace pages the assistant may link to. Links outside this list are never rendered. */
export const COPILOT_ROUTES: { path: string; label: string; about: string }[] = [
  { path: "/app/dashboard", label: "Overview", about: "metrics: open opportunities, scheduled moves, revenue, open invoices" },
  { path: "/app/leads", label: "Leads", about: "new enquiries incl. website widget/webhook leads" },
  { path: "/app/pipeline", label: "Sales pipeline", about: "move leads through stages" },
  { path: "/app/estimates", label: "Estimates", about: "estimate list" },
  { path: "/app/estimates/new", label: "New estimate", about: "estimate builder; 'Get exact route' button calculates Google Maps drive time and adds travel fee + fuel surcharge" },
  { path: "/app/tariffs", label: "Tariff engine", about: "rates and tariffs" },
  { path: "/app/jobs", label: "Jobs", about: "jobs; open an estimate job to create a customer proposal link with deposit override" },
  { path: "/app/dispatch", label: "Dispatch", about: "assign trucks and crew" },
  { path: "/app/calendar", label: "Dispatch calendar", about: "calendar of scheduled moves" },
  { path: "/app/fleet", label: "Fleet & crew", about: "trucks, crew, and the Crew tab to create worker invitation links (Driver/Helper/Crew Lead), copy, resend, revoke" },
  { path: "/app/workers", label: "Workers", about: "worker directory" },
  { path: "/app/field", label: "Field crew", about: "crew job sheets" },
  { path: "/app/storage", label: "Storage", about: "storage vaults" },
  { path: "/app/invoices", label: "Move invoices", about: "invoices" },
  { path: "/app/billing", label: "Billing & payments", about: "payments" },
  { path: "/app/reports", label: "Reports", about: "reports" },
  { path: "/app/settings", label: "Settings", about: "Pricing tab: default deposit (fixed $ or %), dispatch base address, travel charge rule (hourly/flat/per mile/none), fuel surcharge rule, rates; Membership tab; Sequences tab" },
  { path: "/app/settings/integrations", label: "Website integrations", about: "admins: embeddable quote widget snippet, Typeform/Jotform webhook URLs, API keys" },
  { path: "/app/docs", label: "Help center", about: "documentation" },
];
export const COPILOT_PATHS = new Set(COPILOT_ROUTES.map(r => r.path));
