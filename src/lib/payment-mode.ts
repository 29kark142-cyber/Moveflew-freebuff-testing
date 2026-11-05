// Test-card deposits may book jobs only when checkout started on a preview/development address.
// The host is read server-side from the request, never supplied by the browser.
export function isPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || (h.startsWith("id-preview--") && h.endsWith(".lovable.app")) || h.endsWith("-dev.lovable.app") || h.endsWith(".lovableproject.com");
}
