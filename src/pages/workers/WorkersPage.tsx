import type { ModuleProps } from "@shared/expansion";
import WorkerDirectory from "@/components/workspace/WorkerDirectory";
import { WORKER_DIRECTORY_ROLES } from "@shared/workers";
import { useI18n } from "@/lib/i18n";
export default function WorkersPage({ role, navigate }: ModuleProps) {
  const { tx } = useI18n();
  return (
    <div className="worker-detail">
      <div className="worker-detail__head">
        <div>
          <h1>{tx("Workers", "Сотрудники")}</h1>
          <p>
            {tx(
              "Approved hours, historical earnings and recorded payouts. Crew accounts see only their own linked profile.",
              "Утвержденные часы, исторический заработок и учтенные выплаты. Бригада видит только свой связанный профиль."
            )}
          </p>
        </div>
      </div>
      {WORKER_DIRECTORY_ROLES.includes(role) ? (
        <WorkerDirectory role={role} navigate={navigate} />
      ) : (
        <div className="ws-alert">
          {tx(
            "Your role cannot access worker records.",
            "У вашей роли нет доступа к записям сотрудников."
          )}
        </div>
      )}
    </div>
  );
}
