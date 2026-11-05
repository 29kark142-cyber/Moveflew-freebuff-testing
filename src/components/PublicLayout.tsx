import { useState, type ReactNode } from "react";
import { Link, useLocation } from "@/lib/wouter";
import {
  ArrowRight,
  Menu,
  UserRound,
  X,
  ChevronDown,
  Mail,
} from "lucide-react";
import Brand from "./Brand";
import LanguageSwitcher from "./LanguageSwitcher";
import { useI18n } from "@/lib/i18n";

export function PublicHeader({ hero = false }: { hero?: boolean }) {
  const { t } = useI18n();
  const [announcement, setAnnouncement] = useState(true);
  const [menu, setMenu] = useState(false);
  const [path] = useLocation();
  return (
    <>
      {announcement && (
        <div className="announcement">
          <span>{t("A smarter moving day starts here")}</span>
          <Link href="/app/dashboard">
            {t("Meet your new workspace")} <ArrowRight size={13} />
          </Link>
          <button
            aria-label={t("Dismiss announcement")}
            onClick={() => setAnnouncement(false)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      <header className={`public-header ${hero ? "hero-header" : ""}`}>
        <div className="public-nav wrap">
          <Brand />
          <nav
            className={menu ? "nav-open" : ""}
            aria-label={t("Main navigation")}
          >
            <Link
              className={path === "/platform" ? "active" : ""}
              href="/platform"
              onClick={() => setMenu(false)}
            >
              {t("Platform")} <ChevronDown size={12} />
            </Link>
            <Link
              className={path === "/pricing" ? "active" : ""}
              href="/pricing"
              onClick={() => setMenu(false)}
            >
              {t("Pricing")}
            </Link>
            <Link href="/contact" onClick={() => setMenu(false)}>
              {t("Contact us")}
            </Link>
            <Link href="/platform#how-it-works" onClick={() => setMenu(false)}>
              {t("Resources")} <ChevronDown size={12} />
            </Link>
            <Link
              href="/login"
              className="mobile-nav-login"
              onClick={() => setMenu(false)}
            >
              {t("Log in")}
            </Link>
          </nav>
          <div className="nav-actions">
            <LanguageSwitcher />
            <a className="nav-phone" href="mailto:support@moveflew.com">
              <Mail size={18} />
              <span>support@moveflew.com</span>
            </a>
            <Link href="/login" className="nav-login">
              <UserRound size={18} /> {t("Log in")}
            </Link>
            <Link href="/app/dashboard" className="btn btn-cyan nav-cta">
              {t("Open workspace")}
            </Link>
          </div>
          <button
            className="mobile-menu"
            aria-label={menu ? t("Close navigation") : t("Open navigation")}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </>
  );
}

export function PublicFooter() {
  const { t, tx } = useI18n();
  return (
    <footer className="public-footer">
      <div className="wrap footer-grid">
        <div>
          <Brand light />
          <p>
            {t("Careful moves. Clear details.")}
            <br />
            {t("One connected crew.")}
          </p>
        </div>
        <div>
          <h4>{t("Your workspace")}</h4>
          <Link href="/platform">{t("Explore the platform")}</Link>
          <Link href="/app/estimates/new">{t("Build an estimate")}</Link>
          <Link href="/app/dispatch">{t("Plan your day")}</Link>
        </div>
        <div>
          <h4>MoveFlew</h4>
          <Link href="/pricing">{t("Pricing")}</Link>
          <Link href="/contact">{t("Contact the crew")}</Link>
          <Link href="/login">{t("Team login")}</Link>
          <Link href="/privacy">{tx("Privacy Policy", "Политика конфиденциальности")}</Link>
          <Link href="/terms">{tx("Terms of Service", "Условия использования")}</Link>
        </div>
        <div>
          <h4>{t("Let’s talk moving")}</h4>
          <a href="mailto:support@moveflew.com">
            <Mail size={15} />
            support@moveflew.com
          </a>
        </div>
      </div>
      <div className="wrap footer-bottom">
        <span>© {new Date().getFullYear()} MoveFlew Technologies Inc. All rights reserved.</span>
        <span>{t("Built around the way you move.")}</span>
      </div>
    </footer>
  );
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main>{children}</main>
      <PublicFooter />
    </>
  );
}
