import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Keyboard, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  manualLabel?: string;
  manualPlaceholder?: string;
  onClose: () => void;
  onResult: (value: string) => void;
};

/**
 * Camera barcode/QR reader for tag lookup. The decoder is imported on demand so the
 * workspace bundle stays small, and every stream is stopped when the modal closes,
 * the tab is hidden or a code is read (a phone camera must never stay live).
 */
export default function CameraScanner({
  open,
  title,
  hint,
  manualLabel = "Enter the tag manually",
  manualPlaceholder = "e.g. A-101",
  onClose,
  onResult,
}: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop: () => void } | null>(null);
  const session = useRef(0);
  // Held in a ref so a re-rendered parent callback never restarts a live camera.
  const handler = useRef(onResult);
  useEffect(() => {
    handler.current = onResult;
  }, [onResult]);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    session.current += 1;
    try {
      controls.current?.stop();
    } catch {
      /* control already released */
    }
    controls.current = null;
    const stream = video.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setBusy(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setMessage("");
    setBusy(true);
    const current = session.current;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("unsupported");
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== session.current) return;
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "environment" },
      });
      if (current !== session.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (video.current) video.current.srcObject = stream;
      const readerControls = await reader.decodeFromStream(
        stream,
        video.current || undefined,
        (result) => {
          if (result && current === session.current) {
            const value = result.getText();
            stop();
            handler.current(value);
          }
        },
      );
      if (current !== session.current) readerControls.stop();
      else {
        controls.current = readerControls;
        setActive(true);
      }
    } catch {
      if (current === session.current) {
        stop();
        setMessage("Camera unavailable. Allow camera access, or type the tag below.");
      }
    } finally {
      if (current === session.current) setBusy(false);
    }
  }, [stop]);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    void start();
    return () => stop();
  }, [open, start, stop]);

  // Phones often background a tab while the camera is live; release it immediately.
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [stop]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-background p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close scanner"
            onClick={() => {
              stop();
              onClose();
            }}
          >
            <X size={16} />
          </Button>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-slate-900">
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            aria-label="Camera preview"
            className="aspect-[4/3] w-full object-cover"
          />
          {!active && (
            <div className="absolute inset-0 grid place-items-center gap-2 p-4 text-center text-slate-300">
              <span className="flex flex-col items-center gap-2">
                <Camera size={34} />
                <span className="text-sm">
                  {busy ? "Starting camera…" : "Point the camera at a vault tag"}
                </span>
              </span>
            </div>
          )}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/70"
          />
        </div>

        {message && (
          <p className="rounded-lg bg-muted p-2 text-xs text-foreground" role="status">
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void start()}>
            <Camera size={15} /> {active ? "Restart camera" : "Start camera"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              stop();
              setMessage("Camera stopped. You can still type the tag below.");
            }}
          >
            <Square size={15} /> Stop camera
          </Button>
        </div>

        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = manual.trim();
            if (!value) return;
            setManual("");
            stop();
            onResult(value);
          }}
        >
          <label className="block text-sm font-medium text-foreground">
            <Keyboard className="mr-1 inline h-4 w-4" /> {manualLabel}
            <input
              className="ws-input mt-1 w-full"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder={manualPlaceholder}
              maxLength={120}
            />
          </label>
          <Button type="submit" className="w-full" disabled={!manual.trim()}>
            Use this tag
          </Button>
        </form>
      </div>
    </div>
  );
}
