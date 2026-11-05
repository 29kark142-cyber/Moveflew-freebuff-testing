import { createFileRoute } from "@tanstack/react-router";
import SaasLayout from "@/components/SaasLayout";

const title = "Privacy Policy — MoveFlew";
const description =
  "How MoveFlew collects, uses and protects data for moving companies: account details, move addresses, field photos, e-signatures and Stripe payment processing. Your data is never sold.";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://moveflew.lovable.app/privacy" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://moveflew.lovable.app/privacy" }],
  }),
  component: PrivacyPage,
});

const sections = [
  ["overview", "Overview"],
  ["collect", "Information we collect"],
  ["use", "How we use information"],
  ["payments", "Payments and Stripe"],
  ["protect", "How we protect data"],
  ["nosell", "We never sell your data"],
  ["providers", "Service providers"],
  ["retention", "Data retention"],
  ["rights", "Your rights and choices"],
  ["children", "Children's privacy"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact us"],
] as const;

function PrivacyPage() {
  return (
    <SaasLayout light>
      <section className="saas-wrap saas-legal">
        <div className="saas-legal-head">
          <span className="saas-eyebrow">LEGAL</span>
          <h1>Privacy Policy</h1>
          <p className="saas-legal-updated">Effective 2 November 2026</p>
          <p className="saas-legal-intro">
            MoveFlew is a CRM and dispatch platform for moving companies. This
            policy explains what information we handle, why we handle it, how it
            is protected, and the choices available to you.
          </p>
        </div>

        <div className="saas-legal-layout">
          <nav className="saas-legal-nav" aria-label="Privacy policy sections">
            {sections.map(([id, label]) => (
              <a href={`#${id}`} key={id}>
                {label}
              </a>
            ))}
          </nav>

          <div className="saas-legal-body">
            <div className="saas-legal-section" id="overview">
              <h2>Overview</h2>
              <p>
                MoveFlew Technologies Inc. (&ldquo;MoveFlew&rdquo;,
                &ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the MoveFlew
                platform and the customer workspaces created through it. Moving
                companies use the platform to run their own operations: capture
                leads, build estimates, schedule crews and trucks, complete
                move-day documentation, and collect deposits.
              </p>
              <p>
                Most of the personal data we process belongs to the moving
                company that created the workspace and to its customers. That
                company decides what it records; MoveFlew stores and protects it
                on the company&rsquo;s behalf and does not use it for its own
                marketing or advertising.
              </p>
              <div className="saas-legal-callout">
                <p>
                  <strong>In short:</strong> we collect only what a moving
                  operation needs to function, we never sell your data, and
                  every company&rsquo;s workspace is separated from every other
                  company&rsquo;s by database-level Row Level Security.
                </p>
              </div>
            </div>

            <div className="saas-legal-section" id="collect">
              <h2>Information we collect</h2>
              <p>
                We collect the categories below when a moving company signs up,
                when its team uses the platform, and when a customer submits a
                quote request through a connected website or form.
              </p>
              <div className="saas-legal-table">
                <div className="saas-legal-row saas-legal-row-head">
                  <strong>Category</strong>
                  <strong>What it covers</strong>
                </div>
                <div className="saas-legal-row">
                  <strong>User account information</strong>
                  <span>
                    Company name, owner and team member names, work email
                    addresses, phone numbers, password credentials (stored as
                    salted hashes, never in plain text), subscription plan,
                    workspace roles and permission settings.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Moving addresses and job details</strong>
                  <span>
                    Pickup and delivery addresses, move dates and times,
                    inventory and room lists, storage units, access notes such
                    as elevators or parking, estimates, line items and invoices.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Photos</strong>
                  <span>
                    Images captured through the mobile field workspace
                    (<code>/app/field</code>) during loading, in transit and at
                    drop-off, used to document the condition of items and the
                    completed work.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Electronic signatures</strong>
                  <span>
                    Touch signatures captured on a phone or tablet in{" "}
                    <code>/app/field</code>, embedded into the Bill of Lading,
                    Pre-Existing Damage Waiver and Furniture Inspection
                    Checklist, together with the signed document snapshot,
                    timestamps and the signer&rsquo;s name and role.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Payment information</strong>
                  <span>
                    Transaction references, amounts, currency and payment
                    status. Card data is entered on Stripe&rsquo;s checkout and
                    is not stored on MoveFlew servers.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Technical and usage data</strong>
                  <span>
                    Log data such as IP address, browser and device type, pages
                    and features used, and diagnostic errors. Used for security,
                    abuse prevention and reliability.
                  </span>
                </div>
              </div>
              <p>
                When a moving company embeds our quote widget or connects a
                website form, the quote request (contact details, addresses and
                move size) is delivered into that company&rsquo;s workspace as a
                lead. Quote submissions are limited to ten requests per minute
                per IP address to block abusive and automated submissions.
              </p>
            </div>

            <div className="saas-legal-section" id="use">
              <h2>How we use information</h2>
              <ul>
                <li>Provide, maintain and secure the platform and workspaces.</li>
                <li>
                  Process quote requests, estimates, proposals, approvals and
                  job bookings.
                </li>
                <li>
                  Complete and store move-day documentation such as signed
                  documents, inspection checklists and photos.
                </li>
                <li>
                  Process deposits and invoices, and issue payment receipts and
                  related notices.
                </li>
                <li>
                  Calculate driving distance and travel time for estimates and
                  dispatch.
                </li>
                <li>
                  Prevent abuse, spam and unauthorized access, including rate
                  limits and validation on public intake endpoints.
                </li>
                <li>Respond to support requests and diagnose faults.</li>
                <li>Comply with legal and regulatory obligations.</li>
              </ul>
              <p>
                The in-app assistant receives only the workspace name, the
                signed-in user&rsquo;s role and the page they are viewing. It is
                not given customer records, job records or payment data, and
                workspace data is not used to train third-party AI models.
              </p>
            </div>

            <div className="saas-legal-section" id="payments">
              <h2>Payments and Stripe</h2>
              <p>
                Deposits and payments are processed by Stripe. When a customer
                pays a deposit from a proposal page, the card details are
                collected and processed by Stripe under its own privacy policy
                and terms; MoveFlew receives a payment confirmation, the amount,
                the currency and a transaction reference so the job can be
                booked and the invoice produced.
              </p>
              <p>
                MoveFlew does not store full card numbers, expiry dates or
                security codes. Test payments and live payments are kept
                separate, and a job is booked only after a payment is verified
                by Stripe.
              </p>
            </div>

            <div className="saas-legal-section" id="protect">
              <h2>How we protect data</h2>
              <ul>
                <li>
                  <strong>PostgreSQL Row Level Security.</strong> Workspace data
                  is separated inside the database itself. Every query runs as
                  the signed-in user, and the database engine only returns rows
                  belonging to a workspace that user has been granted access to.
                  Isolation is enforced by the database, not only by
                  application code.
                </li>
                <li>
                  <strong>Role-based access.</strong> Each workspace assigns
                  roles such as owner, office admin, estimator, dispatcher or
                  crew. Crew members can see and update only the jobs assigned
                  to them.
                </li>
                <li>
                  <strong>Credential protection.</strong> Passwords are stored
                  as salted hashes and are never kept in plain text.
                </li>
                <li>
                  <strong>Encrypted transport.</strong> All access to the
                  platform and its APIs is served over HTTPS.
                </li>
                <li>
                  <strong>Short-lived document links.</strong> Signed move
                  documents and private workspace uploads are served through
                  expiring links, so a lost link stops working quickly.
                </li>
                <li>
                  <strong>Abuse limits.</strong> Public intake endpoints share an
                  atomic rolling rate limiter and validate every payload before
                  it reaches a workspace.
                </li>
                <li>
                  <strong>Least-privilege administration.</strong> Platform
                  administration is restricted to named administrator accounts,
                  support inspection is read-only, and tenant changes are
                  recorded.
                </li>
              </ul>
            </div>

            <div className="saas-legal-section" id="nosell">
              <h2>We never sell your data</h2>
              <div className="saas-legal-callout">
                <p>
                  MoveFlew does not sell, rent or trade personal or business
                  data, and does not share it for advertising purposes.
                </p>
              </div>
              <p>We disclose data only in these situations:</p>
              <ul>
                <li>
                  To the moving company that owns the workspace, which controls
                  its own records and decides what it collects from its
                  customers.
                </li>
                <li>
                  To service providers that process data on our behalf under
                  written contract, for the purposes listed below.
                </li>
                <li>
                  When we are required to do so by law, regulation or a valid
                  legal process.
                </li>
                <li>
                  To protect the rights, safety or property of MoveFlew, our
                  customers, or the public.
                </li>
              </ul>
            </div>

            <div className="saas-legal-section" id="providers">
              <h2>Service providers</h2>
              <div className="saas-legal-table">
                <div className="saas-legal-row saas-legal-row-head">
                  <strong>Provider</strong>
                  <strong>Purpose</strong>
                </div>
                <div className="saas-legal-row">
                  <strong>Cloud hosting and managed PostgreSQL database</strong>
                  <span>Runs the platform and stores workspace records.</span>
                </div>
                <div className="saas-legal-row">
                  <strong>Stripe</strong>
                  <span>
                    Payment processing for deposits and invoices; stores card
                    data itself.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Google Maps Routes API</strong>
                  <span>
                    Calculates driving distance and travel time between the
                    dispatch base, pickup and drop-off addresses.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>Email delivery service</strong>
                  <span>
                    Sends transactional messages such as receipts and
                    notifications.
                  </span>
                </div>
                <div className="saas-legal-row">
                  <strong>AI model gateway</strong>
                  <span>
                    Powers the in-app assistant. Receives workspace name, user
                    role and current page only; no customer or job records.
                  </span>
                </div>
              </div>
              <p className="saas-legal-note">
                A current list of subprocessors is available on request to
                support@moveflew.com.
              </p>
            </div>

            <div className="saas-legal-section" id="retention">
              <h2>Data retention</h2>
              <p>
                We keep workspace data for as long as the account is active.
                When a workspace is closed, records are deleted or anonymized
                within a defined period, except where we must retain them for
                legal, tax or audit obligations.
              </p>
              <p>
                Signed move documents, photo snapshots and payment records are
                retained as part of the auditable move record, because they are
                the evidence a moving company and its customer may later need.
                Leads submitted through a public form remain until the moving
                company deletes them.
              </p>
            </div>

            <div className="saas-legal-section" id="rights">
              <h2>Your rights and choices</h2>
              <p>
                You can request access to your personal data, ask for it to be
                corrected, request deletion, ask for a portable copy, object to
                processing, or withdraw consent where processing relies on
                consent.
              </p>
              <p>
                If your data sits inside a moving company&rsquo;s workspace,
                please make the request to that company first, since it controls
                the record. Requests can be escalated to us and we will act on
                them against the workspace.
              </p>
              <p>
                Email support@moveflew.com with your request. We acknowledge
                requests promptly and respond within 30 days, and we may need to
                verify your identity before disclosing anything.
              </p>
            </div>

            <div className="saas-legal-section" id="children">
              <h2>Children&rsquo;s privacy</h2>
              <p>
                The platform is a business tool for moving companies and is not
                directed at children. We do not knowingly collect data from
                children. If you believe a child has provided us information
                through the platform, contact support@moveflew.com and we will
                remove it.
              </p>
            </div>

            <div className="saas-legal-section" id="changes">
              <h2>Changes to this policy</h2>
              <p>
                We may update this policy as the platform changes. The effective
                date at the top of the page shows when it was last revised. For
                material changes we will notify workspace administrators by
                email or with a notice inside the platform.
              </p>
            </div>

            <div className="saas-legal-section" id="contact">
              <h2>Contact us</h2>
              <p>
                Questions about this policy, or any privacy request, can be sent
                to <a href="mailto:support@moveflew.com">support@moveflew.com</a>
                . We are happy to explain how a specific feature handles data.
              </p>
            </div>
          </div>
        </div>
      </section>
    </SaasLayout>
  );
}
