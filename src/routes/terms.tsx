import { createFileRoute } from "@tanstack/react-router";
import SaasLayout from "@/components/SaasLayout";

const title = "Terms of Service — MoveFlew";
const description =
  "The terms that govern use of MoveFlew, the CRM, dispatch and field platform for moving companies: accounts, beta access, customer data, payments and liability.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://moveflew.lovable.app/terms" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://moveflew.lovable.app/terms" }],
  }),
  component: TermsPage,
});

const sections: [string, string, string[]][] = [
  ["acceptance", "Acceptance of terms", [
    "These Terms of Service govern access to and use of the MoveFlew platform, including the web workspace, mobile field app, public proposal pages and integrations. By creating an account or using the platform you agree to these terms on behalf of yourself and the moving company you represent.",
    "If you do not agree, do not use the platform.",
  ]],
  ["accounts", "Accounts and workspaces", [
    "Each moving company operates its own workspace. The person who creates the workspace is responsible for the accuracy of account details and for the people they invite, including office staff and field crew.",
    "You are responsible for keeping sign-in credentials confidential and for all activity in your workspace. Notify us promptly of any unauthorized access.",
  ]],
  ["beta", "Beta access", [
    "MoveFlew is currently offered as a free beta. Features may change, be added or be removed, and the service may occasionally be unavailable while we improve it.",
    "Paid plans will be announced before the beta ends. We will notify workspace administrators in advance, and nothing will be charged without your explicit agreement.",
  ]],
  ["use", "Acceptable use", [
    "You agree not to misuse the platform, including attempting to access other workspaces, interfering with the service, reverse engineering it, sending spam through it, or using it for unlawful activity.",
    "We may suspend workspaces that violate these terms or put the platform or other customers at risk.",
  ]],
  ["data", "Your data", [
    "You own the data you add to your workspace, including customer records, estimates, photos, signatures and documents. You grant MoveFlew only the rights needed to host, process and display that data to provide the service.",
    "You are responsible for having the right to collect and store your customers' information and for meeting the laws that apply to your business. Our Privacy Policy explains how we handle data.",
  ]],
  ["payments", "Payments and deposits", [
    "Customer deposits are processed by Stripe. Your use of payment features is also subject to Stripe's terms. MoveFlew does not store full card numbers.",
    "You are responsible for your prices, refunds and the services you provide to your own customers.",
  ]],
  ["documents", "Documents and signatures", [
    "The platform helps you produce proposals, bills of lading, inspections and invoices with electronic signatures. You are responsible for the content of these documents and for confirming they meet the requirements of your jurisdiction.",
  ]],
  ["ip", "Intellectual property", [
    "The platform, its software, design and branding belong to MoveFlew. These terms do not grant you any right to our trademarks or source code beyond normal use of the service.",
  ]],
  ["warranty", "Disclaimers", [
    "The platform is provided “as is” and “as available”. Route distances, travel and fuel calculations and other estimates are tools to assist you; you remain responsible for verifying quotes before sending them to customers.",
  ]],
  ["liability", "Limitation of liability", [
    "To the maximum extent permitted by law, MoveFlew is not liable for indirect, incidental or consequential damages, lost profits or lost data arising from use of the platform. During the free beta our total liability is limited to the amount you paid us in the previous twelve months.",
  ]],
  ["termination", "Termination", [
    "You may stop using the platform at any time. We may suspend or end access for violations of these terms. On request we will help you export your workspace data before it is deleted.",
  ]],
  ["changes", "Changes to these terms", [
    "We may update these terms as the platform changes. The effective date at the top of the page shows the latest revision. For material changes we will notify workspace administrators by email or inside the platform.",
  ]],
];

function TermsPage() {
  return (
    <SaasLayout light>
      <section className="saas-wrap saas-legal">
        <div className="saas-legal-head">
          <span className="saas-eyebrow">LEGAL</span>
          <h1>Terms of Service</h1>
          <p className="saas-legal-updated">Effective 2 November 2026</p>
          <p className="saas-legal-intro">
            These terms describe the agreement between MoveFlew and the moving
            companies that use our CRM, dispatch and field platform.
          </p>
        </div>
        <div className="saas-legal-layout">
          <nav className="saas-legal-nav" aria-label="Terms of service sections">
            {sections.map(([id, label]) => (
              <a href={`#${id}`} key={id}>{label}</a>
            ))}
            <a href="#contact">Contact us</a>
          </nav>
          <div className="saas-legal-body">
            {sections.map(([id, label, paras]) => (
              <div className="saas-legal-section" id={id} key={id}>
                <h2>{label}</h2>
                {paras.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
              </div>
            ))}
            <div className="saas-legal-section" id="contact">
              <h2>Contact us</h2>
              <p>
                Questions about these terms can be sent to{" "}
                <a href="mailto:support@moveflew.com">support@moveflew.com</a>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </SaasLayout>
  );
}
