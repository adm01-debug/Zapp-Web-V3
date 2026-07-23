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
    // PWA is manifest-only (public/manifest.json). No Workbox / no app-shell caching.
    // Push notifications continue via public/sw.js registered by useServiceWorker.
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: resolvePublicEnv(mode),
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
