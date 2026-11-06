import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Compass,
  FilePenLine,
  Play,
  ReceiptText,
  ScanLine,
  Search,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  GUIDED_TOURS,
  GUIDED_TOUR_COMPLETED_EVENT,
  readTourCompletion,
  requestGuidedTour,
  type GuidedTourId,
} from "@/lib/guided-tour";

const ICONS: Record<GuidedTourId, LucideIcon> = {
  full_platform: Compass,
  crew_invite: UsersRound,
  quotes: ReceiptText,
  field_qr: ScanLine,
  bol_signoff: FilePenLine,
  surge_pricing: TrendingUp,
};

export default function InteractiveGuides() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GUIDED_TOURS.map((tour) => [tour.id, readTourCompletion(tour.id)])),
  );

  useEffect(() => {
    const refresh = () =>
      setCompleted(
        Object.fromEntries(GUIDED_TOURS.map((tour) => [tour.id, readTourCompletion(tour.id)])),
      );
    window.addEventListener(GUIDED_TOUR_COMPLETED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(GUIDED_TOUR_COMPLETED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const microTours = useMemo(
    () => GUIDED_TOURS.filter((tour) => tour.id !== "full_platform"),
    [],
  );
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      microTours.filter((tour) =>
        [tour.title, tour.summary, tour.category, ...tour.keywords]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      ),
    [microTours, normalized],
  );
  const completedCount = microTours.filter((tour) => completed[tour.id]).length;

  return (
    <section className="ws-guides ws-card ws-card-pad" data-tour="settings-guides">
      <div className="ws-card-title ws-guides__head">
        <div>
          <span className="ws-eyebrow">
            <Sparkles size={13} aria-hidden="true" /> {t("GUIDED LEARNING")}
          </span>
          <h2>{t("Interactive Guides & Tutorials")}</h2>
          <p>
            {t(
              "Replay the full platform walkthrough or focus on one workflow. Every guide dims the screen and spotlights the controls it explains.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="ws-btn primary ws-guides__full"
          onClick={() => requestGuidedTour("full_platform")}
        >
          <Play size={15} />
          {t("Start Full Platform Tour")}
        </button>
      </div>

      <div className="ws-guides__toolbar">
        <label className="ws-guides__search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{t("Find a tutorial topic")}</span>
          <input
            type="search"
            value={query}
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search tutorials by topic, such as crew, quotes or BOL…")}
          />
          {query && (
            <button
              type="button"
              aria-label={t("Clear tutorial search")}
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <span className="ws-guides__count">
          {t("{done} of {total} quick guides completed", {
            done: completedCount,
            total: microTours.length,
          })}
        </span>
      </div>

      {filtered.length ? (
        <div className="ws-guides__grid">
          {filtered.map((tour) => {
            const Icon = ICONS[tour.id];
            const done = Boolean(completed[tour.id]);
            return (
              <article
                className={`ws-guide${done ? " is-complete" : ""}`}
                key={tour.id}
                data-tour={`guide-${tour.id}`}
              >
                <div className="ws-guide__top">
                  <span className="ws-guide__icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  {done ? (
                    <span className="ws-chip green">
                      <CheckCircle2 size={12} /> {t("Completed")}
                    </span>
                  ) : (
                    <span className="ws-chip blue">{t(tour.category)}</span>
                  )}
                </div>
                <h3>{t(tour.title)}</h3>
                <p>{t(tour.summary)}</p>
                <div className="ws-guide__meta">
                  <span>{t("{count} steps", { count: tour.steps.length })}</span>
                  <span>~{t("{minutes} min", { minutes: tour.estimatedMinutes })}</span>
                </div>
                <button
                  type="button"
                  className={`ws-btn${done ? "" : " primary"} ws-guide__play`}
                  onClick={() => requestGuidedTour(tour.id)}
                >
                  <Play size={13} />
                  {done ? t("Replay guide") : t("Play guide")}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ws-guides__empty">
          <Search size={22} aria-hidden="true" />
          <b>{t("No matching tutorials")}</b>
          <span>{t("Try a shorter topic such as crew, quote, field, BOL or surge.")}</span>
          <button type="button" className="ws-btn" onClick={() => setQuery("")}>
            {t("Show all guides")}
          </button>
        </div>
      )}
    </section>
  );
}
