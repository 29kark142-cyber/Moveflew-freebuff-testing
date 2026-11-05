import {
  ArrowUpRight,
  CalendarDays,
  Check,
  FileText,
  Home,
  LayoutDashboard,
  Package,
  Truck,
  UsersRound,
  BarChart3,
  Settings,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/wouter";
import { useI18n } from "@/lib/i18n";
import { money } from "@shared/crm";
const heights = [35, 48, 39, 66, 57, 85, 76, 96];
const crew = [
  ["JD", "James D.", "Driver"],
  ["MT", "Mike T.", "Crew lead"],
  ["AR", "Alex R.", "Mover"],
];
const stats = [
  ["Moves this month", "24", "+12%"],
  ["Booked revenue", "$28,640", "+18%"],
  ["Jobs today", "6", "On track"],
];

export default function ProductPreview() {
  const { t, locale } = useI18n();
  const previewDate = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(2026, 9, 1));
  const previewTime = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 9, 1, 9));
  const formatNumber = (value: string) =>
    new Intl.NumberFormat(locale).format(Number(value));
  const weekdayLabels = Array.from({ length: 8 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
      new Date(2026, 9, 5 + index)
    )
  );
  return (
    <div
      className="product-preview"
      aria-label={t("Illustrative MoveFlew workspace preview")}
    >
      <div className="preview-main">
        <div className="browser-chrome">
          <i />
          <i />
          <i />
          <span>MoveFlew · {t("Workspace")}</span>
        </div>
        <div className="preview-screen">
          <div className="preview-rail">
            <span className="tiny-brand">
              <Truck size={18} />
            </span>
            {[
              LayoutDashboard,
              UsersRound,
              FileText,
              CalendarDays,
              Truck,
              BarChart3,
              Settings,
            ].map((Icon, i) => (
              <Icon key={i} className={i === 0 ? "selected" : ""} size={16} />
            ))}
          </div>
          <div className="preview-dashboard">
            <div className="preview-heading">
              <div>
                <small>{t("YOUR BUSINESS, AT A GLANCE")}</small>
                <h4>
                  {t("Good morning, Alex")} <span>↗</span>
                </h4>
              </div>
              <span className="preview-date">{previewDate}</span>
            </div>
            <div className="preview-stats">
              {stats.map(([title, value, trend]) => (
                <div key={title}>
                  <small>{t(title)}</small>
                  <strong>
                    {value === "$28,640" ? money(28640) : formatNumber(value)}
                  </strong>
                  <span>
                    {t(trend)} <ArrowUpRight size={10} />
                  </span>
                </div>
              ))}
            </div>
            <div className="preview-charts">
              <div className="preview-chart">
                <h5>
                  {t("Moving your business forward")} <span>···</span>
                </h5>
                <div className="bar-chart">
                  <div className="chart-labels">
                    <span>$10k</span>
                    <span>$5k</span>
                    <span>$0</span>
                  </div>
                  {heights.map((h, i) => (
                    <div className="bar-column" key={i}>
                      <div style={{ height: `${h}%` }} />
                      <small>{weekdayLabels[i]}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="preview-crew">
                <h5>{t("Your crew")}</h5>
                {crew.map(([initial, name, role], i) => (
                  <div key={name}>
                    <b
                      style={{
                        background: ["#e3ecff", "#fff0d9", "#e5f5ee"][i],
                      }}
                    >
                      {initial}
                    </b>
                    <span>
                      {name}
                      <small>{t(role)}</small>
                    </span>
                    <i />
                  </div>
                ))}
              </div>
            </div>
            <div className="preview-job">
              <span>
                <i /> {t("Next up")}
              </span>
              <strong>{t("{name} family move", { name: "Henderson" })}</strong>
              <small>
                {previewTime} · {t("3-bedroom home")}
              </small>
              <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </div>
      <div className="floating-dispatch">
        <div className="dispatch-top">
          <Truck size={13} />
          <strong>{t("Today’s dispatch")}</strong>
          <span>
            {t("All crews ready")} <i />
          </span>
        </div>
        <div className="mini-timeline">
          <small>{t("TRUCKS")}</small>
          <span>{t("8 AM")}</span>
          <span>{t("10 AM")}</span>
          <span>{t("12 PM")}</span>
          <span>{t("2 PM")}</span>
        </div>
        <div className="mini-dispatch-row">
          <div>
            <b>{t("Truck #{number}", { number: "01" })}</b>
            <small>
              <UsersRound size={10} /> {t("3 movers")}
            </small>
          </div>
          <span>Henderson · {t("Local move")}</span>
        </div>
        <div className="mini-dispatch-row green">
          <div>
            <b>{t("Truck #{number}", { number: "02" })}</b>
            <small>
              <UsersRound size={10} /> {t("2 movers")}
            </small>
          </div>
          <span>Mitchell · {t("Apartment")}</span>
        </div>
      </div>
      <div className="floating-estimate">
        <h4>
          <FileText size={17} />
          {t("Quick estimate")}{" "}
          <span>
            <Check size={11} /> {t("Ready")}
          </span>
        </h4>
        <div className="estimate-route">
          <div>
            <small>{t("ORIGIN")}</small>
            <b>Chicago, IL</b>
          </div>
          <ArrowRight size={14} />
          <div>
            <small>{t("DESTINATION")}</small>
            <b>Evanston, IL</b>
          </div>
        </div>
        <div className="estimate-chips">
          <span>
            <Home size={12} />
            {t("3 bedrooms")}
          </span>
          <span>
            <Package size={12} />
            {t("42 items")}
          </span>
        </div>
        <div className="estimate-line">
          <span>{t("3 movers + truck")}</span>
          <strong>$180/hr</strong>
        </div>
        <div className="estimate-line">
          <span>{t("Estimated labor")}</span>
          <strong>{t("4 hours")}</strong>
        </div>
        <Link href="/app/estimates/new" className="estimate-total">
          <span>{t("Build your estimate")}</span>
          <ArrowUpRight size={19} />
        </Link>
      </div>
      <Link
        href="/platform"
        aria-label={t("Explore the platform")}
        className="preview-play"
      >
        <span>▶</span>
      </Link>
      <span className="preview-caption">
        {t("Illustrative workspace · your real data, all in one place")}
      </span>
    </div>
  );
}
