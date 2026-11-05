import {
  BookOpen,
  Check,
  Code2,
  Copy,
  KeyRound,
  Link2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  ShieldOff,
  Webhook as WebhookIcon,
} from "lucide-react";
import { useState } from "react";
import type { AccessKey, ModuleProps, Webhook } from "@shared/expansion";
import { crm } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import {
  EmptyState,
  Modal,
  useRemote,
} from "@/components/workspace/WorkspaceUI";
import { engage } from "@/lib/engage-api";
import {
  CopyButton,
  PageFailure,
  PageHead,
  PageLoading,
  PermissionNotice,
  StatusChip,
  canAdmin,
  formatDate,
} from "./EngagementUI";

type Tab = "connections" | "keys" | "webhooks" | "docs" | "embed" | "portal";
type Secret = {
  label: string;
  token: string;
  relative?: string;
  iframe?: string;
};
const tabList: Array<{ id: Tab; label: string }> = [
  { id: "connections", label: "Vendor connections" },
  { id: "keys", label: "API keys" },
  { id: "webhooks", label: "Webhooks" },
  { id: "docs", label: "Docs" },
  { id: "embed", label: "Embed forms" },
  { id: "portal", label: "Portal links" },
];

export function IntegrationsPage({ role, navigate }: ModuleProps) {
  const { t, tx } = useI18n();
  const { data, loading, error, refresh } = useRemote(
    () =>
      Promise.all([
        engage.integrations(),
        engage.keys(),
        engage.webhooks(),
        engage.webhookDeliveries(),
        crm.customers(),
        engage.apiDocs().catch(() => null),
      ]),
    []
  );
  const [tab, setTab] = useState<Tab>("connections");
  const [keyOpen, setKeyOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [notice, setNotice] = useState("");
  const admin = canAdmin(role);
  if (loading)
    return <PageLoading label="Loading integration configuration…" />;
  if (error || !data)
    return (
      <PageFailure
        heading="Integrations"
        caption="Configured connections, developer access, and delivery records."
        error={error}
        retry={() => void refresh()}
      />
    );
  const [integrations, keys, webhooks, deliveries, customers, docs] = data;
  const revoke = async (key: AccessKey) => {
    if (!admin || key.revoked) return;
    setNotice("");
    try {
      await engage.revokeKey(key.id);
      setNotice("Access key revoked.");
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not revoke access key."
      );
    }
  };
  const test = async (webhook: Webhook) => {
    if (!admin) return;
    setNotice("");
    try {
      await engage.testWebhook(webhook.id);
      setNotice(
        "A real signed test was requested. Delivery history below reflects server attempts."
      );
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not request webhook test."
      );
    }
  };
  const toggleWebhook = async (webhook: Webhook) => {
    if (!admin) return;
    setNotice("");
    try {
      await engage.updateWebhook(webhook.id, { enabled: !webhook.enabled });
      await refresh();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not update webhook."
      );
    }
  };
  return (
    <>
      <PageHead
        heading="Integrations"
        caption="Connection status is reported from this workspace. Available tools are not represented as active vendor connections."
        actions={
          admin ? (
            <>
              <button className="ws-btn" onClick={() => setWebhookOpen(true)}>
                <WebhookIcon size={15} />
                {t("Add webhook")}
              </button>
              <button
                className="ws-btn primary"
                onClick={() => setKeyOpen(true)}
              >
                <KeyRound size={15} />
                {t("Create access key")}
              </button>
            </>
          ) : undefined
        }
      />
      {!admin && <PermissionNotice />}
      {admin && (
        <section className="ws-card ws-card-pad" style={{ marginBottom: 18 }}>
          <div className="ws-card-title">
            <div>
              <h2>
                {tx("Core provider setup", "Настройка основных сервисов")}
              </h2>
              <p>
                {tx(
                  "Open the connected modules to configure merchant activation, transactional messaging, and QuickBooks mappings. Credentials and live activation are separate steps.",
                  "Откройте модули для настройки оплаты, уведомлений и счетов QuickBooks. Учётные данные и активация сервисов настраиваются отдельно."
                )}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button
              className="ws-btn"
              onClick={() => navigate("/app/payment-gateway")}
            >
              {tx("Merchant gateway", "Платёжный шлюз")}
            </button>
            <button
              className="ws-btn"
              onClick={() => navigate("/app/transactional-messages")}
            >
              {tx("Email & SMS", "Email и SMS")}
            </button>
            <button
              className="ws-btn"
              onClick={() => navigate("/app/accounting")}
            >
              {tx("QuickBooks Online", "QuickBooks Online")}
            </button>
          </div>
        </section>
      )}
      {notice && (
        <div
          className={
            /revoked|requested/.test(notice) ? "eg-success" : "ws-error"
          }
        >
          {t(notice)}
        </div>
      )}
      <nav className="eg-tabs" aria-label={t("Integration sections")}>
        {tabList.map(item => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </nav>
      {tab === "connections" && (
        <section className="ws-card ws-card-pad">
          <div className="ws-card-title">
            <div>
              <h2>{t("Vendor connections")}</h2>
              <p>
                {t(
                  "Statuses come from the integration registry; documented APIs and CSV workflows are distinct from connected adapters."
                )}
              </p>
            </div>
          </div>
          <div className="eg-provider-grid">
            {integrations.providers.map(provider => (
              <article
                className="eg-provider"
                key={`${provider.category}-${provider.name}`}
              >
                <div>
                  <b>{provider.name}</b>
                  <small>{provider.category}</small>
                </div>
                <StatusChip status={provider.status} />
                <p>{provider.detail}</p>
                {provider.documentationUrl && (
                  <a
                    href={provider.documentationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Documentation")}
                  </a>
                )}
              </article>
            ))}
          </div>
          {!integrations.providers.length && (
            <EmptyState
              title="No registered integrations"
              detail="No vendor connection status was returned for this workspace."
            />
          )}
          <div className="eg-connection-flags">
            <span>
              {t("Payments mode")}: <b>{integrations.paymentMode}</b>
            </span>
            <span>
              {t("Email provider")}:{" "}
              <b>
                {integrations.emailConnected
                  ? t("connected")
                  : t("not connected")}
              </b>
            </span>
            <span>
              {t("SMS provider")}:{" "}
              <b>
                {integrations.smsConnected
                  ? t("connected")
                  : t("not connected")}
              </b>
            </span>
          </div>
        </section>
      )}
      {tab === "keys" && (
        <KeysTab
          keys={keys}
          customers={customers}
          admin={admin}
          onCreate={() => setKeyOpen(true)}
          onRevoke={revoke}
        />
      )}
      {tab === "webhooks" && (
        <WebhooksTab
          webhooks={webhooks}
          deliveries={deliveries}
          admin={admin}
          onAdd={() => setWebhookOpen(true)}
          onTest={test}
          onToggle={toggleWebhook}
        />
      )}
      {tab === "docs" && <DocsTab docs={docs} />}
      {tab === "embed" && <EmbedTab keys={keys} />}
      {tab === "portal" && <PortalTab keys={keys} customers={customers} />}
      {keyOpen && (
        <KeyEditor
          customers={customers}
          onClose={() => setKeyOpen(false)}
          onCreated={async result => {
            setKeyOpen(false);
            const relative =
              result.key.kind === "widget"
                ? `/quote/${result.token}`
                : result.key.kind === "portal"
                  ? `/portal/${result.token}`
                  : undefined;
            const absolute = relative
              ? `${window.location.origin}${relative}`
              : undefined;
            setSecret({
              label:
                result.key.kind === "api"
                  ? "New API key"
                  : "New public access link",
              token: result.token,
              relative,
              iframe:
                result.key.kind === "widget" && absolute
                  ? `<iframe src="${absolute}" title="Moving quote request" width="100%" height="720" frameborder="0"></iframe>`
                  : undefined,
            });
            await refresh();
          }}
        />
      )}
      {webhookOpen && (
        <WebhookEditor
          onClose={() => setWebhookOpen(false)}
          onCreated={async result => {
            setWebhookOpen(false);
            setSecret({
              label: "Webhook signing secret",
              token: result.secret,
            });
            await refresh();
          }}
        />
      )}
      {secret && (
        <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      )}
    </>
  );
}

function KeysTab({
  keys,
  customers,
  admin,
  onCreate,
  onRevoke,
}: {
  keys: AccessKey[];
  customers: Awaited<ReturnType<typeof crm.customers>>;
  admin: boolean;
  onCreate: () => void;
  onRevoke: (key: AccessKey) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{t("API keys")}</h2>
          <p>
            {t(
              "Tokens are never stored in this browser and are shown only once at creation."
            )}
          </p>
        </div>
        {admin && (
          <button className="ws-btn primary" onClick={onCreate}>
            <Plus size={14} />
            {t("Create key")}
          </button>
        )}
      </div>
      <div className="ws-table-wrap">
        <table className="ws-table">
          <thead>
            <tr>
              <th>{t("Name")}</th>
              <th>{t("Kind")}</th>
              <th>{t("Scopes")}</th>
              <th>{t("Customer binding")}</th>
              <th>{t("Expiry")}</th>
              <th>{t("Status")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key.id}>
                <td>
                  <span className="ws-table-main">{key.name}</span>
                  <small>{key.prefix}…</small>
                </td>
                <td>{key.kind}</td>
                <td>{key.scopes.join(", ")}</td>
                <td>
                  {key.customerId
                    ? customers.find(customer => customer.id === key.customerId)
                        ?.name || `#${key.customerId}`
                    : "—"}
                </td>
                <td>{key.expiresAt || "—"}</td>
                <td>
                  <StatusChip status={key.revoked ? "revoked" : "active"} />
                </td>
                <td>
                  {admin && !key.revoked && (
                    <button
                      className="ws-btn danger"
                      onClick={() => onRevoke(key)}
                    >
                      <ShieldOff size={14} />
                      {t("Revoke")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!keys.length && (
        <EmptyState
          title="No access keys"
          detail="Create a scoped key only for an approved integration or public access flow."
        />
      )}
    </section>
  );
}

function WebhooksTab({
  webhooks,
  deliveries,
  admin,
  onAdd,
  onTest,
  onToggle,
}: {
  webhooks: Webhook[];
  deliveries: Awaited<ReturnType<typeof engage.webhookDeliveries>>;
  admin: boolean;
  onAdd: () => void;
  onTest: (hook: Webhook) => void;
  onToggle: (hook: Webhook) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="eg-webhook-layout">
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Webhooks")}</h2>
            <p>
              {t(
                "HTTPS destinations only. Testing makes a real signed safe request; it does not invent delivery history."
              )}
            </p>
          </div>
          {admin && (
            <button className="ws-btn primary" onClick={onAdd}>
              <Plus size={14} />
              {t("Add webhook")}
            </button>
          )}
        </div>
        <div className="eg-webhook-list">
          {webhooks.map(hook => (
            <article key={hook.id}>
              <div>
                <b>{hook.url}</b>
                <small>{hook.events.join(", ")}</small>
              </div>
              <StatusChip status={hook.enabled ? "enabled" : "disabled"} />
              <div className="ws-row-actions">
                <button
                  className="ws-btn"
                  disabled={!admin}
                  onClick={() => onToggle(hook)}
                >
                  {t(hook.enabled ? "Disable" : "Enable")}
                </button>
                <button
                  className="ws-btn"
                  disabled={!admin || !hook.enabled}
                  onClick={() => onTest(hook)}
                >
                  <Play size={13} />
                  {t("Send real test")}
                </button>
              </div>
            </article>
          ))}
        </div>
        {!webhooks.length && (
          <EmptyState
            title="No webhooks"
            detail="Add a secure HTTPS endpoint when an external system is ready to receive signed events."
          />
        )}
      </section>
      <section className="ws-card ws-card-pad">
        <div className="ws-card-title">
          <div>
            <h2>{t("Delivery history")}</h2>
            <p>{t("Only server-recorded delivery attempts appear here.")}</p>
          </div>
          <Radio size={18} />
        </div>
        <div className="eg-deliveries">
          {deliveries.map(delivery => (
            <div key={delivery.id}>
              <StatusChip status={delivery.status} />
              <span>{delivery.event || "—"}</span>
              <small>
                {formatDate(delivery.attemptedAt || delivery.createdAt, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {delivery.httpStatus || delivery.responseCode
                  ? ` · HTTP ${delivery.httpStatus || delivery.responseCode}`
                  : ""}
                {delivery.error ? ` · ${delivery.error}` : ""}
              </small>
            </div>
          ))}
        </div>
        {!deliveries.length && (
          <p className="eg-muted">
            {t("No delivery attempts have been recorded.")}
          </p>
        )}
      </section>
    </div>
  );
}

function DocsTab({ docs }: { docs: Record<string, unknown> | null }) {
  const { t } = useI18n();
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{t("Developer documentation")}</h2>
          <p>
            {t(
              "This page renders the safe metadata returned by /engage/api-docs."
            )}
          </p>
        </div>
        <Code2 size={18} />
      </div>
      {docs ? (
        <pre className="eg-docs-json">{JSON.stringify(docs, null, 2)}</pre>
      ) : (
        <div className="ws-error">
          {t("Developer documentation could not be loaded from the API.")}
        </div>
      )}
    </section>
  );
}

function EmbedTab({ keys }: { keys: AccessKey[] }) {
  const { t } = useI18n();
  const widgets = keys.filter(key => key.kind === "widget" && !key.revoked);
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{t("Embed forms")}</h2>
          <p>
            {t(
              "Use an active widget key to create a quote request iframe. Key values are not recoverable here after creation."
            )}
          </p>
        </div>
        <Link2 size={18} />
      </div>
      {widgets.map(key => (
        <article className="eg-link-card" key={key.id}>
          <b>{key.name}</b>
          <p>
            {t(
              "Create a replacement widget key if you no longer have its one-time token; existing token values are intentionally not listed."
            )}
          </p>
        </article>
      ))}
      {!widgets.length && (
        <EmptyState
          title="No active widget keys"
          detail="Create a widget key to receive a one-time quote URL and iframe code."
        />
      )}
    </section>
  );
}

function PortalTab({
  keys,
  customers,
}: {
  keys: AccessKey[];
  customers: Awaited<ReturnType<typeof crm.customers>>;
}) {
  const { t } = useI18n();
  const portals = keys.filter(key => key.kind === "portal" && !key.revoked);
  return (
    <section className="ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2>{t("Portal links")}</h2>
          <p>
            {t(
              "Each portal key is bound to one saved customer. The token itself is available only at creation."
            )}
          </p>
        </div>
        <BookOpen size={18} />
      </div>
      {portals.map(key => (
        <article className="eg-link-card" key={key.id}>
          <b>{key.name}</b>
          <p>
            {customers.find(customer => customer.id === key.customerId)?.name ||
              t("Bound customer unavailable")}
          </p>
          <code>{`/portal/<one-time-token>`}</code>
        </article>
      ))}
      {!portals.length && (
        <EmptyState
          title="No active portal keys"
          detail="Create a portal key and bind it to a saved customer to receive a one-time portal link."
        />
      )}
    </section>
  );
}

function KeyEditor({
  customers,
  onClose,
  onCreated,
}: {
  customers: Awaited<ReturnType<typeof crm.customers>>;
  onClose: () => void;
  onCreated: (result: { key: AccessKey; token: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"api" | "widget" | "portal">("api");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["leads:create"]);
  const [customerId, setCustomerId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options =
    kind === "widget"
      ? ["leads:create"]
      : kind === "portal"
        ? ["portal:read", "portal:inventory:submit"]
        : ["leads:create", "read:customers", "read:jobs", "read:storage"];
  const changeKind = (next: "api" | "widget" | "portal") => {
    setKind(next);
    setScopes(
      next === "widget"
        ? ["leads:create"]
        : next === "portal"
          ? ["portal:read", "portal:inventory:submit"]
          : ["leads:create"]
    );
  };
  const toggleScope = (scope: string) =>
    setScopes(current =>
      current.includes(scope)
        ? current.filter(value => value !== scope)
        : [...current, scope]
    );
  return (
    <Modal title="Create access key" onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onCreated(
              await engage.createKey({
                name,
                kind,
                scopes,
                customerId: kind === "portal" ? Number(customerId) : undefined,
                expiresAt: expiresAt
                  ? new Date(expiresAt).toISOString()
                  : undefined,
              })
            );
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not create access key."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <p>
            {t(
              "The full token is shown exactly once after creation. Do not paste it into notes, browser storage, or logs."
            )}
          </p>
          <div className="ws-form-grid">
            <label>
              {t("Name")}
              <input
                className="ws-input"
                required
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </label>
            <label>
              {t("Kind")}
              <select
                className="ws-select"
                value={kind}
                onChange={event =>
                  changeKind(event.target.value as typeof kind)
                }
              >
                <option value="api">api</option>
                <option value="widget">widget</option>
                <option value="portal">portal</option>
              </select>
            </label>
            <label>
              {t("Expires on (optional)")}
              <input
                className="ws-input"
                type="datetime-local"
                value={expiresAt}
                onChange={event => setExpiresAt(event.target.value)}
              />
            </label>
            {kind === "portal" && (
              <label>
                {t("Bound customer")}
                <select
                  className="ws-select"
                  required
                  value={customerId}
                  onChange={event => setCustomerId(event.target.value)}
                >
                  <option value="">{t("Choose saved customer")}</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <fieldset className="eg-scope-box">
            <legend>{t("Authorized scopes")}</legend>
            {options.map(scope => (
              <label className="ws-checkbox" key={scope}>
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  disabled={kind !== "api"}
                  onChange={() => toggleScope(scope)}
                />
                {scope}
              </label>
            ))}
            <small>
              {kind === "widget"
                ? t("Widget keys are restricted to lead creation.")
                : kind === "portal"
                  ? t(
                      "Portal keys must be customer-bound and expose only the selected customer's data."
                    )
                  : t(
                      "Choose only the API permissions required by the integration."
                    )}
            </small>
          </fieldset>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button className="ws-btn" type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className="ws-btn primary"
            disabled={
              saving || !scopes.length || (kind === "portal" && !customerId)
            }
          >
            <KeyRound size={14} />
            {t(saving ? "Creating…" : "Create key")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function WebhookEditor({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { webhook: Webhook; secret: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("lead.created");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Add webhook" onClose={onClose}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          setError("");
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== "https:")
              throw new Error("Webhook URL must use HTTPS.");
            setSaving(true);
            await onCreated(
              await engage.createWebhook({
                url,
                events: events
                  .split(",")
                  .map(value => value.trim())
                  .filter(Boolean),
                enabled,
              })
            );
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not create webhook."
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="ws-modal__body">
          <div className="ws-form-grid">
            <label className="ws-form-full">
              {t("HTTPS destination URL")}
              <input
                className="ws-input"
                required
                type="url"
                placeholder="https://example.com/webhooks/moving"
                value={url}
                onChange={event => setUrl(event.target.value)}
              />
            </label>
            <label className="ws-form-full">
              {t("Events (comma separated)")}
              <input
                className="ws-input"
                required
                value={events}
                onChange={event => setEvents(event.target.value)}
              />
            </label>
            <label className="ws-checkbox">
              <input
                type="checkbox"
                checked={enabled}
                onChange={event => setEnabled(event.target.checked)}
              />
              {t("Enable after creation")}
            </label>
          </div>
          <p className="eg-muted">
            {t(
              "The server validates public HTTPS destinations and rejects reserved/private addresses."
            )}
          </p>
          {error && <div className="ws-error">{t(error)}</div>}
        </div>
        <footer className="ws-modal__foot">
          <button className="ws-btn" type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="ws-btn primary" disabled={saving}>
            <WebhookIcon size={14} />
            {t(saving ? "Creating…" : "Create webhook")}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function SecretDialog({
  secret,
  onClose,
}: {
  secret: Secret;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal title={secret.label} onClose={onClose} wide>
      <div className="ws-modal__body">
        <div className="eg-success">
          <Check size={16} />
          {t(
            "Copy this secret now. It is held only in this dialog and cannot be retrieved again."
          )}
        </div>
        <label>
          {t("Full token or signing secret")}
          <code className="eg-token">{secret.token}</code>
        </label>
        <CopyButton value={secret.token} label="Copy token" />
        {secret.relative && (
          <>
            <label>
              {t("Browser-relative link")}
              <code className="eg-token">{secret.relative}</code>
            </label>
            <CopyButton value={secret.relative} label="Copy relative link" />
          </>
        )}
        {secret.iframe && (
          <>
            <label>
              {t("Iframe code (uses this browser origin)")}
              <code className="eg-token eg-token--wrap">{secret.iframe}</code>
            </label>
            <CopyButton value={secret.iframe} label="Copy iframe code" />
          </>
        )}
      </div>
      <footer className="ws-modal__foot">
        <button className="ws-btn primary" onClick={onClose}>
          {t("I copied it")}
        </button>
      </footer>
    </Modal>
  );
}

export default IntegrationsPage;
