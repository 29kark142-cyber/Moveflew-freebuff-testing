import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { claimStatusLabel } from "@shared/claims";
import { ops } from "@/lib/ops-api";

const money = (cents: number) =>
  (Number(cents) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });

/** Claim decisions and payouts linked to this job. Payout rows are real finance expenses. */
export default function JobClaims({ jobId }: { jobId: number }) {
  const [claims, setClaims] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void ops
      .claims()
      .then((all) => {
        if (active) setClaims(all.filter((claim) => Number(claim.jobId) === jobId));
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load claims");
      });
    return () => {
      active = false;
    };
  }, [jobId]);

  if (error || !claims?.length) return null;

  return (
    <section className="ws-card ws-card-pad" data-tour="job-claims">
      <div className="ws-card-title">
        <div>
          <h2>Claims and payouts</h2>
          <p>Damage or missing-item claims linked to this move.</p>
        </div>
        <ShieldAlert size={18} />
      </div>
      <div className="ws-table-wrap">
        <table className="ws-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Claimed</th>
              <th>Approved</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={String(claim.id)}>
                <td>{String(claim.type || "claim")}</td>
                <td>{claimStatusLabel(claim.status)}</td>
                <td className="ops-money">{money(Number(claim.claimedCents))}</td>
                <td className="ops-money">{money(Number(claim.approvedCents))}</td>
                <td className="ops-money">
                  {Number(claim.payoutExpenseId) > 0 ? money(Number(claim.payoutCents)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
