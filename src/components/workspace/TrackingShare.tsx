import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crmFetch } from "@/lib/crm";

type TrackingLink = { token: string; url: string; reference: string };

export default function TrackingShare({
  jobId,
  initialToken,
}: {
  jobId: number;
  initialToken?: string;
}) {
  const [token, setToken] = useState(initialToken ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const url = token ? `${origin}/move/${token}` : "";

  const createLink = async () => {
    setBusy(true);
    try {
      const link = await crmFetch<TrackingLink>(`/field/jobs/${jobId}/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setToken(link.token);
      toast.success("Customer tracking link ready");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not create a tracking link");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Tracking link copied");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Copy is blocked in this browser — select the link and copy it manually.");
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-card-foreground">
          <Link2 className="h-4 w-4" /> Customer live tracking
        </h2>
        <p className="text-sm text-muted-foreground">
          Share a private link so the customer can follow the stage, truck map and ETA. The link
          works without a login.
        </p>
      </div>

      {token ? (
        <div className="space-y-2">
          <p className="break-all rounded-xl border border-border bg-background p-3 text-xs text-foreground">
            {url}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => void copy()} className="min-h-12">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="outline" asChild className="min-h-12">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" /> Preview
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <Button className="min-h-12 w-full" disabled={busy} onClick={() => void createLink()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          {busy ? "Creating link…" : "Create customer tracking link"}
        </Button>
      )}
    </section>
  );
}
