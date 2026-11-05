import { Link } from "@/lib/wouter";
import {
  ArrowRight,
  FileText,
  CalendarDays,
  UsersRound,
  Truck,
  Check,
  ShieldCheck,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import PublicLayout from "@/components/PublicLayout";
import ProductPreview from "@/components/ProductPreview";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const modules = [
  {
    icon: UsersRound,
    title: "A clear view of every customer",
    copy: "Capture new inquiries, track their source, and keep follow-up reminders close. Move from first conversation to a booked job without losing the details.",
    href: "/app/leads",
    label: "Sales & customer management",
  },
  {
    icon: FileText,
    title: "Estimates that make sense",
    copy: "Build an item-by-item inventory, calculate local or long-distance pricing, and send a shareable proposal with digital authorization.",
    href: "/app/estimates/new",
    label: "Estimates & inventory",
  },
  {
    icon: CalendarDays,
    title: "A smoother day starts with a plan",
    copy: "See your jobs, trucks, and crew on one dispatch board. Assign resources, adjust schedules, and catch overlapping bookings.",
    href: "/app/dispatch",
    label: "Scheduling & dispatch",
  },
  {
    icon: Truck,
    title: "The office and field, connected",
    copy: "Give your crew a mobile job sheet, walkthrough notes, labor time tracking, and a final customer sign-off.",
    href: "/app/field",
    label: "Field crew & fleet",
  },
  {
    icon: BarChart3,
    title: "Keep the business in view",
    copy: "Track booked moves and invoices, adjust your pricing, and keep your team working in the right workspace.",
    href: "/app/dashboard",
    label: "Reporting & administration",
  },
  {
    icon: ShieldCheck,
    title: "Your workspace. Your data.",
    copy: "Separate company workspaces and role-based access keep each team focused on its own leads, jobs, and day-to-day operations.",
    href: "/app/settings",
    label: "Workspace & permissions",
  },
];
const faqs = [
  [
    "How do I start using the workspace?",
    "Sign in, create your company workspace, and add your first customer or estimate. You can then add your fleet and crew and schedule jobs on the dispatch board.",
  ],
  [
    "Is the field crew view mobile-friendly?",
    "Yes. Crew members can access assigned job sheets on a phone, record walkthrough notes, upload damage photos, clock in and out, and collect the customer’s completion signature.",
  ],
  [
    "Can I share an estimate with a customer?",
    "Each saved estimate has a private shareable proposal link. Customers can review the quote and terms, then authorize the move with their signature.",
  ],
  [
    "Are automated messages active?",
    "The sequence builder saves your timing, conditions, and templates. Email and SMS delivery remain inactive until a delivery provider is connected.",
  ],
  [
    "Can I accept payments?",
    "Invoice checkout is connected to Stripe in test mode. Live payments require your live Stripe setup. Never use real card details while testing.",
  ],
];

export default function Platform() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <PublicLayout>
      <section className="page-heading wrap">
        <span className="section-kicker">{t("MADE FOR MOVING COMPANIES")}</span>
        <h1>
          {t("Less back-and-forth.")}
          <br />
          <span>{t("More moving forward.")}</span>
        </h1>
        <p>
          {t("One connected workspace for every part of your day—from the first call to the final sign-off.")}
        </p>
        <Link href="/app/dashboard" className="btn btn-blue">
          {t("Explore your workspace")} <ArrowRight size={18} />
        </Link>
      </section>
      <div className="platform-visual wrap">
        <ProductPreview />
      </div>
      <section className="module-grid wrap">
        {modules.map(({ icon: Icon, title, copy, href, label }) => (
          <article key={title}>
            <span className="module-icon">
              <Icon />
            </span>
            <small>{t(label)}</small>
            <h2>{t(title)}</h2>
            <p>{t(copy)}</p>
            <Link href={href} className="text-link">
              {t("Explore this feature")} <ArrowRight size={16} />
            </Link>
          </article>
        ))}
      </section>
      <section id="how-it-works" className="how-section">
        <div className="wrap">
          <span className="section-kicker">{t("YOUR WORKFLOW, SIMPLIFIED")}</span>
          <h2>{t("From a new lead to a great move.")}</h2>
          <div className="steps-grid">
            {[
              [
                "01",
                "Start the conversation",
                "Add your customer and the details of their move.",
              ],
              [
                "02",
                "Build a clear quote",
                "Create the inventory, calculate pricing, and share a proposal.",
              ],
              [
                "03",
                "Bring the crew together",
                "Book the job, assign resources, and keep the team in sync.",
              ],
              [
                "04",
                "Finish with confidence",
                "Track time, collect a signature, and send the invoice.",
              ],
            ].map(([n, title, copy]) => (
              <article key={n}>
                <b>{n}</b>
                <h3>{t(title)}</h3>
                <p>{t(copy)}</p>
                <Check size={20} />
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="faq-section wrap">
        <div>
          <span className="section-kicker">{t("A FEW THINGS TO KNOW")}</span>
          <h2>
            {t("Questions before")}
            <br />
            {t("your next move?")}
          </h2>
          <p>{t("Clear answers. No moving-day mystery.")}</p>
          <Link href="/contact" className="text-link">
            {t("Talk to the crew")} <ArrowRight size={16} />
          </Link>
        </div>
        <div>
          {faqs.map(([q, a], i) => (
            <div className="faq-row" key={q}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                {t(q)}
                <ChevronDown
                  size={19}
                  style={{ transform: open === i ? "rotate(180deg)" : "" }}
                />
              </button>
              {open === i && <p>{t(a)}</p>}
            </div>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
