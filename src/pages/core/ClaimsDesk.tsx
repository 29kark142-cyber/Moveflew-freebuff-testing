import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Eye, Link2, RefreshCw, ShieldAlert, X } from "lucide-react";
import { crmFetch } from "@/lib/crm";
import { useI18n } from "@/lib/i18n";
import type { ModuleProps } from "@shared/expansion";
import { CoreCard, CoreNotice, CorePage } from "./CoreUI";
import "./claims-settlement.css";

type Approval = {
  id: number;
  decision: "approve" | "deny";
  resolutionKind: "cash" | "repair" | null;
  approvedCents: number;
  staffNote: string;
  createdAt: string;
};

type ClaimSummary = {
  id: number;
  jobId: number;
  jobTitle: string;
  moveDate: string;
  customerId: number;
  customerName: string;
  type: string;
  status: string;
  description: string;
  claimedCents: number;
  approvedCents: number;
  dueDate: string | null;
  legacyApprovedCents: number;
  settlementEligible: boolean;
  settledCents: number;
  remainingCents: number;
  approval: Approval | null;
};

type ClaimDetail = {
  claim: ClaimSummary;
  affectedItems: Array<{
    id: number;
    name: string;
    description: string;
    quantity: number;
    requestedCents: number;
    createdAt: string;
  }>;
  photos: Array<{
    id: number;
    itemId: number | null;
    storageUrl: string;
    contentType: string;
    byteSize: number;
    caption: string;
    createdAt: string;
  }>;
  portalAccess: Array<{
    id: number;
    expiresAt: string;
    revokedAt: string | null;
    submittedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
  }>;
  settlements: Array<{
    id: number;
    amountCents: number;
    method: string;
    externalReference: string;
    operationKey: string;
    recordedAt: string;
  }>;
  accounting: Array<{
    id: number;
    settlementId: number | null;
    eventType: string;
    eventKey: string;
    lineNumber: number;
    account: string;
    debitCents: number;
    creditCents: number;
    occurredAt: string;
  }>;
};

type ClaimsResponse = {
  claims: ClaimSummary[];
  provider: { active: boolean; message: string };
};

type IssuedAccess = {
  id: number;
  token: string;
  portalPath: string;
  expiresAt: string;
  warning: string;
};

function amountFromInput(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function operationKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `claim_${crypto.randomUUID()}`;
  return `claim_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function thirtyDaysFromNow(): string {
  const value = new Date();
  value.setDate(value.getDate() + 30);
  return value.toISOString().slice(0, 10);
}

/** Parent mounts this at /app/claim-settlements; it records no payout or provider request. */
export default function ClaimsDesk({ role }: ModuleProps) {
  const { locale, tx } = useI18n();
  const allowed = role === "admin" || role === "office_admin";
  const [claims, setClaims] = useState<ClaimSummary[]>([]);
  const [providerMessage, setProviderMessage] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessExpiry, setAccessExpiry] = useState(thirtyDaysFromNow);
  const [issuedAccess, setIssuedAccess] = useState<IssuedAccess | null>(null);
  const [decision, setDecision] = useState<"approve" | "deny">("approve");
  const [resolutionKind, setResolutionKind] = useState<"cash" | "repair">("cash");
  const [approvalAmount, setApprovalAmount] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [decisionKey, setDecisionKey] = useState(operationKey);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementMethod, setSettlementMethod] = useState("manual_external_cash_payout");
  const [externalReference, setExternalReference] = useState("");
  const [settlementKey, setSettlementKey] = useState(operationKey);

  const money = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
        value / 100
      ),
    [locale]
  );

  const loadDetail = useCallback(async (claimId: number) => {
    const next = await crmFetch<ClaimDetail>(`/core/claims/${claimId}`);
    setDetail(next);
    setApprovalAmount((current) => current || (next.claim.claimedCents / 100).toFixed(2));
    setSettlementAmount((current) => current || (next.claim.remainingCents / 100).toFixed(2));
  }, []);

  const refresh = useCallback(
    async (nextSelectedId = selectedId) => {
      if (!allowed) return;
      setLoading(true);
      setError("");
      try {
        const response = await crmFetch<ClaimsResponse>("/core/claims");
        setClaims(response.claims);
        setProviderMessage(response.provider.message);
        const usableId =
          nextSelectedId && response.claims.some((claim) => claim.id === nextSelectedId)
            ? nextSelectedId
            : response.claims[0]?.id ?? null;
        setSelectedId(usableId);
        if (usableId) await loadDetail(usableId);
        else setDetail(null);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : tx("Could not load claim settlements.", "Не удалось загрузить расчеты по претензиям.")
        );
      } finally {
        setLoading(false);
      }
    },
    [allowed, loadDetail, selectedId, tx]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectClaim = async (claimId: number) => {
    setSelectedId(claimId);
    setDetail(null);
    setError("");
    try {
      await loadDetail(claimId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx("Could not load this claim.", "Не удалось загрузить эту претензию."));
    }
  };

  const run = async (work: () => Promise<void>) => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tx("The claim action could not be saved.", "Не удалось сохранить действие по претензии."));
    } finally {
      setLoading(false);
    }
  };

  const issueAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    await run(async () => {
      const issued = await crmFetch<IssuedAccess>(`/core/claims/${detail.claim.id}/access`, {
        method: "POST",
        body: JSON.stringify({ expiresAt: `${accessExpiry}T23:59:59.000Z` }),
      });
      setIssuedAccess(issued);
      setNotice(tx("A scoped portal link was created. Copy it now; this screen cannot retrieve its token later.", "Создана ограниченная ссылка на портал. Скопируйте ее сейчас: позже этот экран не сможет получить токен."));
      await refresh(detail.claim.id);
    });
  };

  const revokeAccess = async (accessId: number) => {
    if (!detail) return;
    await run(async () => {
      await crmFetch(`/core/claims/${detail.claim.id}/access/${accessId}`, { method: "DELETE" });
      setNotice(tx("Portal access was revoked.", "Доступ к порталу отозван."));
      await refresh(detail.claim.id);
    });
  };

  const saveDecision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    const approvedCents = decision === "approve" ? amountFromInput(approvalAmount) : 0;
    if (decision === "approve" && (approvedCents === null || approvedCents <= 0)) {
      setError(tx("Enter a positive USD approval amount with no more than two decimals.", "Укажите положительную сумму утверждения в USD не более чем с двумя десятичными знаками."));
      return;
    }
    await run(async () => {
      await crmFetch(`/core/claims/${detail.claim.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          approvedCents,
          resolutionKind: decision === "approve" ? resolutionKind : undefined,
          staffNote,
          operationKey: decisionKey,
        }),
      });
      setDecisionKey(operationKey());
      setNotice(
        decision === "approve"
          ? tx("Claim approval and its liability journal were recorded. No payout was sent.", "Утверждение претензии и проводка обязательства зафиксированы. Выплата не отправлялась.")
          : tx("Claim denial was recorded.", "Отказ по претензии зафиксирован.")
      );
      await refresh(detail.claim.id);
    });
  };

  const saveSettlement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    const amountCents = amountFromInput(settlementAmount);
    if (amountCents === null || amountCents <= 0) {
      setError(tx("Enter a positive USD amount with no more than two decimals.", "Укажите положительную сумму в USD не более чем с двумя десятичными знаками."));
      return;
    }
    await run(async () => {
      await crmFetch(`/core/claims/${detail.claim.id}/settlements`, {
        method: "POST",
        body: JSON.stringify({
          amountCents,
          method: settlementMethod,
          externalReference,
          operationKey: settlementKey,
        }),
      });
      setExternalReference("");
      setSettlementKey(operationKey());
      setSettlementAmount("");
      setNotice(tx("External settlement record and liability-clearance journal were saved. No payout or refund was executed.", "Запись о внешнем расчете и проводка погашения обязательства сохранены. Выплата или возврат не выполнялись."));
      await refresh(detail.claim.id);
    });
  };

  const issuedPortalUrl = useMemo(
    () => (issuedAccess ? `${window.location.origin}${issuedAccess.portalPath}` : ""),
    [issuedAccess]
  );

  if (!allowed)
    return (
      <CorePage
        title={tx("Claim settlements", "Расчеты по претензиям")}
        description={tx("Customer claims and accounting records are restricted to finance administrators.", "Претензии клиентов и бухгалтерские записи доступны только финансовым администраторам.")}
      >
        <CoreNotice tone="error">
          {tx("Your workspace role cannot manage claim settlements.", "Ваша роль в рабочем пространстве не может управлять расчетами по претензиям.")}
        </CoreNotice>
      </CorePage>
    );

  return (
    <CorePage
      title={tx("Claim settlements", "Расчеты по претензиям")}
      description={tx("Review post-move evidence, make one terminal decision, and record only already-completed external cash, repair, or processor refund references.", "Проверяйте доказательства после переезда, принимайте одно окончательное решение и фиксируйте только уже завершенные внешние выплаты, ремонты или возвраты процессора.")}
      actions={
        <button className="core-primary" type="button" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={15} /> {loading ? tx("Refreshing…", "Обновление…") : tx("Refresh", "Обновить")}
        </button>
      }
    >
      {error && <CoreNotice tone="error">{error}</CoreNotice>}
      {notice && <CoreNotice tone="success">{notice}</CoreNotice>}
      <CoreNotice>
        <strong>{tx("Manual record only. ", "Только ручная запись. ")}</strong>
        {providerMessage || tx("No payout or refund provider is active. This desk does not send money, create a Stripe refund, or prove a payment was made.", "Провайдер выплат или возвратов не активен. Этот стол не отправляет деньги, не создает возврат Stripe и не доказывает, что платеж был произведен.")}
      </CoreNotice>

      <CoreCard title={tx("Claims requiring review", "Претензии, требующие проверки")}>
        {!claims.length ? (
          <div className="core-empty">{tx("No claims are available in this workspace.", "В этом рабочем пространстве нет претензий.")}</div>
        ) : (
          <div className="core-scroll">
            <table className="core-table claims-desk-table">
              <thead><tr><th>{tx("Customer / move", "Клиент / переезд")}</th><th>{tx("Claim", "Претензия")}</th><th>{tx("Amounts", "Суммы")}</th><th>{tx("Status", "Статус")}</th><th>{tx("Review", "Проверка")}</th></tr></thead>
              <tbody>{claims.map((claim) => <tr key={claim.id} className={selectedId === claim.id ? "claims-desk-row--selected" : ""}>
                <td><strong>{claim.customerName}</strong><br /><span className="core-muted">{claim.jobTitle} · {claim.moveDate}</span></td>
                <td>{claim.type}<br /><span className="core-muted">#{claim.id}</span></td>
                <td>{money(claim.claimedCents)}<br /><span className="core-muted">{tx("Remaining", "Остаток")}: {money(claim.remainingCents)}</span></td>
                <td><span className="core-pill">{claim.status}</span></td>
                <td><button type="button" onClick={() => void selectClaim(claim.id)}><Eye size={15} /> {tx("Open", "Открыть")}</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </CoreCard>

      {detail && <>
        <div className="core-grid claims-desk-summary">
          <CoreCard title={tx("Claim review", "Проверка претензии")}>
            <dl className="claims-desk-metrics">
              <div><dt>{tx("Customer", "Клиент")}</dt><dd>{detail.claim.customerName}</dd></div>
              <div><dt>{tx("Completed move", "Завершенный переезд")}</dt><dd>{detail.claim.jobTitle} · {detail.claim.moveDate}</dd></div>
              <div><dt>{tx("Claimed", "Заявлено")}</dt><dd>{money(detail.claim.claimedCents)}</dd></div>
              <div><dt>{tx("Approved", "Утверждено")}</dt><dd>{money(detail.claim.approvedCents)}</dd></div>
              <div><dt>{tx("Recorded externally", "Зафиксировано внешне")}</dt><dd>{money(detail.claim.settledCents)}</dd></div>
              <div><dt>{tx("Remaining liability", "Остаток обязательства")}</dt><dd>{money(detail.claim.remainingCents)}</dd></div>
            </dl>
            <p className="claims-prewrap">{detail.claim.description}</p>
            {detail.claim.approval && <div className="claims-staff-note"><strong>{detail.claim.approval.decision === "approve" ? tx("Decision", "Решение") : tx("Denial", "Отказ")}</strong><span className="core-pill">{detail.claim.approval.decision}</span>{detail.claim.approval.resolutionKind && <span className="core-pill">{detail.claim.approval.resolutionKind}</span>}<p className="claims-prewrap">{detail.claim.approval.staffNote || tx("No internal note entered.", "Внутренняя заметка не указана.")}</p></div>}
          </CoreCard>
          <CoreCard title={tx("Evidence received", "Полученные доказательства")}>
            <h3>{tx("Affected items", "Поврежденные предметы")}</h3>
            {!detail.affectedItems.length ? <p className="core-muted">{tx("No affected items have been submitted.", "Поврежденные предметы не представлены.")}</p> : <div className="claims-desk-item-list">{detail.affectedItems.map((item) => <article key={item.id}><strong>{item.name} × {item.quantity}</strong><span>{money(item.requestedCents)}</span><p className="claims-prewrap">{item.description}</p></article>)}</div>}
            <h3>{tx("Photos", "Фотографии")}</h3>
            {!detail.photos.length ? <p className="core-muted">{tx("No photos have been submitted.", "Фотографии не представлены.")}</p> : <div className="claims-photo-grid">{detail.photos.map((photo) => <figure key={photo.id}><img src={photo.storageUrl} alt={photo.caption || tx("Claim evidence", "Фото по претензии")} /><figcaption>{photo.caption || tx("Claim evidence", "Фото по претензии")}</figcaption></figure>)}</div>}
          </CoreCard>
        </div>

        <div className="core-grid claims-desk-actions">
          <CoreCard title={tx("Customer portal access", "Доступ к порталу клиента")}>
            <p className="core-muted">{tx("A link is issued only for this completed move, expires on the selected date, and can be revoked immediately. This desk does not send it to the customer.", "Ссылка выдается только для этого завершенного переезда, истекает в выбранную дату и может быть немедленно отозвана. Этот стол не отправляет ее клиенту.")}</p>
            <form className="claims-desk-form" onSubmit={issueAccess}>
              <label>{tx("Link expiration", "Срок действия ссылки")}<input required type="date" value={accessExpiry} onChange={(event) => setAccessExpiry(event.target.value)} /></label>
              <button type="submit" disabled={loading}><Link2 size={15} /> {tx("Issue scoped link", "Выдать ограниченную ссылку")}</button>
            </form>
            {issuedAccess && <div className="claims-issued-link"><strong>{tx("Copy now", "Скопируйте сейчас")}</strong><input readOnly value={issuedPortalUrl} aria-label={tx("New portal link", "Новая ссылка на портал")} /><small>{issuedAccess.warning}</small></div>}
            {!detail.portalAccess.length ? <p className="core-muted">{tx("No portal links have been issued.", "Ссылки на портал не выдавались.")}</p> : <ul className="claims-access-list">{detail.portalAccess.map((access) => <li key={access.id}><span><strong>{access.revokedAt ? tx("Revoked", "Отозвана") : tx("Active", "Активна")}</strong><small>{tx("Expires", "Истекает")}: {new Date(access.expiresAt).toLocaleDateString(locale)} · {access.submittedAt ? tx("submitted", "отправлено") : tx("not submitted", "не отправлено")}</small></span>{!access.revokedAt && <button type="button" onClick={() => void revokeAccess(access.id)} disabled={loading}><X size={14} /> {tx("Revoke", "Отозвать")}</button>}</li>)}</ul>}
          </CoreCard>

          <CoreCard title={tx("Terminal decision", "Окончательное решение")}>
            {detail.claim.approval ? <CoreNotice>{tx("A terminal decision is already recorded. It cannot be replaced or re-approved.", "Окончательное решение уже зафиксировано. Его нельзя заменить или утвердить повторно.")}</CoreNotice> : <form className="claims-desk-form" onSubmit={saveDecision}>
              <label>{tx("Decision", "Решение")}<select value={decision} onChange={(event) => setDecision(event.target.value as "approve" | "deny")}><option value="approve">{tx("Approve", "Утвердить")}</option><option value="deny">{tx("Deny", "Отклонить")}</option></select></label>
              {decision === "approve" && <><label>{tx("Approved amount (USD)", "Утвержденная сумма (USD)")}<input required inputMode="decimal" value={approvalAmount} onChange={(event) => setApprovalAmount(event.target.value)} /></label><label>{tx("Resolution", "Способ урегулирования")}<select value={resolutionKind} onChange={(event) => setResolutionKind(event.target.value as "cash" | "repair")}><option value="cash">{tx("Cash settlement", "Денежный расчет")}</option><option value="repair">{tx("Repair", "Ремонт")}</option></select></label></>}
              <label>{tx("Internal review note", "Внутренняя заметка") }<textarea value={staffNote} onChange={(event) => setStaffNote(event.target.value)} /></label>
              <button className="core-primary" type="submit" disabled={loading}>{decision === "approve" ? tx("Approve claim", "Утвердить претензию") : tx("Deny claim", "Отклонить претензию")}</button>
            </form>}
          </CoreCard>
        </div>

        <div className="core-grid claims-desk-actions">
          <CoreCard title={tx("Record an external settlement", "Зафиксировать внешний расчет")}>
            {!detail.claim.settlementEligible ? <CoreNotice>{detail.claim.status === "resolved" ? tx("This claim is fully resolved; no further settlement can be recorded.", "Эта претензия полностью урегулирована; дальнейший расчет невозможен.") : tx("Approve an eligible claim before recording an external settlement.", "Утвердите подходящую претензию перед фиксацией внешнего расчета.")}</CoreNotice> : <form className="claims-desk-form" onSubmit={saveSettlement}>
              <p className="core-muted">{tx("Remaining approved liability", "Оставшееся утвержденное обязательство")}: <strong>{money(detail.claim.remainingCents)}</strong></p>
              <label>{tx("Recorded method", "Зафиксированный способ")}<select value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value)}><option value="manual_external_cash_payout">{tx("Manual external cash payout record", "Запись о ручной внешней денежной выплате")}</option><option value="external_processor_refund_record">{tx("External processor refund record", "Запись о внешнем возврате процессора")}</option><option value="repair_completed">{tx("Repair completed", "Ремонт завершен")}</option></select></label>
              <label>{tx("Amount (USD)", "Сумма (USD)")}<input required inputMode="decimal" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} /></label>
              <label>{tx("External reference", "Внешняя ссылка / номер")}<input required value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder={tx("Receipt, repair order, or processor reference", "Квитанция, заказ на ремонт или ссылка процессора")} /></label>
              <button className="core-primary" type="submit" disabled={loading}><ExternalLink size={15} /> {tx("Record completed external action", "Зафиксировать завершенное внешнее действие")}</button>
            </form>}
            <p className="claims-warning"><ShieldAlert size={16} /> {tx("This is a factual audit record supplied by staff, not a processed payout, payment instruction, or verified provider event.", "Это фактическая аудиторская запись, предоставленная сотрудником, а не обработанная выплата, платежное поручение или проверенное событие провайдера.")}</p>
          </CoreCard>
          <CoreCard title={tx("Liability and settlement audit", "Аудит обязательства и расчета")}>
            {!detail.settlements.length ? <p className="core-muted">{tx("No external settlement record has been saved.", "Записи о внешнем расчете не сохранены.")}</p> : <div className="core-scroll"><table className="core-table"><thead><tr><th>{tx("Recorded", "Зафиксировано")}</th><th>{tx("Method", "Способ")}</th><th>{tx("Amount", "Сумма")}</th><th>{tx("External reference", "Внешняя ссылка")}</th></tr></thead><tbody>{detail.settlements.map((settlement) => <tr key={settlement.id}><td>{new Date(settlement.recordedAt).toLocaleString(locale)}</td><td>{settlement.method}</td><td>{money(settlement.amountCents)}</td><td><code>{settlement.externalReference}</code></td></tr>)}</tbody></table></div>}
            <h3>{tx("Append-only accounting lines", "Неизменяемые бухгалтерские строки")}</h3>
            {!detail.accounting.length ? <p className="core-muted">{tx("No claim accounting lines have been posted.", "Бухгалтерские строки претензии не проведены.")}</p> : <div className="core-scroll"><table className="core-table"><thead><tr><th>{tx("Event", "Событие")}</th><th>{tx("Account", "Счет")}</th><th>{tx("Debit", "Дебет")}</th><th>{tx("Credit", "Кредит")}</th></tr></thead><tbody>{detail.accounting.map((entry) => <tr key={entry.id}><td><code>{entry.eventKey}</code><br /><span className="core-muted">{entry.eventType}</span></td><td><code>{entry.account}</code></td><td>{entry.debitCents ? money(entry.debitCents) : "—"}</td><td>{entry.creditCents ? money(entry.creditCents) : "—"}</td></tr>)}</tbody></table></div>}
          </CoreCard>
        </div>
      </>}
    </CorePage>
  );
}
