import { useEffect, useRef, useState, type ReactNode } from "react";
import "./moveflew-loader.css";

function LoaderMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 68"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M32 3 60 19v30L32 65 4 49V19L32 3Z M4 19l28 16 28-16 M32 35v30"
        pathLength="1"
        data-draw
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path
        d="m13.33 13.67 28 16 M22.67 8.33l28 16 M13.33 24.33l28-16 M22.67 29.67l28-16 M13.33 24.33v30 M22.67 29.67v30 M41.33 29.67v30 M50.67 24.33v30 M4 29l28 16 28-16 M4 39l28 16 28-16"
        pathLength="1"
        data-draw
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function usePrefersReducedMotion() {
  // Keep the server and first client render identical; the effect applies the
  // device preference immediately after hydration.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function")
      return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * The progress is intentionally asymptotic while a request is pending. It gives
 * immediate motion without claiming completion, then resolves to 100 when the
 * caller marks the work done.
 */
function useLoaderProgress(done: boolean, reduced: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (reduced) {
      setProgress(done ? 100 : 92);
      return;
    }

    if (!done) setProgress(0);
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 64);
      previous = now;
      setProgress(current => {
        const target = done ? 100 : 92;
        if (current >= target) return current;
        const speed = done ? 0.28 : 0.06;
        return Math.min(target, current + speed * Math.max(elapsed, 8));
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [done, reduced]);

  return progress;
}

export function GlobalLoader({
  label = "Preparing your workspace…",
  done = false,
  minDuration = 850,
  onExited,
}: {
  label?: string;
  done?: boolean;
  minDuration?: number;
  onExited?: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const progress = useLoaderProgress(done, reduced);
  const [exiting, setExiting] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!done) setExiting(false);
  }, [done]);

  useEffect(() => {
    if (!done || progress < 100) return;
    const wait = reduced
      ? 0
      : Math.max(120, minDuration - (Date.now() - startedAt.current));
    const hold = window.setTimeout(() => setExiting(true), wait);
    const finish = window.setTimeout(
      () => onExited?.(),
      wait + (reduced ? 20 : 950),
    );
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(finish);
    };
  }, [done, progress, reduced, minDuration, onExited]);

  const rounded = Math.round(progress);
  const shown = String(rounded).padStart(2, "0");

  return (
    <div
      className={`mf-loader ${exiting ? "is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-busy="true"
      data-reduced-motion={reduced ? "true" : "false"}
    >
      <div className="mf-loader__curtain" aria-hidden="true">
        <span className="mf-loader__grid" />
        <span className="mf-loader__glow mf-loader__glow--one" />
        <span className="mf-loader__glow mf-loader__glow--two" />
      </div>
      <div className="mf-loader__inner">
        <div className="mf-loader__topline">
          <span className="mf-loader__wordmark">
            Move<span>Flew</span>
          </span>
          <span className="mf-loader__signal">
            <i /> Live operations
          </span>
        </div>

        <div className="mf-loader__hero">
          <span className="mf-loader__hero-glow" aria-hidden="true" />
          <LoaderMark className="mf-loader__glyph" />
          <span className="mf-loader__hero-copy">
            <b>
              Move<span>Flew</span>
            </b>
            <small>Precision in motion</small>
          </span>
        </div>

        <div className="mf-loader__progress">
          <div className="mf-loader__readout">
            <span className="mf-loader__label">{label}</span>
            <span className="mf-loader__percent" aria-hidden="true">
              {shown}
              <small>%</small>
            </span>
          </div>
          <div
            className="mf-loader__track"
            role="progressbar"
            aria-label={`${label} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={rounded}
          >
            <span
              className="mf-loader__bar"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-screen route fallback for lazy public routes and router suspense. */
export function PageLoader({
  label = "Loading MoveFlew…",
}: {
  label?: string;
}) {
  return <GlobalLoader label={label} />;
}

/** Lightweight inline loader for tables, panels and view-level data fetches. */
export function SectionLoader({
  label = "Loading workspace…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`mf-section-loader ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="mf-section-loader__mark" aria-hidden="true">
        <LoaderMark />
      </span>
      <span className="mf-section-loader__body">
        <span className="mf-section-loader__label">{label}</span>
        <span className="mf-section-loader__track" aria-hidden="true">
          <i />
        </span>
      </span>
    </div>
  );
}

/** Gives each workspace route a short reveal after the boot curtain lifts. */
export function PageReveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mf-page-reveal ${className}`}>{children}</div>;
}
