import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Configuração Playwright dedicada ao diretório `e2e/`.
 *
 * - Sobe o `vite dev` automaticamente em http://localhost:4173 com PORTA
 *   FIXA + `--strictPort` (nunca drift silencioso p/ 8081/etc — falha rápido
 *   com mensagem clara se a porta estiver ocupada). A porta do dev real do
 *   app é 8080 (vite.config.ts, sem strictPort); o E2E usa 4173 isolado.
 * - Usa um project `setup` que faz login uma única vez e grava o
 *   storageState em `e2e/.auth/user.json`.
 * - Os specs em `e2e/` herdam esse storageState (já autenticados).
 *
 * Uso:
 *   npx playwright test --config=playwright.e2e.config.ts
 *   npx playwright test --config=playwright.e2e.config.ts e2e/whatsapp-reactions-realtime.spec.ts
 *   npx playwright test --config=playwright.e2e.config.ts e2e/decouple-fake-provider.spec.ts
 *
 * Variáveis de ambiente exigidas:
 *   E2E_USER_EMAIL, E2E_USER_PASSWORD  (lidas por e2e/fixtures/test-data.ts)
 *   E2E_BASE_URL (opcional, default http://localhost:4173 — alinhado com o
 *   webServer local; workflows VPS setam a URL real → webServer fica
 *   desligado e nada local sobe)
 *
 * Gate E2E_FAKE (spec decouple-fake-provider):
 *   Quando a run mira SÓ esse spec SEM `E2E_FAKE=1`, o project `setup`
 *   (login) é omitido e o spec se auto-pula (test.skip top-level, antes das
 *   fixtures) → a run termina verde com 4 skipped mesmo SEM backend. Runs
 *   com outros specs (ou com E2E_FAKE=1, que exige auth real) mantêm o
 *   `setup` normalmente.
 */

const STORAGE_STATE = path.resolve(process.cwd(), 'e2e/.auth/user.json');
// Default consistente com o webServer: 4173 (fixa + strictPort). A VPS
// (workflows e2e-*-vps.yml / e2e-nightly-full.yml) seta E2E_BASE_URL real →
// webServer vira `undefined` e nada local é iniciado.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

// Detecta "run só do spec fake sem gate": argv contém o spec e nenhum OUTRO
// spec e2e. Nesse caso não há backend nem login — tudo deve pular gracioso.
const ARGV_SPECS = process.argv.filter((a) => /(?:^|[\\/])e2e[\\/].+\.spec\.ts$/.test(a));
const FAKE_SPEC_ONLY_WITHOUT_GATE =
  process.env.E2E_FAKE !== '1' &&
  ARGV_SPECS.length > 0 &&
  ARGV_SPECS.every((a) => a.includes('decouple-fake-provider.spec.ts'));

const projects: NonNullable<Parameters<typeof defineConfig>[0]['projects']> = [];
if (!FAKE_SPEC_ONLY_WITHOUT_GATE) {
  projects.push({
    name: 'setup',
    testMatch: /global\.setup\.ts$/,
  });
}
projects.push({
  name: 'chromium',
  use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
  ...(FAKE_SPEC_ONLY_WITHOUT_GATE ? {} : { dependencies: ['setup'] }),
});

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

  projects,

  webServer: BASE_URL.includes('localhost') ? {
    // Porta fixa + strictPort: vite NUNCA drift para 8081 — se 4173 estiver
    // ocupada o webServer falha na hora com erro claro (DRIFT-DE-PORTA fix).
    command: 'npm run dev -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  } : undefined,
});
