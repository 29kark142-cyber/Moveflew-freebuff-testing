import { useEffect, useState } from "react";
import { CircleAlert, MapPin, Phone } from "lucide-react";
import Brand from "@/components/Brand";
import { formatDate, LoadingBlock } from "@/components/workspace/WorkspaceUI";
import { readQuote, type PublicQuote } from "@/lib/quote.functions";
import { money } from "@shared/crm";
import "@/workspace.css";

const hourLabel = (value = 8) => {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
};

/** Read-only customer quote page behind an opaque /quote/:token link. */
export default function QuotePage({ token }: { token?: string }) {
  const [quote, setQuote] = useState<PublicQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        setQuote(await readQuote({ data: { token: token ?? "" } }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "This quote could not be found.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  if (loading)
    return (
      <div className="ws-proposal-page">
        <div className="ws-proposal">
          <LoadingBlock label="Loading your quote…" />
        </div>
      </div>
    );

  if (error || !quote)
    return (
      <div className="ws-proposal-page">
        <div className="ws-public-error">
          <CircleAlert size={26} />
          <h1>Quote unavailable</h1>
          <p>{error || "This quote link is unavailable or has expired."}</p>
        </div>
      </div>
    );

  const phone = quote.company.phone.replace(/[^\d+]/g, "");

  return (
    <div className="ws-proposal-page">
      <main className="ws-proposal">
        <header className="ws-proposal__head">
          <Brand />
          <span className="ws-chip">{quote.reference}</span>
        </header>

        <h1>Your moving quote</h1>
        <p className="ws-helper">
          Prepared for {quote.customerName || "you"} by {quote.company.name || "your mover"}
          {quote.sentAt ? ` · sent ${new Date(quote.sentAt).toLocaleDateString()}` : ""}
        </p>

        <section className="ws-quote-lines" style={{ marginTop: 20 }}>
          <div>
            <span>Move date</span>
            <strong>
              {quote.moveDate ? formatDate(quote.moveDate) : "To be confirmed"} ·{" "}
              {hourLabel(quote.startHour)}
            </strong>
          </div>
          <div>
            <span>Crew</span>
            <strong>
              {quote.crewSize} mover{quote.crewSize === 1 ? "" : "s"}
            </strong>
          </div>
          {quote.distanceMiles > 0 && (
            <div>
              <span>Route distance</span>
              <strong>
                {quote.distanceMiles} mi
                {quote.travelMinutes ? ` · ${quote.travelMinutes} min` : ""}
              </strong>
            </div>
          )}
          {quote.lines.map((line) => (
            <div key={line.label}>
              <span>{line.label}</span>
              <strong>{money(line.amount)}</strong>
            </div>
          ))}
        </section>

        <div className="ws-quote-total">
          <span>
            <small>Estimated total</small>
            <br />
            Final charges are confirmed on the signed bill of lading.
          </span>
          <b>{money(quote.total)}</b>
        </div>

        {(quote.origin || quote.destination) && (
          <p className="ws-helper" style={{ marginTop: 16 }}>
            <MapPin size={14} /> {quote.origin || "Pickup to be confirmed"} →{" "}
            {quote.destination || "Drop-off to be confirmed"}
          </p>
        )}

        <div className="ws-actions" style={{ marginTop: 20 }}>
          {phone && (
            <a className="ws-btn primary" href={`tel:${phone}`}>
              <Phone size={15} /> Call to book
            </a>
          )}
          {quote.company.email && (
            <a
              className="ws-btn"
              href={`mailto:${quote.company.email}?subject=${encodeURIComponent(`Quote ${quote.reference}`)}`}
            >
              Email us
            </a>
          )}
          <button type="button" className="ws-btn" onClick={() => window.print()}>
            Print quote
          </button>
        </div>
        <p className="ws-helper" style={{ marginTop: 12 }}>
          This link is personal to your move. Prices are an estimate based on the details you
          provided and may change if the inventory, access or move date changes.
        </p>
      </main>
    </div>
  );
}
