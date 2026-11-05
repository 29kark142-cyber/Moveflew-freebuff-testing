import type { ReactNode } from "react";
import "./core.css";

export function CorePage({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="core-page">
      <header className="ws-page-head">
        <div>
          <span className="ws-eyebrow">MoveFlew</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="core-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
export function CoreCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="core-card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function CoreNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`core-notice core-notice--${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
