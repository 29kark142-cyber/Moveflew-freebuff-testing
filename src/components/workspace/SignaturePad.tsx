import { Eraser } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { hasSignatureStroke } from '@/lib/signature-stroke';

type SignaturePadProps = {
  onChange: (png: string | null) => void;
  label?: string;
  disabled?: boolean;
};

export default function SignaturePad({
  onChange,
  label,
  disabled = false,
}: SignaturePadProps) {
  const { t } = useI18n();
  const visibleLabel = t(label || "Sign in the box");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokeDistance = useRef(0);
  const previousPoint = useRef<{ x: number; y: number } | null>(null);
  const signedRef = useRef(false);
  const [signed, setSigned] = useState(false);

  const blank = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#061d31";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.2;
  }, []);

  useEffect(() => {
    blank();
    const resize = () => {
      if (!signedRef.current) blank();
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [blank]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    drawing.current = true;
    strokeDistance.current = 0;
    previousPoint.current = p;
    context.beginPath();
    context.moveTo(p.x, p.y);
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const p = point(event);
    if (previousPoint.current) strokeDistance.current += Math.hypot(p.x - previousPoint.current.x, p.y - previousPoint.current.y);
    previousPoint.current = p;
    context.lineTo(p.x, p.y);
    context.stroke();
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!signedRef.current && !hasSignatureStroke(strokeDistance.current)) return;
    const data = canvasRef.current?.toDataURL("image/png") ?? null;
    signedRef.current = Boolean(data);
    setSigned(Boolean(data));
    onChange(data);
  };
  const clear = () => {
    blank();
    signedRef.current = false;
    setSigned(false);
    onChange(null);
  };

  return (
    <div className="ws-signature">
      <div className="ws-signature__top">
        <span>{visibleLabel}</span>
        {signed && (
          <button type="button" onClick={clear} disabled={disabled}>
            <Eraser size={14} /> {t("Clear")}
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="ws-signature__canvas"
        aria-label={visibleLabel}
        onPointerDown={begin}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
}
