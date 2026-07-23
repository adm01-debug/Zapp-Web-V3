import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Configuração Playwright dedicada ao diretório `e2e/`.
 *
 * - Sobe o `vite dev` automaticamente em http://localhost:5173.
 * - Usa um project `setup` que faz login uma única vez e grava o
 *   storageState em `e2e/.auth/user.json`.
 * - Os specs em `e2e/` herdam esse storageState (já autenticados).
 *
 * Uso:
 *   npx playwright test --config=playwright.e2e.config.ts
 *   npx playwright test --config=playwright.e2e.config.ts e2e/whatsapp-reactions-realtime.spec.ts
 *
 * Variáveis de ambiente exigidas:
 *   E2E_USER_EMAIL, E2E_USER_PASSWORD  (lidas por e2e/fixtures/test-data.ts)
 *   E2E_BASE_URL (opcional, default http://localhost:5173)
 */

const STORAGE_STATE = path.resolve(__dirname, 'e2e/.auth/user.json');
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/fixtures/**', '**/helpers/**', '**/utils/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report-e2e' }], ['list']],
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
      name: 'setup',
      testMatch: /global\.setup\.ts$/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: BASE_URL.includes('localhost') ? {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  } : undefined,
});
