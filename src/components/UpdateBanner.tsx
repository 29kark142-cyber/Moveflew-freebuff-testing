import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import {
  clearAppSettings,
  isChunkLoadError,
  onStaleClient,
  reportStaleClient,
  runReleaseCleanup,
} from "@/lib/app-version";

export function UpdateBanner() {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      runReleaseCleanup(window.localStorage);
    } catch {
      /* storage blocked */
    }
    const offStale = onStaleClient(() => setVisible(true));
    const onPreload = (e: Event) => {
      e.preventDefault();
      reportStaleClient("preload");
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkLoadError(e.reason)) reportStaleClient("chunk");
    };
    const onError = (e: ErrorEvent) => {
      if (isChunkLoadError(e.error ?? e.message)) reportStaleClient("chunk");
    };
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      offStale();
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!visible) return null;

  const refresh = () => {
    try {
      clearAppSettings(window.localStorage);
    } catch {
      /* storage blocked */
    }
    queryClient.clear();
    window.location.reload();
  };

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-lg"
    >
      <span className="flex-1">A new version of MoveFlew is available.</span>
      <button
        type="button"
        onClick={refresh}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
      >
        <RefreshCw className="h-4 w-4" aria-hidden /> Refresh App
      </button>
    </div>
  );
}
