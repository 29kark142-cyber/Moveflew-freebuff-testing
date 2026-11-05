// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  plugins: [mcpPlugin(), VitePWA({ outDir:'dist/client', strategies:'generateSW', filename:'sw.js', injectRegister:null, registerType:'autoUpdate', manifest:false, devOptions:{enabled:false},
    workbox:{ globPatterns:['**/*.{js,css,woff2,ttf,png,svg}'], globIgnores:['**/server/**'], maximumFileSizeToCacheInBytes:5*1024*1024,
      additionalManifestEntries:[{url:'/field-offline.html',revision:'1'}], navigateFallback:undefined,
      runtimeCaching:[{urlPattern:({request,url})=>request.mode==='navigate' && /^\/app\/field(?:\/?$|\/)/.test(url.pathname),handler:'NetworkFirst',options:{cacheName:'moveflew-field-navigation',networkTimeoutSeconds:5,precacheFallback:{fallbackURL:'/field-offline.html'},cacheableResponse:{statuses:[200]},expiration:{maxEntries:1,maxAgeSeconds:86400}}},
      {urlPattern:({url})=>url.origin===self.location.origin && /\/assets\/.*-[a-zA-Z0-9_-]+\.(js|css|woff2|ttf|png|svg)$/.test(url.pathname),handler:'CacheFirst',options:{cacheName:'moveflew-field-assets',expiration:{maxEntries:150,maxAgeSeconds:2592000}}}], cleanupOutdatedCaches:true }
  })],
  vite: {
    define: { __APP_BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  },
});
