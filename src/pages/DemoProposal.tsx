import { Link } from "@/lib/wouter";
import { ArrowRight, CalendarDays, CheckCircle2, Info, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasLayout from "@/components/SaasLayout";
import MoveGridBrand from "@/components/MoveGridBrand";

const moveDate = new Date("2026-12-12T12:00:00");
const moveDateLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(moveDate);

const lines = [
  { label: "Labor — crew of 2 · 4 estimated hours @ $130/hour", value: "$520.00" },
  { label: "Route travel fee — Chicago, IL to Evanston, IL (12.4 miles)", value: "$45.00" },
  { label: "Fuel surcharge — 12.4 miles @ $2.26/mile", value: "$28.00" },
];

/**
 * Public sample of a customer-facing proposal. All values are illustrative and
 * local to this page — no tenant, job or customer record is read or created.
 */
export default function DemoProposal() {
  return (
    <SaasLayout light>
      <section className="saas-wrap saas-demo">
        <p className="saas-demo-flag">
          <Info size={15} aria-hidden="true" />
          <span>
            Sample proposal with illustrative data. It is not a real customer record and cannot be
            signed or paid.
          </span>
        </p>

        <article className="saas-demo-card">
          <header className="saas-demo-head">
            <div className="saas-demo-mark">
              <strong>Prairie State Moving Co.</strong>
              <small>Moving estimate · #2418</small>
            </div>
            <span className="saas-demo-powered">
              Proposal delivered by <MoveGridBrand />
            </span>
          </header>

          <div className="saas-demo-intro">
            <div>
              <span className="saas-eyebrow">PREPARED FOR</span>
              <h1>Jordan Rivera</h1>
              <p>
                Thank you for considering Prairie State Moving Co. This estimate is based on the move
                details below.
              </p>
            </div>
            <div className="saas-demo-date">
              <span>
                <CalendarDays size={14} aria-hidden="true" /> Move date
              </span>
              <b>{moveDateLabel}</b>
              <small>Crew arrives 8:00 AM</small>
            </div>
          </div>

          <div className="saas-demo-details">
            <section>
              <h3>
                <MapPin size={14} aria-hidden="true" /> Pickup
              </h3>
              <p>1428 N Kingsbury St, Chicago, IL</p>
              <small>3rd floor walk-up · elevator available for furniture</small>
            </section>
            <section>
              <h3>
                <MapPin size={14} aria-hidden="true" /> Delivery
              </h3>
              <p>1809 Chicago Ave, Evanston, IL</p>
              <small>Single-family home · driveway access</small>
            </section>
          </div>

          <section className="saas-demo-breakdown">
            <h2>Estimate breakdown</h2>
            <div className="saas-demo-lines">
              {lines.map(line => (
                <div className="saas-demo-line" key={line.label}>
                  <span>{line.label}</span>
                  <strong>{line.value}</strong>
                </div>
              ))}
            </div>
            <div className="saas-demo-total">
              <span>
                <small>Estimated total</small>
                <br />
                Final billing may reflect recorded actual labor where applicable.
              </span>
              <b>$593.00</b>
            </div>
          </section>

          <section className="saas-demo-terms">
            <h2>Estimate terms</h2>
            <p>
              This estimate reflects the scope, route and selected accessorials shown above. Changes
              to inventory, access conditions, dates or services may change the final amount. Hourly
              moves are subject to a configured minimum of 2.5 hours.
            </p>
          </section>

          <section className="saas-demo-sign">
            <h2>Accept this estimate</h2>
            <p>
              In the live product the customer signs on the spot with a finger or stylus. The drawing
              below is a static example.
            </p>
            <div className="saas-demo-signature">
              <svg viewBox="0 0 300 78" role="img" aria-label="Example customer signature">
                <path
                  d="M18 58c10-30 18-42 26-42 7 0 8 9 3 21s-9 22-3 22 12-14 19-26 14-21 21-21 7 10 2 20-8 18-2 18 10-9 17-18 13-16 19-16 6 8 1 17-7 15-1 15 9-6 17-13 14-11 19-11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M96 66c34-6 78-10 128-9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  opacity=".55"
                />
              </svg>
              <small>Signed by Jordan Rivera · Nov 2, 2026</small>
            </div>
            <p className="saas-demo-agree">
              <CheckCircle2 size={16} aria-hidden="true" />
              I have reviewed this estimate and accept the terms and authorization above.
            </p>
          </section>

          <section className="saas-demo-deposit">
            <div>
              <h2>Booking deposit</h2>
              <p>
                Charged through Stripe when the customer pays. The balance is collected after the
                move.
              </p>
            </div>
            <b>$148.25</b>
          </section>
        </article>

        <div className="saas-demo-actions">
          <Button asChild size="lg">
            <Link href="/register">
              Try MoveFlew Free <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/smartmoving-alternative">
              <ShieldCheck size={18} aria-hidden="true" /> See the comparison
            </Link>
          </Button>
        </div>
      </section>
    </SaasLayout>
  );
}
