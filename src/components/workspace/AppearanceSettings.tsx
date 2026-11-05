import { useRef, useState } from "react";
import { Check, ImagePlus, Link as LinkIcon, LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ACCENTS, PRESETS, canSaveAppearance, wallpaperSchema } from "@/lib/workspace-appearance";
import { useWorkspaceAppearance } from "./AppearanceProvider";

export default function AppearanceSettings({ role, workspaceId, writable }: { role: string; workspaceId: number; writable: boolean }) {
  const { value, saved, setValue, save, wallpaperError, localError, ready } = useWorkspaceAppearance();
  const [link, setLink] = useState(value.wallpaper?.kind === "url" ? value.wallpaper.value : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const allowed = canSaveAppearance(role, writable);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  async function upload(image?: File) {
    if (!image) return;
    setMessage(""); setError("");
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[image.type];
    if (!extension) return setError("Choose a JPG, PNG or WebP image.");
    if (image.size > 5 * 1024 * 1024) return setError("Choose an image smaller than 5 MB.");
    setBusy(true);
    try { const path = `${workspaceId}/${crypto.randomUUID()}.${extension}`; const { error: uploadError } = await supabase.storage.from("workspace-wallpapers").upload(path, image, { contentType: image.type, upsert: false }); if (uploadError) throw uploadError; setValue({ ...value, wallpaper: { kind: "storage", value: path } }); setMessage("Wallpaper uploaded. Save appearance to share it with your workspace."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload wallpaper."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  async function saveAll() { setBusy(true); setError(""); setMessage(""); try { await save(); setMessage("Appearance saved to this workspace."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save appearance."); } finally { setBusy(false); } }
  function applyLink() { const result = wallpaperSchema.safeParse({ kind: "url", value: link.trim() }); if (!result.success) return setError("Enter a direct HTTPS image URL."); setError(""); setValue({ ...value, wallpaper: result.data }); }
  return <section className="ws-appearance-settings">
    <div className="ws-appearance-heading"><div><h2>Workspace appearance</h2><p>{dirty ? "Unsaved changes" : "Workspace preferences"}</p></div><Button disabled={!allowed || !ready || busy || !dirty} onClick={() => void saveAll()}>{busy ? <LoaderCircle className="ws-spin" /> : <Save />} Save appearance</Button></div>
    {!allowed && <p className="ws-alert">Workspace appearance can only be saved by an Admin or Office Admin in a writable workspace.</p>}
    <fieldset disabled={busy || !ready}><legend>Theme presets</legend><div className="ws-preset-gallery">{PRESETS.map(preset => <Button variant="outline" key={preset.id} className="ws-preset-option" aria-pressed={value.preset === preset.id} onClick={() => setValue({ ...value, preset: preset.id })}><span className="ws-preset-thumbnail" data-preview-preset={preset.id}><span className="ws-preset-side"><i /><i /><i /><i /></span><span className="ws-preset-content"><span className="ws-preset-top" /><span className="ws-preset-metrics"><i /><i /><i /></span><span className="ws-preset-table"><i /><i /><i /></span></span></span><span className="ws-preset-label">{preset.name}{value.preset === preset.id && <Check size={15} />}</span></Button>)}</div></fieldset>
    <fieldset disabled={busy || !ready}><legend>Accent color</legend><div className="ws-accent-palette">{ACCENTS.map(accent => <Button variant="ghost" className="ws-accent-option" key={accent.id} aria-label={`${accent.name} accent`} aria-pressed={value.accent === accent.id} title={accent.name} onClick={() => setValue({ ...value, accent: accent.id })}><span data-swatch={accent.id}>{value.accent === accent.id && <Check size={16} />}</span><small>{accent.name}</small></Button>)}</div></fieldset>
    <fieldset disabled={busy || !ready}><legend>Workspace wallpaper</legend><div className="ws-wallpaper-options"><div className="ws-wallpaper-upload"><ImagePlus size={28} /><div><strong>{value.wallpaper?.kind === "storage" ? "Custom wallpaper uploaded" : "Custom background image"}</strong><small>JPG, PNG or WebP · up to 5 MB</small></div><input ref={file} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files?.[0])} /><Button variant="outline" disabled={!allowed} onClick={() => file.current?.click()}><Upload /> Upload image</Button></div><div className="ws-wallpaper-link"><label htmlFor="workspace-wallpaper-url">Image URL</label><div><input className="ws-input" id="workspace-wallpaper-url" type="url" placeholder="https://example.com/workspace.jpg" value={link} onChange={event => setLink(event.target.value)} /><Button variant="outline" onClick={applyLink}><LinkIcon /> Apply link</Button></div></div>{value.wallpaper && <Button variant="ghost" className="ws-wallpaper-remove" onClick={() => { setValue({ ...value, wallpaper: null }); setLink(""); }}><Trash2 /> Remove wallpaper</Button>}</div></fieldset>
    {(error || wallpaperError || localError) && <p className="ws-error" role="alert">{error || wallpaperError || localError}</p>}{message && <p className="ws-appearance-notice" role="status">{message}</p>}
  </section>;
}