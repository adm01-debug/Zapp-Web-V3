import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { compression } from 'vite-plugin-compression2';

// Self-hosted Supabase (cutover 2026-06-30). These are FALLBACKS only, used
// when the matching VITE_* env var is absent (e.g. local dev without .env).
// In Vercel/production the real env vars override these. The anon key is
// intentionally NOT hardcoded here — a public anon key still grants API access,
// so it must come from the environment, never from the repo.
const MANAGED_PUBLIC_ENV_FALLBACKS = {
  VITE_SUPABASE_URL: 'https://supabase.atomicabr.com.br',
  VITE_SUPABASE_ANON_KEY: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
  VITE_SUPABASE_PROJECT_ID: '',
} as const;

const resolvePublicEnv = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), '');
  return Object.fromEntries(
    Object.entries(MANAGED_PUBLIC_ENV_FALLBACKS).map(([key, fallback]) => [
      `import.meta.env.${key}`,
      JSON.stringify(env[key] || process.env[key] || fallback),
    ]),
  );
};

// Build id — one per `vite build` run. Consumed by src/lib/buildVersion.ts
// via the `__APP_BUILD_ID__` global and mirrored to dist/version.json below,
// so a running tab can detect that its bundle is older than what the CDN now
// serves and force a hard refresh.
const BUILD_ID = `${Date.now()}`;

// Vite plugin: writes dist/version.json at the end of each production build.
const emitVersionJsonPlugin = () => ({
  name: 'zapp-emit-version-json',
  apply: 'build' as const,
  generateBundle() {
    // @ts-expect-error — `this.emitFile` is provided by Rollup at build time
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }),
    });
  },
});

// Vite plugin: stamps public/sw.js copied into dist with the current BUILD_ID
// and appends an explicit purge of legacy Workbox precache buckets. This is the
// "publish pipeline step" that invalidates the old Service Worker automatically:
//   1. Stamping the build id guarantees a byte-diff on every deploy, so the
//      browser sees the SW as changed and runs install/activate.
//   2. The appended block deletes `workbox-precache-*` / `workbox-runtime-*`
//      caches on activate and postMessages a `SW_UPDATED` event to all clients
//      so open tabs reload into the fresh bundle.
const stampSwVersionPlugin = () => ({
  name: 'zapp-stamp-sw-version',
  apply: 'build' as const,
  async writeBundle(options: { dir?: string }) {
    const fs = await import('node:fs/promises');
    const p = await import('node:path');
    const outDir = options.dir ?? 'dist';
    const swPath = p.resolve(outDir, 'sw.js');
    try {
      const original = await fs.readFile(swPath, 'utf8');
      const banner =
        `// ZAPP_SW_BUILD_ID=${BUILD_ID}\n` +
        `// Auto-injected by stampSwVersionPlugin — do not edit in dist/.\n` +
        `self.__ZAPP_SW_BUILD_ID = ${JSON.stringify(BUILD_ID)};\n`;
      const purgeAndNotify = `

// -- Auto-injected: invalidate legacy Workbox SW + notify open clients --
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const legacy = keys.filter((k) =>
        /^workbox-precache-v\\d+/.test(k) || /^workbox-runtime-/.test(k) || /workbox/i.test(k)
      );
      await Promise.all(legacy.map((k) => caches.delete(k).catch(() => false)));
      if (legacy.length) {
        console.log('[ServiceWorker] Purged legacy Workbox caches on install:', legacy);
      }
    } catch (_e) { /* Cache Storage unavailable — non-fatal */ }
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const c of list) {
        try { c.postMessage({ type: 'SW_UPDATED', buildId: self.__ZAPP_SW_BUILD_ID }); } catch (_e) { /* noop */ }
      }
    } catch (_e) { /* noop */ }
  })());
});
`;
      await fs.writeFile(swPath, banner + original + purgeAndNotify, 'utf8');
    } catch (err) {
      // Non-fatal: sw.js may be absent in some builds; publish should not break.
      console.warn('[stampSwVersionPlugin] Could not stamp sw.js:', (err as Error).message);
    }
  },
});


export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br)$/, /\.(gz)$/],
    }),
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br)$/, /\.(gz)$/],
    }),
    emitVersionJsonPlugin(),
    // PWA is manifest-only (public/manifest.json). No Workbox / no app-shell caching.
    // Push notifications continue via public/sw.js registered by useServiceWorker.
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    ...resolvePublicEnv(mode),
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    reportCompressedSize: false,
    cssCodeSplit: true,
    // 'hidden' generates .map files in dist without referencing them in JS output.
    // Browsers cannot accidentally load them; Sentry can consume them via CLI/plugin.
    // Dev builds keep true (full inline sourcemaps).
    sourcemap: mode === 'development' ? true : 'hidden',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          // Heavy UI/visual libraries
          if (id.includes('mapbox-gl') || id.includes('mapbox')) return 'vendor-mapbox';
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('jspdf')) return 'vendor-pdf';
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('sip.js')) return 'vendor-sip';
          if (id.includes('@sentry')) return 'vendor-sentry';
          if (id.includes('framer-motion')) return 'vendor-motion';
          // React core — tiny but improves long-term caching
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/react-router')) return 'vendor-react';
          // Supabase client
          if (id.includes('@supabase/')) return 'vendor-supabase';
          // Radix UI primitives (shadcn base)
          if (id.includes('@radix-ui/')) return 'vendor-radix';
          // Date utilities
          if (id.includes('date-fns')) return 'vendor-date';
          // Icon library
          if (id.includes('lucide-react')) return 'vendor-icons';
          // Validation
          if (id.includes('/zod/')) return 'vendor-zod';
          // Tanstack Query
          if (id.includes('@tanstack/')) return 'vendor-tanstack';
        },
      },
    },
  }
}));
