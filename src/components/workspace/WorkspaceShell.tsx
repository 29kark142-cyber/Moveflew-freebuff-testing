import MoveGridBrand from "@/components/MoveGridBrand";
import type { WorkspaceRole } from "@shared/crm";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  Contact,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Plug,
  ReceiptText,
  Route,
  Settings,
  ShieldCheck,
  Star,
  Truck,
  UsersRound,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import type { Workspace } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { FeedbackButton } from "./BetaTools";
import "@/module-navigation.css";
const office: WorkspaceRole[] = [
  "admin",
  "office_admin",
  "estimator",
  "dispatcher",
];
const management: WorkspaceRole[] = ["admin", "office_admin", "dispatcher"];
const finance: WorkspaceRole[] = ["admin", "office_admin"];
const field: WorkspaceRole[] = ["admin", "office_admin", "dispatcher", "crew"];
type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
  roles?: WorkspaceRole[];
};
const NAV: NavigationItem[] = [
  {
    href: "/app/workers",
    label: "Workers",
    icon: UsersRound,
    group: "Moving operations",
    roles: field,
  },
  {
    href: "/app/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    group: "Workspace",
  },
  {
    href: "/app/docs",
    label: "Help center",
    icon: BookOpen,
    group: "Workspace",
  },
  {
    href: "/app/leads",
    label: "Leads",
    icon: UsersRound,
    group: "Sales & customers",
    roles: office,
  },
  {
    href: "/app/pipeline",
    label: "Sales pipeline",
    icon: GitBranch,
    group: "Sales & customers",
    roles: office,
  },
  {
    href: "/app/estimates",
    label: "Estimates",
    icon: FileText,
    group: "Sales & customers",
    roles: office,
  },
  {
    href: "/app/tariffs",
    label: "Tariff engine",
    icon: FileText,
    group: "Sales & customers",
    roles: office,
  },
  {
    href: "/app/communications",
    label: "Communications",
    icon: MessageSquare,
    group: "Sales & customers",
    roles: office,
  },
  {
    href: "/app/jobs",
    label: "Jobs",
    icon: ClipboardList,
    group: "Moving operations",
  },
  {
    href: "/app/dispatch",
    label: "Dispatch",
    icon: CalendarDays,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/calendar",
    label: "Calendar",
    icon: CalendarDays,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/scanner",
    label: "Warehouse scanner",
    icon: Package,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/trips",
    label: "Trip planning",
    icon: Route,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/fleet",
    label: "Fleet & crew",
    icon: Truck,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/operations",
    label: "Resource availability",
    icon: CalendarDays,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/storage",
    label: "Storage",
    icon: Warehouse,
    group: "Moving operations",
    roles: management,
  },
  {
    href: "/app/inventory-catalog",
    label: "Inventory catalog",
    icon: Package,
    group: "Moving operations",
    roles: office,
  },
  {
    href: "/app/field",
    label: "Field crew",
    icon: Contact,
    group: "Moving operations",
    roles: field,
  },
  {
    href: "/app/documents",
    label: "Job documents",
    icon: FileText,
    group: "Moving operations",
  },
  {
    href: "/app/invoices",
    label: "Move invoices",
    icon: ReceiptText,
    group: "Finance & service",
    roles: management,
  },
  {
    href: "/app/billing",
    label: "Billing & payments",
    icon: Wallet,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/expenses",
    label: "Expenses",
    icon: ReceiptText,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/payroll",
    label: "Payroll & tips",
    icon: UsersRound,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/claims",
    label: "Claims",
    icon: ShieldCheck,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/payment-gateway",
    label: "Merchant gateway",
    icon: Wallet,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/accounting",
    label: "QuickBooks accounting",
    icon: ReceiptText,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/claim-settlements",
    label: "Claims & settlements",
    icon: ShieldCheck,
    group: "Finance & service",
    roles: finance,
  },
  {
    href: "/app/reports",
    label: "Reports",
    icon: BarChart3,
    group: "Growth & insights",
    roles: office,
  },
  {
    href: "/app/marketing",
    label: "Marketing",
    icon: BarChart3,
    group: "Growth & insights",
    roles: office,
  },
  {
    href: "/app/reviews",
    label: "Reviews",
    icon: Star,
    group: "Growth & insights",
    roles: office,
  },
  {
    href: "/app/integrations",
    label: "Integrations & API",
    icon: Plug,
    group: "Administration",
    roles: finance,
  },
  {
    href: "/app/transactional-messages",
    label: "Transactional messaging",
    icon: MessageSquare,
    group: "Administration",
    roles: finance,
  },
  {
    href: "/app/automation",
    label: "Automations",
    icon: CalendarDays,
    group: "Administration",
    roles: finance,
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: Settings,
    group: "Administration",
    roles: finance,
  },
];
type Props = {
  children: React.ReactNode;
  path: string;
  navigate: (to: string) => void;
  user: { name?: string | null; email?: string | null };
  role: WorkspaceRole;
  workspaces: Workspace[];
  workspace: Workspace;
  onWorkspace: (id: number) => void;
  onLogout: () => void;
};
const roleName: Record<WorkspaceRole, string> = {
  admin: "Admin",
  office_admin: "Office admin",
  estimator: "Sales & estimator",
  dispatcher: "Dispatcher",
  crew: "Field crew",
};
export default function WorkspaceShell({
  children,
  path,
  navigate,
  user,
  role,
  workspaces,
  workspace,
  onWorkspace,
  onLogout,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [workspaceOpen, setWorkspaceOpen] = useState(false);
  const go = (href: string) => {
    navigate(href);
    setOpen(false);
  };
  const accessible = NAV.filter(
    item => !item.roles || item.roles.includes(role)
  );
  return (
    <div className="workspace">
      <aside
        className={`ws-sidebar ${open ? "is-open" : ""}`}
        aria-label={t("Workspace navigation")}
      >
        <div className="ws-sidebrand">
          <MoveGridBrand />
          <button
            className="ws-mobile-close"
            aria-label={t("Close navigation")}
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="ws-workspace-switcher">
          <button onClick={() => setWorkspaceOpen(!workspaceOpen)}>
            <Building2 size={16} />
            <span>
              <b>{workspace.name}</b>
              <small>{t(roleName[role])}</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {workspaceOpen && (
            <div className="ws-workspace-menu">
              {workspaces.map(item => (
                <button
                  key={item.id}
                  className={item.id === workspace.id ? "active" : ""}
                  onClick={() => {
                    onWorkspace(item.id);
                    setWorkspaceOpen(false);
                  }}
                >
                  <span>{item.name}</span>
                  <small>{t(roleName[item.role])}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="ws-nav">
          {accessible.map((item, index) => {
            const Icon = item.icon;
            const selected =
              path === item.href ||
              (item.href !== "/app/dashboard" &&
                path.startsWith(`${item.href}/`));
            return (
              <Fragment key={item.href}>
                {accessible[index - 1]?.group !== item.group && (
                  <div className="ws-nav__group">{t(item.group)}</div>
                )}
                <button
                  className={selected ? "active" : ""}
                  onClick={() => go(item.href)}
                >
                  <Icon size={18} />
                  <span>{t(item.label)}</span>
                </button>
              </Fragment>
            );
          })}
        </nav>
        <div className="ws-account">
          <div className="ws-avatar">
            {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="ws-account__text">
            <b>{user.name || t("Signed-in user")}</b>
            <span>{t(roleName[role])}</span>
          </div>
          <button
            title={t("Sign out")}
            aria-label={t("Sign out")}
            onClick={onLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="ws-nav-backdrop"
          aria-label={t("Close navigation")}
          onClick={() => setOpen(false)}
        />
      )}
      <section className="ws-main">
        <header className="ws-topbar">
          <button
            className="ws-menu"
            aria-label={t("Open navigation")}
            onClick={() => setOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="ws-topbar__crumb">
            <span>MoveFlew</span>
            <strong>{workspace.name}</strong>
          </div>
          <div className="ws-topbar__user">
            <FeedbackButton />
            <LanguageSwitcher />
            <CircleUserRound size={20} />
            <span>{user.email}</span>
          </div>
        </header>
        <main className="ws-content">{children}</main>
      </section>
    </div>
  );
}
