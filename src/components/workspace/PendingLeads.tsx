import { formatDate } from "@/components/workspace/WorkspaceUI";

export type PendingLead = {
  id: number;
  name: string;
  email: string;
  phone: string;
  source: string;
  createdAt: string;
};

/** Website widget and webhook submissions waiting to become estimates. */
export default function PendingLeads({
  leads,
  onStart,
}: {
  leads: PendingLead[];
  onStart: (id: number) => void;
}) {
  if (!leads.length) return null;
  return (
    <section className="ws-card ws-card-pad" style={{ marginBottom: 16 }}>
      <div className="ws-card-title">
        <div>
          <h2>Pending website leads</h2>
          <p>New widget and form submissions waiting for an estimate.</p>
        </div>
      </div>
      <div className="ws-table-wrap">
        <table className="ws-table">
          <thead>
            <tr>
              <th>Lead</th>
              <th>Contact</th>
              <th>Source</th>
              <th>Received</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <span className="ws-table-main">{lead.name}</span>
                </td>
                <td>
                  <small>{lead.email || lead.phone || "—"}</small>
                </td>
                <td>
                  <span className="ws-chip blue">{lead.source}</span>
                </td>
                <td>{lead.createdAt ? formatDate(lead.createdAt.slice(0, 10)) : "—"}</td>
                <td>
                  <button className="ws-btn primary" onClick={() => onStart(lead.id)}>
                    Start estimate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
