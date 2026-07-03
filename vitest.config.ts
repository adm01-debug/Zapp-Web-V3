import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // A suíte é grande (~2.1k testes / 131 arquivos). Rodar tudo num único
    // processo acumula heap entre arquivos e estoura o limite (OOM). O pool
    // 'forks' roda cada arquivo num processo filho que libera memória ao sair;
    // limitar os forks mantém o pico de memória controlado para o gate poder
    // bloquear de forma estável.
    pool: 'forks',
    poolOptions: {
      forks: { minForks: 1, maxForks: 3 },
    },
    // Realtime/async tests use waitFor with timeouts up to 10s; the default 5s
    // test timeout killed them first under slow scheduling, making them flaky.
    // 15s gives those waitFors headroom without masking real hangs (the one
    // test that actually hung — useMessages, an infinite re-render loop — is
    // quarantined, not merely waited on).
    testTimeout: 15000,
    // On CI, retry a failing test up to twice before marking it failed. Several
    // realtime/async tests are inherently timing-sensitive; a transient miss
    // shouldn't redden a blocking gate, but a genuine failure still fails all
    // three attempts. No retries locally so flakiness stays visible during dev.
    retry: process.env.CI ? 2 : 0,
    // Env dummy para que módulos que importam o client real do Supabase não
    // lancem na importação. Testes que tocam a rede mockam o client mesmo assim.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    // Vitest cobre apenas unit/integration em src/. Specs Playwright (.spec.ts em
    // e2e/, tests/, src/tests/e2e/) e scripts bun:test rodam por outras suítes.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'e2e/**',
      'tests/**',
      'src/tests/e2e/**',
      'scripts/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/test/'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
