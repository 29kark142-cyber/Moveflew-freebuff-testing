import { createContext, useContext, useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { crmFetch } from "@/lib/crm";
import { appearanceKey, DEFAULT_APPEARANCE, parseAppearance, type WorkspaceAppearance } from "@/lib/workspace-appearance";
import { supabase } from "@/integrations/supabase/client";
import { WALLPAPER_REFRESH_MS } from "@/lib/signed-url";
import "@/workspace-appearance.css";

type AppearanceResponse = { appearance: WorkspaceAppearance; wallpaperUrl: string | null };
const Context = createContext<{ value: WorkspaceAppearance; saved: WorkspaceAppearance; setValue: (v: WorkspaceAppearance) => void; save: () => Promise<void>; wallpaperError: string; localError: string; ready: boolean } | null>(null);
export function useWorkspaceAppearance() { const value = useContext(Context); if (!value) throw new Error("Appearance context is missing"); return value; }
/** Non-throwing variant for widgets that may render with or without a workspace theme scope. */
export function useWorkspaceAppearanceSafe() { return useContext(Context); }
export default function AppearanceProvider({ userId, workspaceId, initial, children }: { userId: string; workspaceId: number; initial?: unknown; children: ReactNode }) {
  const [value, update] = useState(() => parseAppearance(initial));
  const [saved, setSaved] = useState(() => parseAppearance(initial));
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [wallpaperError, setWallpaperError] = useState("");
  const [localError, setLocalError] = useState("");
  const [ready, setReady] = useState(false);
  const key = appearanceKey(userId, workspaceId);
  useEffect(() => {
    let active = true;
    try { const raw = localStorage.getItem(key); if (raw) update(parseAppearance(JSON.parse(raw))); } catch { setLocalError("Local preferences are unavailable in this browser."); }
    crmFetch<AppearanceResponse>("/appearance").then(result => { if (active) { update(result.appearance); setSaved(result.appearance); setReady(true); } }).catch(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key]);
  useEffect(() => { if (!ready) return; try { localStorage.setItem(key, JSON.stringify(value)); } catch { setLocalError("Local preferences could not be saved. Workspace sync is still available."); } }, [key, ready, value]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    let objectUrl: string | null = null;
    setWallpaperUrl(null); setWallpaperError("");
    const wallpaper = value.wallpaper;
    const resolve = async () => {
      if (!wallpaper) return;
      let url: string | null = wallpaper.kind === "url" ? wallpaper.value : null;
      if (wallpaper.kind === "storage") { const { data, error } = await supabase.storage.from("workspace-wallpapers").download(wallpaper.value); if (error || !data) { if (active) { setWallpaperUrl(null); setWallpaperError("Wallpaper could not be loaded. Upload it again or choose another image."); } return; } if (!active) return; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = URL.createObjectURL(data); url = objectUrl; }
      if (!url || !active) return;
      const image = new Image(); image.referrerPolicy = "no-referrer";
      image.onload = () => { if (active) { setWallpaperUrl(url); setWallpaperError(""); } };
      image.onerror = () => { if (active) { setWallpaperUrl(null); setWallpaperError("The image link could not be loaded. Use a direct HTTPS image URL."); } };
      image.src = url;
    };
    void resolve(); if (wallpaper?.kind === "storage") timer = setInterval(() => void resolve(), WALLPAPER_REFRESH_MS);
    return () => { active = false; if (timer) clearInterval(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [value.wallpaper]);
  async function save() { const result = await crmFetch<AppearanceResponse>("/appearance", { method: "PUT", body: JSON.stringify(value) }); setSaved(result.appearance); }
  const style = { "--workspace-wallpaper": wallpaperUrl ? `url(${JSON.stringify(wallpaperUrl)})` : "none" } as CSSProperties;
  return <Context.Provider value={{ value, saved, setValue: update, save, wallpaperError, localError, ready }}><div className="ws-appearance-root" data-preset={value.preset} data-accent={value.accent} data-wallpaper={wallpaperUrl ? "true" : "false"} style={style}>{children}</div></Context.Provider>;
}