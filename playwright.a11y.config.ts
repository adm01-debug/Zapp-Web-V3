import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Configuração Playwright dedicada aos testes de regressão de acessibilidade.
 *
 * E02/F10-05 — antes deste ajuste o `testMatch` citava nominalmente apenas os
 * dois specs de autenticação, deixando `chat-accessibility.spec.ts` (e qualquer
 * spec futuro) fora do gate. Agora o alvo é por padrão de nome:
 *
 * - `**\/*-accessibility.spec.ts` e `**\/*-keyboard-navigation.spec.ts` em `e2e/`.
 * - Project `public`: rotas pré-login (`auth-*`), sem storageState — roda em
 *   qualquer runner, inclusive sem credenciais (é o caso do job `a11y` do ci.yml).
 * - Project `authenticated`: todo o resto (inbox, chat, CRM...), com storageState
 *   produzido por `e2e/global.setup.ts`. **Só é registrado quando
 *   `E2E_USER_EMAIL` + `E2E_USER_PASSWORD` existem** — ou seja, nos workflows
 *   `e2e-*-vps.yml`, que apontam para infraestrutura real.
 *
 * Uso local:  npx playwright test --config=playwright.a11y.config.ts
 * Uso em CI:  bun run test:a11y
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const STORAGE_STATE = path.resolve(process.cwd(), 'e2e/.auth/user.json');
const HAS_E2E_CREDENTIALS = Boolean(
  process.env.E2E_USER_EMAIL && process.env.E2E_USER_PASSWORD
);

// E02-N10 — o alvo do project `public` precisa ser "a11y em rota publica",
// nao "todo `auth-*.spec.ts`": `auth-flow`, `auth-extended` e
// `auth-session-lifecycle` exigem backend real e reprovavam o job `a11y` do
// ci.yml, que roda sem credenciais. Segue por padrao (nao nominal), como F10-05 pedia.
const PUBLIC_A11Y = /auth-.*(accessibility|keyboard-navigation)\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    '**/*-accessibility.spec.ts',
    '**/*-keyboard-navigation.spec.ts',
    '**/global.setup.ts',
  ],
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
    ...(HAS_E2E_CREDENTIALS
      ? [{ name: 'setup', testMatch: /global\.setup\.ts$/ }]
      : []),
    {
      name: 'public',
      testMatch: [PUBLIC_A11Y],
      use: { ...devices['Desktop Chrome'] },
    },
    ...(HAS_E2E_CREDENTIALS
      ? [
          {
            name: 'authenticated',
            testIgnore: [PUBLIC_A11Y, '**/global.setup.ts'],
            use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  // Quando E2E_BASE_URL aponta para um ambiente já de pé (VPS), não sobe vite local.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx vite --port 5173',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'ignore' as const,
        stderr: 'pipe' as const,
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
