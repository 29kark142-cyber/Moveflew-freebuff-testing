import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  routeProviderLabel,
  routeProvider,
  searchAddresses,
  type AddressSuggestion,
} from "@/lib/places";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  inputClassName?: string;
  hint?: string;
};

/**
 * Address field with live suggestions. Google Places is used when the browser key is
 * configured, otherwise OpenStreetMap, so the field always offers addresses.
 */
export default function AddressAutocomplete({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  inputClassName,
  hint,
}: Props) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const skipNextSearch = useRef(false);
  const provider = routeProvider();

  useEffect(() => {
    if (disabled) return;
    const query = value.trim();
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (query.length < 3) {
      setItems([]);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchAddresses(query, controller.signal)
        .then((suggestions) => {
          setItems(suggestions);
          setActive(suggestions.length ? 0 : -1);
          setOpen(suggestions.length > 0);
          setError(
            suggestions.length ? "" : "No matching addresses. Keep typing or enter it manually.",
          );
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setItems([]);
          setError(reason instanceof Error ? reason.message : "Address lookup is unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, value]);

  const choose = (suggestion: AddressSuggestion) => {
    skipNextSearch.current = true;
    onChange(suggestion.label);
    setItems([]);
    setOpen(false);
    setActive(-1);
    setError("");
  };

  return (
    <div className="ws-address-field" style={{ position: "relative" }}>
      <label className="block text-sm font-medium text-foreground">
        {label}
        <input
          className={inputClassName}
          value={value}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete="street-address"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(false);
          }}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!items.length) return;
              setOpen(true);
              setActive((current) => (current + 1) % items.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (!items.length) return;
              setOpen(true);
              setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
            } else if (event.key === "Enter" && open && active >= 0) {
              event.preventDefault();
              const suggestion = items[active];
              if (suggestion) choose(suggestion);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-background p-1 shadow-lg"
        >
          {items.map((suggestion, index) => (
            <li
              key={suggestion.label}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${
                index === active ? "bg-muted text-foreground" : "text-foreground"
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}

      <p className="ws-helper mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Searching addresses…
          </>
        ) : (
          <>
            {hint ?? `Suggestions from ${routeProviderLabel(provider)}`}
            {provider === "openstreetmap" && " · add a Google Maps key for live Places results"}
          </>
        )}
      </p>
      {error && !open && (
        <p className="mt-1 text-xs text-muted-foreground" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
