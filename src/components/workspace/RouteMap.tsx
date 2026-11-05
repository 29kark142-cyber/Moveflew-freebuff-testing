import { useId, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { RoutePoint } from "@/lib/places";

type Props = {
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  /** Thumbnail is a static preview; full adds drag-to-pan and zoom. */
  variant?: "thumbnail" | "full";
  className?: string;
};

const VIEW = {
  thumbnail: { width: 340, height: 168, pad: 34 },
  full: { width: 780, height: 420, pad: 64 },
};

/** Web-Mercator unit projection; only the relative shape matters for an inset map. */
function mercator(point: RoutePoint) {
  const lat = Math.max(-85, Math.min(85, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (point.lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

function fitRoute(
  origin: RoutePoint,
  destination: RoutePoint,
  width: number,
  height: number,
  pad: number,
) {
  const a = mercator(origin);
  const b = mercator(destination);
  const spanX = Math.abs(b.x - a.x);
  const spanY = Math.abs(b.y - a.y);
  if (spanX < 1e-9 && spanY < 1e-9) {
    // Same point: park both pins in the middle instead of scaling to infinity.
    return { start: { x: width / 2, y: height / 2 }, end: { x: width / 2, y: height / 2 } };
  }
  const scale = Math.min(
    (width - pad * 2) / Math.max(spanX, 1e-9),
    (height - pad * 2) / Math.max(spanY, 1e-9),
  );
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const place = (point: { x: number; y: number }) => ({
    x: width / 2 + (point.x - centre.x) * scale,
    y: height / 2 + (point.y - centre.y) * scale,
  });
  return { start: place(a), end: place(b) };
}

export default function RouteMap({ origin, destination, variant = "thumbnail", className }: Props) {
  const gridId = useId();
  const view = VIEW[variant];
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const interactive = variant === "full";
  const hasRoute = Boolean(origin && destination);
  const fitted =
    hasRoute && origin && destination
      ? fitRoute(origin, destination, view.width, view.height, view.pad)
      : null;

  const line = (() => {
    if (!fitted) return "";
    const { start, end } = fitted;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.min(56, length * 0.16) * (dy > 0 ? 1 : -1);
    const control = {
      x: (start.x + end.x) / 2 - (dy / length) * bend,
      y: (start.y + end.y) / 2 + (dx / length) * bend,
    };
    return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  })();

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${view.width} ${view.height}`}
        role="img"
        aria-label={
          hasRoute
            ? "Route map: green pickup pin and red drop-off pin connected by the driving route"
            : "Route map waiting for pickup and drop-off coordinates"
        }
        className="block w-full rounded-lg"
        style={{
          background: "hsl(var(--muted))",
          cursor: interactive ? (drag.current ? "grabbing" : "grab") : "default",
          touchAction: interactive ? "none" : undefined,
        }}
        onPointerDown={(event) => {
          if (!interactive) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        }}
        onPointerMove={(event) => {
          if (!interactive || !drag.current) return;
          setPan({
            x: drag.current.panX + (event.clientX - drag.current.x),
            y: drag.current.panY + (event.clientY - drag.current.y),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={() => {
          if (interactive) setZoom((value) => Math.min(3, Math.round((value + 0.5) * 10) / 10));
        }}
      >
        <defs>
          <pattern id={gridId} width="38" height="38" patternUnits="userSpaceOnUse">
            <path
              d="M 38 0 L 0 0 0 38"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <g
          transform={`translate(${view.width / 2 + pan.x} ${view.height / 2 + pan.y}) scale(${zoom}) translate(${-view.width / 2} ${-view.height / 2})`}
        >
          <rect
            x={-view.width}
            y={-view.height}
            width={view.width * 3}
            height={view.height * 3}
            fill={`url(#${gridId})`}
            className="text-foreground"
          />

          {hasRoute && fitted && (
            <>
              <path
                d={line}
                fill="none"
                stroke="hsl(var(--background))"
                strokeWidth={9}
                strokeLinecap="round"
                opacity="0.9"
              />
              <path
                d={line}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="2 9"
              />
            </>
          )}

          {fitted && origin && (
            <g>
              <title>Pickup</title>
              <circle
                cx={fitted.start.x}
                cy={fitted.start.y}
                r={13}
                fill="hsl(var(--background))"
                opacity="0.9"
              />
              <circle cx={fitted.start.x} cy={fitted.start.y} r={9} fill="#16a34a" />
              <text
                x={fitted.start.x}
                y={fitted.start.y + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#ffffff"
              >
                A
              </text>
              <text
                x={fitted.start.x + 14}
                y={fitted.start.y - 9}
                fontSize="10"
                fill="currentColor"
                opacity="0.75"
              >
                Pickup
              </text>
            </g>
          )}

          {fitted && destination && (
            <g>
              <title>Drop-off</title>
              <circle
                cx={fitted.end.x}
                cy={fitted.end.y}
                r={13}
                fill="hsl(var(--background))"
                opacity="0.9"
              />
              <circle cx={fitted.end.x} cy={fitted.end.y} r={9} fill="#dc2626" />
              <text
                x={fitted.end.x}
                y={fitted.end.y + 3.5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#ffffff"
              >
                B
              </text>
              <text
                x={fitted.end.x + 14}
                y={fitted.end.y - 9}
                fontSize="10"
                fill="currentColor"
                opacity="0.75"
              >
                Drop-off
              </text>
            </g>
          )}
        </g>

        {!hasRoute && (
          <text
            x={view.width / 2}
            y={view.height / 2}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            opacity="0.6"
          >
            Route coordinates appear after the addresses are calculated
          </text>
        )}
      </svg>

      {interactive && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="ws-btn"
            onClick={() => setZoom((value) => Math.max(0.8, Math.round((value - 0.25) * 10) / 10))}
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="ws-btn"
            onClick={() => setZoom((value) => Math.min(3, Math.round((value + 0.25) * 10) / 10))}
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button type="button" className="ws-btn" onClick={reset}>
            <RotateCcw size={14} />
            Reset view
          </button>
          <span className="ws-helper">
            Drag to pan · double-click to zoom · coordinates only, no street tiles
          </span>
        </div>
      )}
    </div>
  );
}
