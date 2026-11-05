import { useRef, useState } from "react";
import {
  ImagePlus,
  Link as LinkIcon,
  LoaderCircle,
  Palette,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { crmFetch } from "@/lib/crm";
import { ErrorNotice, LoadingBlock, useRemote } from "@/components/workspace/WorkspaceUI";
import {
  brandImageSchema,
  brandingSchema,
  DEFAULT_BRANDING,
  normalizeDomain,
  type BrandImage,
  type WorkspaceBranding,
} from "@shared/branding";

type BrandingResponse = {
  branding: WorkspaceBranding;
  whiteLabel: boolean;
  planId: string;
  canEdit: boolean;
};

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** White-label logo, colors, wallpaper and custom domain for public proposals. */
export default function BrandingSettings({
  role,
  workspaceId,
  writable,
}: {
  role: string;
  workspaceId: number;
  writable: boolean;
}) {
  const { data, loading, error, refresh } = useRemote(
    () => crmFetch<BrandingResponse>("/branding"),
    [],
  );
  const [form, setForm] = useState<WorkspaceBranding | null>(null);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoLink, setLogoLink] = useState("");
  const [backgroundLink, setBackgroundLink] = useState("");
  const [domain, setDomain] = useState("");
  const logoFile = useRef<HTMLInputElement>(null);
  const backgroundFile = useRef<HTMLInputElement>(null);

  if (loading) return <LoadingBlock label="Loading branding…" />;
  if (error || !data) return <ErrorNotice error={error} retry={() => void refresh()} />;

  const value = form ?? data.branding;
  const canEdit = data.canEdit && writable && ["admin", "office_admin"].includes(role);
  const patch = (change: Partial<WorkspaceBranding>) =>
    setForm((current) => ({ ...(current ?? data.branding), ...change }));

  async function upload(file: File | undefined, target: "logo" | "background") {
    if (!file) return;
    setFailure("");
    setMessage("");
    const extension = IMAGE_TYPES[file.type];
    if (!extension) return setFailure("Choose a JPG, PNG or WebP image.");
    if (file.size > 5 * 1024 * 1024) return setFailure("Choose an image smaller than 5 MB.");
    setBusy(true);
    try {
      const path = `${workspaceId}/brand-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("workspace-wallpapers")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      patch({ [target]: { kind: "storage", value: path } } as Partial<WorkspaceBranding>);
      setMessage("Image uploaded. Save branding to publish it to customer proposals.");
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not upload the image.");
    } finally {
      setBusy(false);
    }
  }

  function applyLink(target: "logo" | "background", link: string) {
    const parsed = brandImageSchema.safeParse({ kind: "url", value: link.trim() });
    if (!parsed.success) return setFailure("Enter a direct HTTPS image URL.");
    setFailure("");
    patch({ [target]: parsed.data } as Partial<WorkspaceBranding>);
  }

  async function saveAll() {
    setBusy(true);
    setFailure("");
    setMessage("");
    const parsed = brandingSchema.safeParse(value);
    if (!parsed.success) {
      setBusy(false);
      return setFailure(parsed.error.issues[0]?.message ?? "Check the branding fields.");
    }
    try {
      await crmFetch("/branding", { method: "PUT", body: JSON.stringify(parsed.data) });
      setForm(null);
      setMessage("White-label branding saved. New and existing proposal links now use it.");
      await refresh();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Could not save branding.");
    } finally {
      setBusy(false);
    }
  }

  function saveDomain() {
    const normalized = normalizeDomain(domain);
    if (normalized === null) return setFailure("Enter a domain like quotes.yourcompany.com.");
    patch({ customDomain: normalized });
    setDomain("");
  }

  return (
    <section className="ws-settings-section ws-card ws-card-pad">
      <div className="ws-card-title">
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Palette size={18} /> White-label branding
          </h2>
          <p>Applied to customer proposal pages and signed documents.</p>
        </div>
        <Button
          className="ws-btn primary"
          disabled={!canEdit || busy}
          onClick={() => void saveAll()}
        >
          {busy ? <LoaderCircle size={15} className="ws-spin" /> : <Save size={15} />} Save branding
        </Button>
      </div>

      {!data.whiteLabel && (
        <p className="ws-alert">
          White-labeling is included with Pro / Scale and Enterprise. This workspace is currently on{" "}
          <strong>{data.planId}</strong>; customer pages keep the MoveFlew badge until you upgrade.
        </p>
      )}
      {!canEdit && data.whiteLabel && (
        <p className="ws-helper">
          Only an Admin or Office Admin in a writable workspace can change branding.
        </p>
      )}

      <div className="ws-form-grid" style={{ marginTop: 12 }}>
        <label className="ws-field">
          <span>Company display name</span>
          <input
            className="ws-input"
            value={value.displayName}
            maxLength={120}
            placeholder="John's Moving Co."
            onChange={(event) => patch({ displayName: event.target.value })}
          />
        </label>
        <label className="ws-field">
          <span>Brand color</span>
          <div className="ws-inline">
            <input
              type="color"
              value={value.brandColor}
              style={{ width: 48, height: 40 }}
              onChange={(event) => patch({ brandColor: event.target.value })}
            />
            <input
              className="ws-input"
              value={value.brandColor}
              maxLength={7}
              onChange={(event) => patch({ brandColor: event.target.value })}
            />
          </div>
        </label>
      </div>

      <div className="ws-form-grid" style={{ marginTop: 14 }}>
        <fieldset className="ws-field" disabled={!canEdit || busy}>
          <legend>Logo</legend>
          <div className="ws-inline">
            <input
              ref={logoFile}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void upload(event.target.files?.[0], "logo")}
            />
            <Button className="ws-btn" onClick={() => logoFile.current?.click()}>
              <Upload size={14} /> Upload logo
            </Button>
            {value.logo && (
              <Button className="ws-btn" onClick={() => patch({ logo: null })}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
          </div>
          <div className="ws-inline">
            <input
              className="ws-input"
              placeholder="https://…/logo.png"
              value={logoLink}
              onChange={(event) => setLogoLink(event.target.value)}
            />
            <Button className="ws-btn" onClick={() => applyLink("logo", logoLink)}>
              <LinkIcon size={14} /> Use URL
            </Button>
          </div>
        </fieldset>

        <fieldset className="ws-field" disabled={!canEdit || busy}>
          <legend>Proposal background</legend>
          <div className="ws-inline">
            <input
              ref={backgroundFile}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void upload(event.target.files?.[0], "background")}
            />
            <Button className="ws-btn" onClick={() => backgroundFile.current?.click()}>
              <ImagePlus size={14} /> Upload wallpaper
            </Button>
            {value.background && (
              <Button className="ws-btn" onClick={() => patch({ background: null })}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
          </div>
          <div className="ws-inline">
            <input
              className="ws-input"
              placeholder="https://…/background.jpg"
              value={backgroundLink}
              onChange={(event) => setBackgroundLink(event.target.value)}
            />
            <Button className="ws-btn" onClick={() => applyLink("background", backgroundLink)}>
              <LinkIcon size={14} /> Use URL
            </Button>
          </div>
        </fieldset>
      </div>

      <div className="ws-form-grid" style={{ marginTop: 14 }}>
        <label className="ws-field">
          <span>Custom domain</span>
          <div className="ws-inline">
            <input
              className="ws-input"
              value={domain || value.customDomain}
              placeholder="quotes.johnsmoving.com"
              onChange={(event) => setDomain(event.target.value)}
            />
            <Button className="ws-btn" onClick={saveDomain}>
              Set domain
            </Button>
          </div>
          <small className="ws-helper">
            Point a CNAME for this hostname at your MoveFlew site, then save. DNS verification is
            handled by your onboarding contact — this screen stores the hostname only.
          </small>
        </label>
        <div className="ws-field">
          <span>Proposal preview</span>
          <div
            style={{
              borderRadius: 14,
              padding: 16,
              border: "1px solid var(--border)",
              background:
                value.background?.kind === "url"
                  ? `linear-gradient(rgba(255,255,255,.86), rgba(255,255,255,.86)), url("${value.background.value}") center/cover`
                  : "var(--card)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {value.logo?.kind === "url" ? (
                <img
                  src={value.logo.value}
                  alt=""
                  style={{ maxHeight: 40, maxWidth: 140, objectFit: "contain" }}
                />
              ) : (
                <b>{value.displayName || "Your company"}</b>
              )}
            </div>
            <div
              style={{
                marginTop: 10,
                height: 6,
                width: 120,
                borderRadius: 999,
                background: value.brandColor,
              }}
            />
            <p style={{ fontSize: 12, marginTop: 8, color: "var(--muted-foreground)" }}>
              {data.whiteLabel
                ? "MoveFlew branding hidden on customer pages."
                : "Powered by MoveFlew badge stays visible."}
            </p>
          </div>
        </div>
      </div>

      {(failure || message) && (
        <p className={failure ? "ws-error" : "ws-alert"} role="status" style={{ marginTop: 12 }}>
          {failure || message}
        </p>
      )}
      <p className="ws-helper" style={{ marginTop: 10 }}>
        Default brand color {DEFAULT_BRANDING.brandColor}. Uploaded images are private to this
        workspace.
      </p>
    </section>
  );
}
