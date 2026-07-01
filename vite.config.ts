import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { compression } from 'vite-plugin-compression2';
import { VitePWA } from 'vite-plugin-pwa';

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
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'OmniChannel Pro',
        short_name: 'OmniPro',
        description: 'Plataforma Omnichannel de Alta Performance',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
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
    sourcemap: mode === 'development',
  }
}));
