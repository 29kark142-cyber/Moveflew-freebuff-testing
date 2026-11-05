import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Search,
  X,
  ArrowUpRight,
  List,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { Streamdown } from "streamdown";
import type { ModuleProps } from "@shared/expansion";
import {
  HELP_CHUNKS,
  HELP_REFERENCES,
  HELP_VERSION,
  HELP_QUICK_TASKS,
  searchHelp,
  canUseHelpRoute,
  roleLabel,
  type HelpChunk,
} from "@shared/help";
import { useI18n } from "@/lib/i18n";
import "./help.css";

export default function HelpPage({ role, navigate }: ModuleProps) {
  const { tx, t } = useI18n();
  const [query, setQuery] = useState("");
  const [relevant, setRelevant] = useState(false);
  const [active, setActive] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const reader = useRef<HTMLDivElement>(null);
  const chapters = useMemo(
    () =>
      HELP_CHUNKS.filter(
        chunk => chunk.level === 2 && !chunk.id.includes("--part-")
      ),
    []
  );
  const visible = useMemo(
    () =>
      searchHelp(query).filter(
        chunk => !relevant || chunk.roles.includes(role)
      ),
    [query, relevant, role]
  );
  const activeChapter = HELP_CHUNKS.find(
    chunk => chunk.anchor === active
  )?.chapter;
  const goSection = useCallback((anchor: string) => {
    if (!HELP_CHUNKS.some(chunk => chunk.anchor === anchor)) return;
    setQuery("");
    setRelevant(false);
    setMobileNav(false);
    setActive(anchor);
    setPendingAnchor(anchor);
    window.history.replaceState(null, "", `/app/docs#${anchor}`);
  }, []);
  useEffect(() => {
    const hash = () => {
      try {
        const anchor = decodeURIComponent(window.location.hash.slice(1));
        if (anchor) goSection(anchor);
      } catch {
        /* Ignore invalid URL escape sequences. */
      }
    };
    hash();
    window.addEventListener("hashchange", hash);
    return () => window.removeEventListener("hashchange", hash);
  }, [goSection]);
  useEffect(() => {
    if (!pendingAnchor) return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(pendingAnchor)
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      setPendingAnchor(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingAnchor, visible]);
  useEffect(() => {
    if (!reader.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      entries => {
        const intersecting = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting[0]) setActive(intersecting[0].target.id);
      },
      { rootMargin: "-85px 0px -65% 0px", threshold: 0 }
    );
    reader.current
      .querySelectorAll<HTMLElement>("section[id]")
      .forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [visible]);
  const openLink = (href: string | undefined, children: React.ReactNode) => {
    if (!href) return <span>{children}</span>;
    if (href.startsWith("#")) {
      return (
        <a
          href={href}
          onClick={event => {
            event.preventDefault();
            try {
              goSection(decodeURIComponent(href.slice(1)));
            } catch {
              /* Invalid hash is not actionable. */
            }
          }}
        >
          {children}
        </a>
      );
    }
    if (href.startsWith("/app")) {
      if (href.includes(":") || !canUseHelpRoute(href, role))
        return (
          <span
            className="help-restricted-link"
            title={tx(
              "Reference only: ask authorized staff or use a specific saved job.",
              "Справочная информация: обратитесь к уполномоченному сотруднику или откройте сохраненное задание."
            )}
          >
            {children}
          </span>
        );
      return (
        <a
          href={href}
          onClick={event => {
            if (
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              event.button === 0
            ) {
              event.preventDefault();
              navigate(href);
            }
          }}
        >
          {children}
        </a>
      );
    }
    if (/^https:\/\//i.test(href))
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    return <span>{children}</span>;
  };
  const renderChunk = (chunk: HelpChunk) => {
    if (
      chunk.heading === "Quick-Task Reference" &&
      !chunk.id.includes("--part-")
    ) {
      return (
        <>
          <h2>{chunk.heading}</h2>
          <p className="help-section-intro">
            {tx(
              "Jump to a task. Your current role controls which destinations are available.",
              "Перейдите к задаче. Доступ к разделам зависит от вашей роли."
            )}
          </p>
          <div className="help-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tx("Task", "Задача")}</th>
                  <th>{tx("Direct route", "Прямой маршрут")}</th>
                  <th>
                    {tx(
                      "Minimum reference role",
                      "Минимальная справочная роль"
                    )}
                  </th>
                  <th>
                    {tx(
                      "Your access / operating note",
                      "Ваш доступ / примечание"
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {HELP_QUICK_TASKS.map(task => {
                  const allowed = task.roles.includes(role);
                  return (
                    <tr key={task.id}>
                      <td>
                        <strong>{task.title}</strong>
                      </td>
                      <td>
                        {allowed ? (
                          <a
                            href={task.route}
                            onClick={event => {
                              if (!event.ctrlKey && !event.metaKey) {
                                event.preventDefault();
                                navigate(task.route);
                              }
                            }}
                          >
                            <code>{task.route}</code>
                            <ArrowUpRight size={12} aria-hidden="true" />
                          </a>
                        ) : (
                          <code>{task.route}</code>
                        )}
                      </td>
                      <td>{task.minimumRole}</td>
                      <td>
                        <span
                          className={`help-access ${allowed ? "allowed" : "restricted"}`}
                        >
                          {allowed
                            ? tx(
                                "Available to your role",
                                "Доступно вашей роли"
                              )
                            : tx(
                                "Ask authorized staff",
                                "Обратитесь к уполномоченному сотруднику"
                              )}
                        </span>
                        <small>{task.note}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Roles are not a single seniority ladder. These reference roles do
            not replace workspace permissions: authorized office staff can
            perform supported tasks, dispatchers can also perform physical
            storage intake, and field crew access stays limited to assigned
            moves.
          </p>
        </>
      );
    }
    return (
      <Streamdown
        parseIncompleteMarkdown={false}
        isAnimating={false}
        controls={false}
        skipHtml
        components={{ a: ({ href, children }) => openLink(href, children) }}
      >{`${chunk.markdown}\n\n${HELP_REFERENCES}`}</Streamdown>
    );
  };
  return (
    <div className="help-center">
      <header className="help-header">
        <span className="help-eyebrow">
          <BookOpen size={15} aria-hidden="true" />
          {tx("MOVEFLEW KNOWLEDGE CENTER", "БАЗА ЗНАНИЙ MOVEFLEW")}
        </span>
        <h1>
          {tx(
            "A clear answer. A smoother move.",
            "Понятный ответ. Спокойный переезд."
          )}
        </h1>
        <p>
          {tx(
            "Your complete operating manual, from the first lead to the final invoice.",
            "Полное руководство по работе — от первого лида до итогового счета."
          )}
        </p>
        <div className="help-header-meta">
          <span>
            {tx(
              "English manual · EN / RU terminology",
              "Руководство на английском · терминология EN / RU"
            )}
          </span>
          <span>
            <ShieldCheck size={13} aria-hidden="true" />
            {t(roleLabel(role))}
          </span>
        </div>
      </header>
      <div className="help-controls">
        <label className="help-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">
            {tx("Search the operating manual", "Поиск по руководству")}
          </span>
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={event => setQuery(event.target.value)}
            placeholder={tx(
              "Search a task, UI label, or route…",
              "Найдите задачу, название или маршрут…"
            )}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label={tx("Clear search", "Очистить поиск")}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <label className="help-relevance">
          <input
            type="checkbox"
            checked={relevant}
            onChange={event => setRelevant(event.target.checked)}
          />
          {tx("Relevant to my role", "Для моей роли")}
        </label>
        <button
          className="help-toc-toggle"
          onClick={() => setMobileNav(value => !value)}
          aria-expanded={mobileNav}
          aria-controls="help-toc"
        >
          <List size={17} />
          {tx("Contents", "Содержание")}
        </button>
      </div>
      <p className="help-permission-note">
        {tx(
          "All chapters are available as reference. Role highlights guide you; they never change workspace permissions or assigned-job access.",
          "Все главы доступны для ознакомления. Подсказки по ролям не изменяют права доступа или назначение заданий."
        )}
      </p>
      <div className="help-layout">
        <nav
          id="help-toc"
          aria-label={tx("Manual sections", "Разделы руководства")}
          className={`help-toc ${mobileNav ? "is-open" : ""}`}
        >
          <span className="help-toc-title">
            {tx("IN THIS MANUAL", "В РУКОВОДСТВЕ")}
          </span>
          <a
            href={`#${HELP_CHUNKS[0].anchor}`}
            onClick={event => {
              event.preventDefault();
              goSection(HELP_CHUNKS[0].anchor);
            }}
          >
            {tx("Introduction", "Введение")}
          </a>
          {chapters.map(chapter => (
            <div key={chapter.id}>
              <a
                href={`#${chapter.anchor}`}
                className={
                  active === chapter.anchor || activeChapter === chapter.chapter
                    ? "active"
                    : ""
                }
                aria-current={
                  active === chapter.anchor ? "location" : undefined
                }
                onClick={event => {
                  event.preventDefault();
                  goSection(chapter.anchor);
                }}
              >
                <ChevronRight size={12} aria-hidden="true" />
                {chapter.heading}
              </a>
              {activeChapter === chapter.chapter &&
                HELP_CHUNKS.filter(
                  chunk =>
                    chunk.level === 3 &&
                    chunk.chapter === chapter.chapter &&
                    !chunk.id.includes("--part-")
                ).map(chunk => (
                  <a
                    className={`help-toc-sub ${active === chunk.anchor ? "active" : ""}`}
                    href={`#${chunk.anchor}`}
                    key={chunk.id}
                    aria-current={
                      active === chunk.anchor ? "location" : undefined
                    }
                    onClick={event => {
                      event.preventDefault();
                      goSection(chunk.anchor);
                    }}
                  >
                    {chunk.heading}
                  </a>
                ))}
            </div>
          ))}
          <div className="help-toc-footer">
            {tx("Source version", "Версия источника")}
            <code>{HELP_VERSION.slice(0, 12)}</code>
          </div>
        </nav>
        <main
          ref={reader}
          className="help-reader"
          aria-label={tx("Operating manual content", "Содержание руководства")}
        >
          {(query || relevant) && (
            <div className="help-results" role="status">
              {visible.length} {tx("matching sections", "найденных разделов")}
              <button
                onClick={() => {
                  setQuery("");
                  setRelevant(false);
                }}
              >
                {tx("Show complete manual", "Показать полное руководство")}
              </button>
            </div>
          )}
          {!visible.length && (
            <div className="help-empty">
              <Search size={26} />
              <h2>{tx("No matching sections", "Разделы не найдены")}</h2>
              <p>
                {tx(
                  "Try a shorter task, a UI label in English or Russian, or a route such as /app/storage.",
                  "Попробуйте более короткий запрос, название на английском или русском или маршрут /app/storage."
                )}
              </p>
            </div>
          )}
          {visible.map(chunk => (
            <section
              key={chunk.id}
              id={chunk.id.includes("--part-") ? chunk.id : chunk.anchor}
              className={`help-section ${chunk.heading === "Field crew fast checklist" ? "help-checklist-panel" : ""}`}
            >
              {(query || relevant) && (
                <p className="help-breadcrumb">
                  {chunk.headingPath.join(" / ")}
                </p>
              )}
              {chunk.level === 2 && !chunk.id.includes("--part-") && (
                <div className="help-role-badge">
                  <ShieldCheck size={13} aria-hidden="true" />
                  {chunk.roles.includes(role)
                    ? tx("Relevant to your role", "Для вашей роли")
                    : tx(
                        "Reference for authorized staff",
                        "Справка для уполномоченных сотрудников"
                      )}
                </div>
              )}
              {renderChunk(chunk)}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
