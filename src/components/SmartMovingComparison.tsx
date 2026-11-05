import { Link } from "@/lib/wouter";
import { ArrowRight, Banknote, Camera, Check, Minus, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { comparisonRows } from "@/lib/smartmoving-comparison";

export function ComparisonMatrix() {
  return (
    <div className="saas-matrix" role="table" aria-label="MoveFlew versus SmartMoving capabilities">
      <div className="saas-matrix-row saas-matrix-head" role="row">
        <strong role="columnheader">Capability</strong>
        <strong role="columnheader">MoveFlew</strong>
        <strong role="columnheader">SmartMoving</strong>
      </div>
      {comparisonRows.map(({ capability, Icon, moveflew, smartmoving }) => (
        <div className="saas-matrix-row" role="row" key={capability}>
          <strong role="rowheader">
            <span className="saas-matrix-cap">
              <Icon size={15} aria-hidden="true" />
              {capability}
            </span>
          </strong>
          <span role="cell" data-column="MoveFlew">
            <Check size={15} aria-hidden="true" />
            {moveflew}
          </span>
          <span role="cell" data-column="SmartMoving">
            <Minus size={15} aria-hidden="true" />
            {smartmoving}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ComparisonHighlights() {
  return (
    <div className="saas-alt-highlights">
      <article className="saas-alt-card">
        <span className="saas-alt-card-icon">
          <Smartphone size={20} aria-hidden="true" />
        </span>
        <h3>Built for Crews in the Field</h3>
        <p>
          Move day rarely happens where the signal does. Your crew keeps working through elevators,
          parking garages and rural drop-offs, and the paperwork catches up on its own.
        </p>
        <ul className="saas-alt-points">
          <li>
            <Camera size={15} aria-hidden="true" />
            <span>Pre-move photo inspections stored with the job</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Offline signature capture on any phone or tablet</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Background sync the moment a connection returns</span>
          </li>
        </ul>
        <Link href="/demo/proposal" className="saas-alt-card-link">
          See what your customer signs <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </article>

      <article className="saas-alt-card is-roi">
        <span className="saas-alt-card-icon">
          <Banknote size={20} aria-hidden="true" />
        </span>
        <h3>Transparent ROI</h3>
        <p className="saas-alt-savings">
          <strong>Free now</strong>
          <span>every module, unlimited users, no card</span>
        </p>
        <ul className="saas-alt-points">
          <li>
            <Check size={15} aria-hidden="true" />
            <span>One flat monthly rate for unlimited users — no per-seat fees</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>No setup fee and no annual contract to cancel</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Every module included; nothing sold as a paid add-on</span>
          </li>
          <li>
            <Check size={15} aria-hidden="true" />
            <span>Paid plans announced to beta companies before beta closes</span>
          </li>
        </ul>
        <p className="saas-alt-roi-note">
          MoveFlew is free while in beta and is not selling paid plans yet. Pricing will be shared
          with beta companies in advance, so nothing changes without notice.
        </p>
        <Button asChild variant="outline" className="saas-alt-card-cta">
          <Link href="/register">
            Try MoveFlew Free <ArrowRight size={16} />
          </Link>
        </Button>
      </article>
    </div>
  );
}
