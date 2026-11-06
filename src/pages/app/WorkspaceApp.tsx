import OnboardingWizard from "@/components/workspace/OnboardingWizard";
import WorkspaceModules, { isNativeModule } from '@/components/workspace/modules/WorkspaceModules';
import StorageVaultPage from '@/pages/app/StorageVaultPage';
import StorageBillingPage from '@/pages/app/StorageBillingPage';
import SurgePricingPage from '@/pages/app/SurgePricingPage';
import SchedulePage from '@/pages/app/SchedulePage';
import OperationalReports from '@/components/workspace/OperationalReports';
import WorkspaceTariffs from '@/components/workspace/WorkspaceTariffs';
import BillingPanel from "@/components/workspace/BillingPanel";
import { supabase } from "@/integrations/supabase/client";
import { isReadOnly, PRICING_REMINDER } from "@/lib/onboarding";
import MobileField from "@/components/workspace/MobileField";
import { cacheField,readField } from '@/lib/field-offline';
import CopilotAssistant from "@/components/workspace/CopilotAssistant";
import { useAuth } from "@/_core/hooks/useAuth";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import AppearanceProvider from "@/components/workspace/AppearanceProvider";
import { ErrorNotice, LoadingBlock } from "@/components/workspace/WorkspaceUI";
import {
  crm,
  CrmApiError,
  setWorkspaceId,
  type Bootstrap,
  type Workspace,
} from "@/lib/crm";
import "@/workspace.css";
import { Building2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "@/lib/wouter";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {
  expandedPages,
  DocumentPage,
  WorkerDetailPage,
} from "../extended/module-routes";
import {
  DashboardPage,
  DispatchPage,
  EstimateWizardPage,
  EstimatesPage,
  FleetPage,
  InvoicesPage,
  JobDetailPage,
  JobsPage,
  LeadsPage,
  SettingsPage,
} from "./WorkspaceViews";

function CreateWorkspace({
  onCreated,
}: {
  onCreated: (workspace: Workspace) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreated(await crm.createWorkspace(name.trim()));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not create this workspace."
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="workspace">
      <main className="ws-onboard">
        <div className="ws-onboard__mark">
          <Building2 size={22} />
        </div>
        <LanguageSwitcher className="ws-language-switcher--onboard" />
        <h1>{t("Set up your workspace")}</h1>
        <p>
          {t(
            "Your workspace starts empty. Add the team and moving records you need—no demo customers are created."
          )}
        </p>
        <form onSubmit={submit}>
          <label>
            {t("Workspace name")}
            <input
              className="ws-input"
              autoFocus
              required
              minLength={2}
              placeholder={t("Company name")}
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
          {error && <div className="ws-error">{t(error)}</div>}
          <button className="ws-btn primary" disabled={saving || !name.trim()}>
            <Plus size={15} />
            {saving ? t("Creating…") : t("Create workspace")}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function WorkspaceApp() {
  const { t } = useI18n();
  const [location, navigate] = useLocation();
  const { user, loading: authLoading, logout } = useAuth();
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data: Bootstrap;
      try {
        data = await crm.bootstrap();
      } catch (reason) {
        if (!(reason instanceof CrmApiError) || reason.status !== 403)
          throw reason;
        setWorkspaceId(null);
        data = await crm.bootstrap();
      }
      if (!data.workspace) {
        // Company owners who registered on /register get their workspace on first sign-in.
        const { data: auth } = await supabase.auth.getUser();
        const meta = auth.user?.user_metadata ?? {};
        if (typeof meta["company_name"] === "string" && meta["company_name"].trim()) {
          const { data: wsId, error: regError } = await supabase.rpc("register_company", {
            _company: meta["company_name"], _owner: String(meta["owner_name"] ?? ""), _phone: String(meta["phone"] ?? ""),
          });
          if (regError) throw new Error(regError.message);
          setWorkspaceId(wsId as number);
          data = await crm.bootstrap();
        }
      }
      setBootstrap(data);
      setWorkspaceId(data.workspace?.id ?? null);
      if(user && data.workspace)await cacheField({userId:user.id,workspaceId:data.workspace.id},'bootstrap',data);
    } catch (reason) {
      const wsId=Number(localStorage.getItem('nwcrewcrm.workspace-id'));
      const cached=user && wsId && (!navigator.onLine || reason instanceof TypeError)?await readField<Bootstrap>({userId:user.id,workspaceId:wsId},'bootstrap'):null;
      if(cached)setBootstrap(cached);else setError(reason);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    void load();
  }, [authLoading, load, navigate, user]);

  useEffect(() => {
    if (location === "/app" || location === "/app/") navigate("/app/dashboard");
  }, [location, navigate]);

  const chooseWorkspace = async (id: number) => {
    setWorkspaceId(id);
    await load();
  };
  const createWorkspace = async (workspace: Workspace) => {
    setWorkspaceId(workspace.id);
    await load();
  };

  if (authLoading || (!user && !error))
    return (
      <div className="workspace">
        <LoadingBlock label={t("Checking your sign-in…")} />
      </div>
    );
  if (!user)
    return (
      <div className="workspace">
        <LoadingBlock label={t("Opening sign-in…")} />
      </div>
    );
  if (loading)
    return (
      <div className="workspace">
        <LoadingBlock label={t("Opening your workspace…")} />
      </div>
    );
  if (error)
    return (
      <div className="workspace">
        <main className="ws-content">
          <ErrorNotice error={error} retry={() => void load()} />
        </main>
      </div>
    );
  if (!bootstrap || !bootstrap.workspace)
    return <CreateWorkspace onCreated={createWorkspace} />;

  const ws = bootstrap.workspace;
  const needsSetup = ws.role === "admin" && !ws.onboardingCompleted;
  const pageProps = {
    role: bootstrap.workspace.role,
    navigate,
    path: location,
  };
  let page: React.ReactNode;
  const ExpandedPage = expandedPages[location];
  // The dispatch board shares the calendar's live job list, so booked jobs appear immediately.
  if (location === "/app/onboarding" || needsSetup)
    page = <OnboardingWizard workspaceId={ws.id} onDone={async () => { await load(); navigate("/app/dashboard"); }} />;
  else if (location === "/app/settings/billing") page = <BillingPanel workspace={ws} />;
  else if (location === "/app/schedule") page = <SchedulePage {...pageProps} />;
  else if (location === "/app/dispatch") page = <DispatchPage {...pageProps} />;
  else if (location === '/app/reports') page = <OperationalReports workspaceName={ws.name} />;
  else if (location === '/app/tariffs') page = <WorkspaceTariffs workspaceName={ws.name} role={ws.role} readOnly={isReadOnly(ws.subscriptionStatus)} />;
  else if (location === '/app/storage/billing') page = <StorageBillingPage role={ws.role} />;
  else if (location === '/app/storage') page = <StorageVaultPage role={ws.role} />;
  else if (isNativeModule(location)) page = <WorkspaceModules path={location} workspaceName={ws.name} navigate={navigate} />;
  else if (ExpandedPage) page = <ExpandedPage {...pageProps} />;
  else if (/^\/app\/workers\/\d+\/?$/.test(location))
    page = <WorkerDetailPage {...pageProps} />;
  else if (/^\/app\/jobs\/\d+\/bol\/?$/.test(location))
    page = <DocumentPage {...pageProps} />;
  else if (location === "/app/dashboard")
    page = <DashboardPage {...pageProps} />;
  else if (location === "/app/leads") page = <LeadsPage {...pageProps} />;
  else if (/^\/app\/estimates\/\d+\/?$/.test(location))
    page = <EstimateWizardPage {...pageProps} />;
  else if (location === "/app/estimates/new")
    page = <EstimateWizardPage {...pageProps} />;
  else if (location === "/app/estimates")
    page = <EstimatesPage {...pageProps} />;
  else if (location.match(/^\/app\/jobs\/\d+$/))
    page = <JobDetailPage {...pageProps} />;
  else if (location === "/app/jobs") page = <JobsPage {...pageProps} />;
  else if (location === "/app/calendar") page = <DispatchPage {...pageProps} />;
  else if (location === "/app/fleet" || location === "/app/crew")
    page = <FleetPage {...pageProps} />;
  else if (location === "/app/field")
    page =
      bootstrap.workspace.role === "estimator" ? (
        <div className="ws-alert">
          {t(
            "Field job sheets are available to dispatch, office admins, and assigned crew members."
          )}
        </div>
      ) : (
        <MobileField role={bootstrap.workspace.role} userId={user.id} workspaceId={ws.id} />
      );
  else if (location === "/app/invoices") page = <InvoicesPage {...pageProps} />;
  else if (location === "/app/settings/pricing")
    page = <SurgePricingPage role={ws.role} navigate={navigate} />;
  else if (location === "/app/settings") page = <SettingsPage {...pageProps} workspaceId={ws.id} appearanceWritable={!isReadOnly(ws.subscriptionStatus)} />;
  else if (location === "/app/settings/integrations")
    page = <SettingsPage key="integrations" {...pageProps} integrationsTab workspaceId={ws.id} appearanceWritable={!isReadOnly(ws.subscriptionStatus)} />;
  else page = <DashboardPage {...pageProps} />;

  return (
    <AppearanceProvider key={`${user.id}-${ws.id}`} userId={user.id} workspaceId={ws.id} initial={ws.appearance}><WorkspaceShell
      autoStart={!needsSetup}
      path={location}
      navigate={navigate}
      user={user}
      role={bootstrap.workspace.role}
      workspace={bootstrap.workspace}
      workspaces={bootstrap.workspaces}
      onWorkspace={id => void chooseWorkspace(id)}
      onLogout={() => void logout()}
    >
      {isReadOnly(ws.subscriptionStatus) && (
        <div className="ws-alert" role="alert">
          {t("This workspace is read-only because the subscription is past due or canceled. Your records are safe.")}{" "}
          {ws.role === "admin" && <button className="ws-btn" onClick={() => navigate("/app/settings/billing")}>{t("Update payment details")}</button>}
        </div>
      )}
      {ws.pricingDefaults && !needsSetup && (location === "/app/dashboard" || location === "/app/estimates/new") && (
        <div className="ws-alert">
          {t(PRICING_REMINDER)}{" "}
          {["admin", "office_admin"].includes(ws.role) && <button className="ws-btn" onClick={() => navigate("/app/settings")}>{t("Open pricing settings")}</button>}
        </div>
      )}
      <div key={`${bootstrap.workspace.id}-${location}`}>{page}</div>
      <CopilotAssistant key={`copilot-${bootstrap.workspace.id}`} path={location} navigate={navigate} />
    </WorkspaceShell></AppearanceProvider>
  );
}
