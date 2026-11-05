import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { crmFetch } from '@/lib/crm';
import { useI18n } from '@/lib/i18n';
import { money } from '@shared/crm';
import { SAMPLE_REPORT } from '@shared/workspace-reports';
import { LoadingBlock, useRemote } from './WorkspaceUI';

export default function OperationalReports({ workspaceName }: { workspaceName: string }) {
  const { tx, locale } = useI18n();
  const { data, loading, error, refresh } = useRemote(() => crmFetch<typeof SAMPLE_REPORT & { hasJobs: boolean }>('/reports'), []);
  const report = data?.hasJobs ? data : SAMPLE_REPORT;
  return <>
    <div className="ws-page-head"><div><h1>{tx('Reports', 'Отчёты')}</h1><p>{workspaceName}</p></div><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw />{tx('Refresh', 'Обновить')}</Button></div>
    {loading ? <LoadingBlock label={tx('Loading reports…', 'Загрузка отчётов…')} /> : error ? <div className="ws-alert" role="alert">{tx('Reports could not be loaded. Please try again.', 'Не удалось загрузить отчёты. Попробуйте ещё раз.')}</div> : <>
      {!data?.hasJobs && <div className="ws-alert">{tx('Sample data — no workspace moves yet. These figures are illustrative, not actual revenue.', 'Пример данных — в компании пока нет переездов. Это демонстрационные показатели, а не фактическая выручка.')}</div>}
      <div className="ws-stat-grid">
        {[[tx('Total Revenue', 'Общая выручка'), money(report.revenue, locale)], [tx('Completed Moves Count', 'Завершённые переезды'), report.completedMoves], [tx('Average Order Value', 'Средний чек'), money(report.averageOrder, locale)], [tx('Crew Members', 'Сотрудники бригады'), report.crew.length]].map(([label, value]) => <div className="ws-card ws-stat" key={label}><div className="ws-stat__label">{label}</div><div className="ws-stat__number">{value}</div></div>)}
      </div>
      <p className="text-sm text-muted-foreground my-4">{tx('All time · Completed moves only · Canceled and declined moves excluded', 'За всё время · Только завершённые переезды · Отменённые и отклонённые исключены')}</p>
      <h2 className="text-lg font-semibold mb-3">{tx('Crew Performance', 'Эффективность бригады')}</h2>
      <div className="ws-table-wrap"><table className="ws-table"><thead><tr><th>{tx('Crew member', 'Сотрудник')}</th><th>{tx('Completed moves', 'Завершённые переезды')}</th><th>{tx('Hours', 'Часы')}</th><th>{tx('Attributed revenue', 'Доля выручки')}</th></tr></thead><tbody>
        {report.crew.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.moves}</td><td>{c.hours.toLocaleString(locale, { maximumFractionDigits: 1 })}</td><td>{money(c.revenue, locale)}</td></tr>)}
        {!report.crew.length && <tr><td colSpan={4}>{tx('No crew records yet.', 'Сотрудников пока нет.')}</td></tr>}
      </tbody></table></div>
    </>}
  </>;
}