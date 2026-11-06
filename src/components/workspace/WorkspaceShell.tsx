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
  HelpCircle,
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
import { Fragment, useEffect, useRef, useState } from "react";
import type { Branch } from "@shared/branches";
import { crm, getBranchId, setBranchId, type Workspace } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { FeedbackButton } from "./BetaTools";
import useProductTour from "@/hooks/useProductTour";
import "@/module-navigation.css";
/** Stable anchors the onboarding tour targets, independent of translated labels. */
const TOUR_TARGETS: Record<string, string> = {
  "/app/jobs": "jobs-nav",
  "/app/storage": "storage-vaults",
  "/app/estimates": "estimates-nav",
};
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
    href: "/app/branches",
    label: "Branches",
    icon: Building2,
    group: "Workspace",
    roles: finance,
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
    href: "/app/schedule",
    label: "Schedule",
    icon: CalendarDays,
    group: "Moving operations",
    roles: management,
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
    href: "/app/inventory",
    label: "Box scanning",
    icon: Package,
    group: "Moving operations",
    roles: [...office, "crew"],
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
    href: "/app/finance",
    label: "Financial analytics",
    icon: BarChart3,
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
  /** First sign-in: run the product tour once, after onboarding is finished. */
  autoStart?: boolean;
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
  autoStart = false,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false),
    [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [branchId, setBranch] = useState<number | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    if (!finance.includes(role)) {
      setBranches([]);
      setBranch(null);
      return;
    }
    let active = true;
    void crm
      .branches()
      .then((list) => {
        if (!active) return;
        setBranches(list);
        const stored = getBranchId();
        const selected =
          stored && list.some((branch) => branch.id === stored) ? stored : null;
        // A branch deleted in another tab must not keep filtering this workspace.
        if (stored && selected === null) setBranchId(null);
        setBranch(selected);
      })
      .catch(() => {
        if (!active) return;
        setBranches([]);
        setBranch(null);
      });
    return () => {
      active = false;
    };
  }, [role, workspace.id]);
  const changeBranch = (raw: string) => {
    const next = raw ? Number(raw) : null;
    setBranchId(next);
    setBranch(next);
    window.location.reload();
  };
  const openRef = useRef(open);
  const drawerOpenedForTour = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // Phones hide the sidebar behind a drawer. The tour opens it so every sidebar step
  // lands on a visible element; the menu button's own display is the breakpoint test.
  const drawerMode = () => {
    if (typeof window === "undefined") return false;
    const menu = document.querySelector<HTMLElement>(".ws-menu");
    if (!menu) return false;
    return window.getComputedStyle(menu).display !== "none";
  };
  const revealDrawer = () => {
    if (!drawerMode() || openRef.current) return false;
    drawerOpenedForTour.current = true;
    openRef.current = true;
    setOpen(true);
    return true;
  };
  const hideDrawer = () => {
    if (!drawerMode()) return false;
    drawerOpenedForTour.current = false;
    if (!openRef.current) return false;
    openRef.current = false;
    setOpen(false);
    return true;
  };
  const closeTourDrawer = () => {
    if (!drawerOpenedForTour.current) return;
    hideDrawer();
  };
  const waitForDrawer = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 240));
  const tour = useProductTour({
    autoStart,
    navigate,
    currentPath: path,
    onBeforeStart: async (tourId) => {
      if (tourId !== "full_platform") return;
      // Wait for the drawer transition so the first highlight is measured on it.
      if (revealDrawer()) await waitForDrawer();
    },
    onBeforeStep: async (_stepId, target) => {
      // A sidebar anchor needs the drawer; a page-content target must not sit
      // underneath it. Decide from the element that driver will actually highlight.
      if (!drawerMode()) return;
      const inSidebar = Boolean(target?.closest(".ws-sidebar"));
      const changed = inSidebar ? revealDrawer() : hideDrawer();
      if (changed) await waitForDrawer();
    },
    onTourEnd: closeTourDrawer,
  });
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
        data-tour="workspace-nav"
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
                  data-tour={TOUR_TARGETS[item.href]}
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
          {branches.length > 0 && (
            <label className="ws-branch-picker">
              <Building2 size={15} />
              <span className="ws-branch-picker__label">{t("Branch")}</span>
              <select
                aria-label={t("Branch context")}
                value={branchId ?? ""}
                onChange={(event) => changeBranch(event.target.value)}
              >
                <option value="">{t("All branches")}</option>
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ws-topbar__user">
            <button
              className="ws-btn ws-tour-trigger"
              data-tour="tour-trigger"
              title={t("Re-take the full platform tour")}
              aria-label={t("Re-take the full platform tour")}
              onClick={() => void tour.startTour("full_platform")}
            >
              <HelpCircle size={16} />
              <span className="ws-tour-trigger__label">{t("Re-take tour")}</span>
            </button>
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
