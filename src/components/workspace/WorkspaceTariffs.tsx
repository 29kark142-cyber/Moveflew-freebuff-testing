import { useState } from 'react';
import { Save, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { crmFetch } from '@/lib/crm';
import { useI18n } from '@/lib/i18n';
import type { Pricing } from '@shared/crm';
import { pricingSchema, canEditTariffs } from '@shared/workspace-tariffs';
import { travelSettingsSchema, type TravelSettings } from '@/lib/travel-rules';
import { LoadingBlock, useRemote } from './WorkspaceUI';

type Settings = { pricing: Pricing; travel: TravelSettings };
export default function WorkspaceTariffs({ workspaceName, role, readOnly }: { workspaceName: string; role: string; readOnly: boolean }) {
  const { tx } = useI18n();
  const remote = useRemote(() => crmFetch<Settings>('/tariffs'), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const settings = draft ?? remote.data;
  const editable = canEditTariffs(role) && !readOnly;
  const setPricing = (patch: Partial<Pricing>) => { if (settings) setDraft({ ...settings, pricing: { ...settings.pricing, ...patch } }); };
  const setTravel = (patch: Partial<TravelSettings>) => { if (settings) setDraft({ ...settings, travel: { ...settings.travel, ...patch } }); };
  async function save() {
    if (!settings || !editable) return;
    if (!pricingSchema.safeParse(settings.pricing).success || !travelSettingsSchema.safeParse(settings.travel).success) {
      toast.error(tx('Enter valid, non-negative rates. Minimum hours must be between 0 and 24.', 'Введите корректные неотрицательные ставки. Минимум часов — от 0 до 24.')); return;
    }
    setSaving(true);
    try {
      const saved = await crmFetch<Settings>('/tariffs', { method: 'PUT', body: JSON.stringify(settings) });
      remote.setData(saved); setDraft(null);
      toast.success(tx('Tariffs saved', 'Тарифы сохранены'));
    } catch { toast.error(tx('Could not save tariffs. Check your connection and access, then try again.', 'Не удалось сохранить тарифы. Проверьте соединение и права доступа и повторите попытку.')); }
    finally { setSaving(false); }
  }
  const numberInput = (label: string, value: number, change: (n: number) => void, max = 100000) => <input aria-label={label} className="ws-input w-28" type="number" min="0" max={max} step="0.01" required disabled={!editable || saving} value={Number.isFinite(value) ? value : ''} onChange={e => change(e.target.value === '' ? NaN : Number(e.target.value))} />;
  return <>
    <div className="ws-page-head"><div><h1>{tx('Tariffs', 'Тарифы')}</h1><p>{workspaceName}</p></div><div className="ws-actions"><Button variant="outline" disabled={remote.loading || saving} onClick={() => { setDraft(null); void remote.refresh(); }}><RefreshCw />{tx('Refresh', 'Обновить')}</Button>{editable && <Button disabled={!draft || saving} onClick={() => void save()}><Save />{saving ? tx('Saving…', 'Сохранение…') : tx('Save tariffs', 'Сохранить тарифы')}</Button>}</div></div>
    {!editable && <div className="ws-alert">{readOnly ? tx('This workspace is read-only.', 'Компания доступна только для просмотра.') : tx('Only workspace admins can edit tariffs.', 'Изменять тарифы могут только администраторы компании.')}</div>}
    {remote.loading ? <LoadingBlock label={tx('Loading tariffs…', 'Загрузка тарифов…')} /> : remote.error || !settings ? <div className="ws-alert" role="alert">{tx('Tariffs could not be loaded. Please try again.', 'Не удалось загрузить тарифы. Попробуйте ещё раз.')}</div> : <>
      <h2 className="text-lg font-semibold mb-3">{tx('Labor & truck rates', 'Ставки бригады и грузовика')}</h2>
      <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>{tx('Rate', 'Тариф')}</th><th>{tx('Unit', 'Единица')}</th><th>{tx('Amount', 'Сумма')}</th></tr></thead><tbody>
        {settings.pricing.rates.map((rate, i) => { const label = tx('Labor · {count} movers', 'Бригада · {count} грузчиков', { count: i + 1 }); return <tr key={i}><td>{label}</td><td>{tx('USD / hour', 'USD / час')}</td><td>{numberInput(label, rate, n => setPricing({ rates: settings.pricing.rates.map((r, index) => index === i ? n : r) }))}</td></tr>; })}
        <tr><td>{tx('Minimum hours', 'Минимум часов')}</td><td>{tx('Hours', 'Часы')}</td><td>{numberInput(tx('Minimum hours', 'Минимум часов'), settings.pricing.minimumHours, n => setPricing({ minimumHours: n }), 24)}</td></tr>
        <tr><td>{tx('Truck fee', 'Сбор за грузовик')}</td><td>{tx('USD / move', 'USD / переезд')}</td><td>{numberInput(tx('Truck fee', 'Сбор за грузовик'), settings.pricing.truckFee ?? 0, n => setPricing({ truckFee: n }))}</td></tr>
      </tbody></table></div>
      {editable && <div className="ws-actions my-3"><Button variant="outline" disabled={settings.pricing.rates.length >= 20 || saving} onClick={() => setPricing({ rates: [...settings.pricing.rates, 0] })}><Plus />{tx('Add crew size', 'Добавить размер бригады')}</Button><Button variant="ghost" disabled={settings.pricing.rates.length <= 1 || saving} onClick={() => setPricing({ rates: settings.pricing.rates.slice(0, -1) })}><Trash2 />{tx('Remove last crew size', 'Удалить последний размер')}</Button></div>}
      <h2 className="text-lg font-semibold mt-6 mb-3">{tx('Travel & fuel surcharges', 'Сборы за дорогу и топливо')}</h2>
      <div className="ws-form-grid mb-4"><label className="ws-field full">{tx('Dispatch base address', 'Адрес базы')}<input className="ws-input" disabled={!editable || saving} value={settings.travel.dispatchAddress} onChange={e => setTravel({ dispatchAddress: e.target.value })} /></label></div>
      <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>{tx('Surcharge', 'Сбор')}</th><th>{tx('Calculation', 'Расчёт')}</th><th>{tx('Rate', 'Ставка')}</th></tr></thead><tbody>
        <tr><td>{tx('Travel', 'Дорога')}</td><td><select aria-label={tx('Travel calculation', 'Расчёт дороги')} className="ws-input" disabled={!editable || saving} value={settings.travel.travelPricingType} onChange={e => setTravel({ travelPricingType: e.target.value as TravelSettings['travelPricingType'] })}><option value="none">{tx('No charge', 'Без сбора')}</option><option value="hourly">{tx('Drive time × labor rate', 'Время в пути × ставка бригады')}</option><option value="flat_fee">{tx('Flat fee (USD)', 'Фиксированный сбор (USD)')}</option><option value="per_mile">{tx('USD / mile to and from base', 'USD / милю от базы и обратно')}</option></select></td><td>{settings.travel.travelPricingType === 'flat_fee' ? numberInput(tx('Travel flat fee', 'Фиксированный сбор за дорогу'), settings.travel.travelFlatRate, n => setTravel({ travelFlatRate: n })) : settings.travel.travelPricingType === 'per_mile' ? numberInput(tx('Travel per mile', 'Дорога за милю'), settings.travel.travelMileageRate, n => setTravel({ travelMileageRate: n }), 1000) : '—'}</td></tr>
        <tr><td>{tx('Fuel', 'Топливо')}</td><td><select aria-label={tx('Fuel calculation', 'Расчёт топлива')} className="ws-input" disabled={!editable || saving} value={settings.travel.fuelSurchargeType} onChange={e => setTravel({ fuelSurchargeType: e.target.value as TravelSettings['fuelSurchargeType'] })}><option value="none">{tx('No charge', 'Без сбора')}</option><option value="flat_fee">{tx('Flat fee (USD)', 'Фиксированный сбор (USD)')}</option><option value="per_mile">{tx('USD / mile driven', 'USD / пройденную милю')}</option><option value="percentage">{tx('% of estimate subtotal', '% от суммы сметы')}</option></select></td><td>{settings.travel.fuelSurchargeType === 'flat_fee' ? numberInput(tx('Fuel flat fee', 'Фиксированный сбор за топливо'), settings.travel.fuelFlatRate, n => setTravel({ fuelFlatRate: n })) : settings.travel.fuelSurchargeType === 'per_mile' ? numberInput(tx('Fuel per mile', 'Топливо за милю'), settings.travel.fuelPerMileRate, n => setTravel({ fuelPerMileRate: n }), 1000) : settings.travel.fuelSurchargeType === 'percentage' ? numberInput(tx('Fuel percentage', 'Процент за топливо'), settings.travel.fuelPercentageRate, n => setTravel({ fuelPercentageRate: n }), 100) : '—'}</td></tr>
      </tbody></table></div>
    </>}
  </>;
}