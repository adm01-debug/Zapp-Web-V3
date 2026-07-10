import { defineConfig, devices } from '@playwright/test';

/**
 * Configuração Playwright dedicada aos testes de regressão de acessibilidade.
 *
 * - Roda APENAS specs `*accessibility*.spec.ts` e `*keyboard-navigation*.spec.ts` em `e2e/`.
 * - NÃO depende do `global.setup.ts` (rotas de auth são públicas — sem storageState).
 * - Sobe o `vite dev` automaticamente com envs placeholder, seguindo o padrão do quality-gate.
 *
 * Uso local:  npx playwright test --config=playwright.a11y.config.ts
 * Uso em CI:  bun run test:a11y
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*accessibility*.spec.ts', '**/*keyboard-navigation*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report-a11y' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npx vite --port 5173',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'test-anon-key',
      VITE_SUPABASE_PUBLISHABLE_KEY:
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'test-anon-key',
      VITE_EXTERNAL_SUPABASE_URL:
        process.env.VITE_EXTERNAL_SUPABASE_URL || 'https://example.supabase.co',
      VITE_EXTERNAL_SUPABASE_ANON_KEY:
        process.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || 'test-anon-key',
    },
  },
});
