import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { ArrowRight, Bot, Send, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWorkspaceId, sessionAuthorization } from "@/lib/crm";
import { useWorkspaceAppearanceSafe } from "@/components/workspace/AppearanceProvider";
import { COPILOT_PATHS, COPILOT_ROUTES } from "@/lib/copilot-routes";

type Msg = { role: "user" | "assistant"; content: string };
const STARTERS = [
  "How do I invite a new driver?",
  "Where do I set up travel tariffs?",
  "Take me to the Dispatch Calendar",
  "How do I create a new estimate?",
];
const LINK = /\[\[go:(\/app[^|\]]*)\|([^\]]+)\]\]/g;

function Reply({ text, navigate }: { text: string; navigate: (p: string) => void }) {
  const links: { path: string; label: string }[] = [];
  const clean = text.replace(LINK, (_, path: string, label: string) => {
    if (COPILOT_PATHS.has(path) && !links.some(l => l.path === path)) links.push({ path, label });
    return "";
  }).replace(/\[\[go:[^\]]*$/, "");
  return (
    <div className="space-y-2">
      <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&_ol]:pl-5 [&_ul]:pl-5"><ReactMarkdown>{clean}</ReactMarkdown></div>
      {links.map(l => (
        <Button key={l.path} size="sm" variant="secondary" onClick={() => navigate(l.path)}>
          Go to {l.label} <ArrowRight size={14} />
        </Button>
      ))}
    </div>
  );
}

export default function CopilotAssistant({ path, navigate }: { path: string; navigate: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const appearance = useWorkspaceAppearanceSafe();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages]);
  useEffect(() => { if (open && !busy) field.current?.focus(); }, [open, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const update = (content: string) => setMessages(m => [...m.slice(0, -1), { role: "assistant", content }]);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await sessionAuthorization()) },
        body: JSON.stringify({ workspaceId: Number(getWorkspaceId()) || 0, currentPath: path, messages: history.slice(-20) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "The assistant is unavailable right now.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update(acc);
      }
      if (!acc) update("Sorry, I didn't get a reply. Please try again.");
    } catch (e) {
      update(`_${e instanceof Error ? e.message : "Something went wrong."}_`);
    } finally {
      setBusy(false);
    }
  }

  const go = (p: string) => { navigate(p); if (window.innerWidth < 640) setOpen(false); };

  // Portaled to <body>: an ancestor with backdrop-filter/transform (the glass shell
  // behind a workspace wallpaper) would otherwise become the containing block and let
  // the widget scroll away with the page instead of staying pinned to the viewport.
  if (!mounted) return null;

  return createPortal(
    <div
      className="ws-appearance-root ws-copilot-portal"
      data-preset={appearance?.value.preset}
      data-accent={appearance?.value.accent}
    >
      <button
        type="button"
        title="Need help? Ask AI"
        aria-label="Need help? Ask AI"
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] right-[calc(1.5rem_+_env(safe-area-inset-right))] z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-primary/20 transition hover:scale-105 hover:shadow-primary/60"
      >
        {open ? <X size={22} /> : <Bot size={24} />}
      </button>

      <div
        role="dialog"
        aria-label="CrewAI Assistant"
        className={`fixed z-[100] flex flex-col overflow-hidden border border-border bg-background text-foreground shadow-2xl transition-all duration-200
          inset-x-0 bottom-0 h-[85vh] rounded-t-2xl sm:inset-x-auto sm:h-[600px] sm:max-h-[calc(100vh-8rem)] sm:w-[400px] sm:rounded-2xl
          sm:bottom-[calc(6rem_+_env(safe-area-inset-bottom))] sm:right-[calc(1.5rem_+_env(safe-area-inset-right))]
          ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"}`}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot size={18} /></div>
          <div className="flex-1">
            <b className="block text-sm">CrewAI Assistant</b>
            <small className="text-muted-foreground">Help and navigation for your workspace</small>
          </div>
          {messages.length > 0 && <Button size="icon" variant="ghost" aria-label="New conversation" onClick={() => setMessages([])}><RotateCcw size={16} /></Button>}
          <Button size="icon" variant="ghost" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></Button>
        </header>

        <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Ask how to do anything in the CRM, or where to find it.</p>
              {STARTERS.map(s => (
                <button key={s} type="button" onClick={() => void send(s)} className="block w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:bg-muted">{s}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>
          ) : (
            <div key={i} className="max-w-[95%] text-sm">
              {m.content ? <Reply text={m.content} navigate={go} /> : <span className="inline-flex gap-1 text-muted-foreground"><span className="animate-pulse">●</span><span className="animate-pulse [animation-delay:150ms]">●</span><span className="animate-pulse [animation-delay:300ms]">●</span></span>}
            </div>
          ))}
        </div>

        <form className="flex items-end gap-2 border-t border-border p-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]" onSubmit={e => { e.preventDefault(); void send(input); }}>
          <textarea
            ref={field}
            rows={1}
            value={input}
            maxLength={4000}
            placeholder="Ask CrewAI…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></Button>
        </form>
      </div>
    </div>,
    document.body
  );
}

export { COPILOT_ROUTES };
