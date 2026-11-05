import { useEffect, useRef, useState } from "react";
import { Locate, Minus, Plus } from "lucide-react";

// Schematic route map. There is no telematics feed in this product, so the truck
// marker is an explicitly labelled simulation derived from the job stage; the map
// is still fully interactive (drag to pan, wheel or buttons to zoom).
const ROUTE = "M 52 190 C 118 190 132 78 208 96 C 268 110 306 74 368 58";
const PICKUP = { x: 52, y: 190 };
const DELIVERY = { x: 368, y: 58 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Props = {
  /** 0–1 fraction of the route covered by the simulated truck position. */
  progress: number;
  originLabel: string;
  destinationLabel: string;
};

export default function RouteMap({ progress, originLabel, destinationLabel }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [truck, setTruck] = useState(PICKUP);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    try {
      const clamped = Math.min(1, Math.max(0, progress));
      const point = path.getPointAtLength(path.getTotalLength() * clamped);
      setTruck({ x: point.x, y: point.y });
    } catch {
      /* path not measurable yet; keep the previous marker */
    }
  }, [progress]);

  // Registered natively so wheel zoom can preventDefault without a passive-listener warning.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) =>
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - Math.sign(event.deltaY) * 0.2)),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const startDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const origin = drag.current;
    if (!origin) return;
    setPan({
      x: origin.panX + (event.clientX - origin.x) / zoom,
      y: origin.panY + (event.clientY - origin.y) / zoom,
    });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const recenter = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const step = zoom * 100;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
      <svg
        ref={svgRef}
        viewBox="0 0 420 240"
        className="h-64 w-full touch-none select-none sm:h-80"
        role="img"
        aria-label={`Simulated truck position on the route from ${originLabel} to ${destinationLabel}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <pattern id="mf-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
          <linearGradient id="mf-route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>

        <rect width="420" height="240" fill="url(#mf-grid)" />

        <g
          transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}
          style={{ transformOrigin: "210px 120px" }}
        >
          <path d={ROUTE} fill="none" stroke="#cbd5e1" strokeWidth="10" strokeLinecap="round" />
          <path
            ref={pathRef}
            d={ROUTE}
            fill="none"
            stroke="url(#mf-route)"
            strokeWidth="5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.min(100, Math.max(0, progress) * 100)} 100`}
          />

          <g>
            <circle
              cx={PICKUP.x}
              cy={PICKUP.y}
              r="9"
              fill="#ffffff"
              stroke="#2563eb"
              strokeWidth="3"
            />
            <text x={PICKUP.x} y={PICKUP.y + 26} textAnchor="middle" fontSize="10" fill="#475569">
              Pickup
            </text>
          </g>

          <g>
            <rect
              x={DELIVERY.x - 8}
              y={DELIVERY.y - 8}
              width="16"
              height="16"
              rx="4"
              fill="#0f172a"
            />
            <text
              x={DELIVERY.x}
              y={DELIVERY.y - 16}
              textAnchor="middle"
              fontSize="10"
              fill="#475569"
            >
              Delivery
            </text>
          </g>

          <g transform={`translate(${truck.x - 14} ${truck.y - 10})`}>
            <circle cx="14" cy="10" r="20" fill="#2563eb" opacity="0.12" />
            <rect x="2" y="1" width="20" height="13" rx="3" fill="#1d4ed8" />
            <rect x="20" y="4" width="8" height="10" rx="2" fill="#3b82f6" />
            <circle cx="8" cy="16" r="3" fill="#0f172a" />
            <circle cx="24" cy="16" r="3" fill="#0f172a" />
          </g>
        </g>
      </svg>

      {/* Kept top-left so the controls never sit on the delivery end of the route. */}
      <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 0.25))}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          aria-label="Zoom in"
          disabled={zoom >= MAX_ZOOM}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 0.25))}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          aria-label="Zoom out"
          disabled={zoom <= MIN_ZOOM}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={recenter}
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          aria-label="Recenter map"
        >
          <Locate className="h-4 w-4" />
        </button>
      </div>

      <p className="absolute bottom-2 left-3 right-3 text-[11px] font-medium text-slate-500">
        Simulated truck position · {Math.round(step)}% zoom · drag to pan
      </p>
    </div>
  );
}
