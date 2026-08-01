/**
 * @deprecated 2026-08-01 (Fase E4/E32) — edge function `e2e-fixtures` removida.
 * Mantido como referência histórica; qualquer execução falha (404).
 * Helpers de seed determinístico e cleanup para testes E2E.
 *
 * Garantias:
 * - TODOS os registros inseridos carregam o prefixo `e2e-` em
 *   `instance_name` (e em `remote_jid`/`event_type` quando aplicável).
 * - O `runId` é gerado por suite/teste e usado como sufixo, garantindo
 *   isolamento entre runs paralelos.
 * - O cleanup remove **APENAS** linhas que casam com `e2e-<runId>%` —
 *   nunca toca em dados sem o prefixo, mesmo por engano.
 * - Toda I/O passa pela edge function `e2e-fixtures`, que valida o
 *   prefixo no servidor (defesa em profundidade).
 *
 * Uso típico em um spec Playwright:
 * ```ts
 * import { test } from './fixtures/auth';
 * import { useE2eFixtures } from './utils/seed';
 *
 * test.describe('Suite', () => {
 *   const fx = useE2eFixtures(test, { target: 'failed_messages', count: 5 });
 *   test('faz X', async ({ authenticatedPage }) => {
 *     // fx.runId já está disponível; rows com prefixo `e2e-${fx.runId}` no banco.
 *   });
 * });
 * ```
 */
import { test as baseTest } from '@playwright/test';

export const E2E_PREFIX = 'e2e-';
export type SeedTarget = 'failed_messages' | 'webhook_events' | 'all';

export interface FixtureOptions {
  /** Qual dataset semear. Default: 'all'. */
  target?: SeedTarget;
  /** Quantas linhas por dataset. Default: 3. Máx 25. */
  count?: number;
  /** Override do runId — útil para reusar dados entre suites. */
  runId?: string;
}

export interface FixtureHandle {
  /** Identificador único deste run, usado para escopar todas as linhas inseridas. */
  runId: string;
  /** Prefixo composto pronto para usar em filtros UI: `e2e-<runId>`. */
  marker: string;
}

interface FixtureResponse {
  runId: string;
  action: 'seed' | 'cleanup';
  failed_messages?: { inserted?: number; deleted?: number };
  webhook_events?: { inserted?: number; deleted?: number };
  error?: string;
  message?: string;
}

function envOrThrow(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}. Required for E2E seeds.`);
  return v;
}

function functionsUrl(): string {
  const url = envOrThrow('VITE_SUPABASE_URL').replace(/\/$/, '');
  return `${url}/functions/v1/e2e-fixtures`;
}

/**
 * Token usado para chamar a edge function. Em CI use `E2E_SERVICE_ROLE_KEY`
 * (segredo separado, NUNCA versionado) ou — em dev local — caia no
 * `SUPABASE_SERVICE_ROLE_KEY`. A edge function valida o token em ambos
 * os casos antes de tocar em qualquer tabela.
 */
function authToken(): string {
  return (
    process.env.E2E_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    envOrThrow('VITE_SUPABASE_PUBLISHABLE_KEY') // fallback exige usuário admin logado no chamador
  );
}

async function callFixtures(payload: Record<string, unknown>): Promise<FixtureResponse> {
  const res = await fetch(functionsUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken()}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as FixtureResponse;
  if (!res.ok) {
    throw new Error(
      `e2e-fixtures ${payload.action} failed (${res.status}): ${data.error ?? 'unknown'}${
        data.message ? ` — ${data.message}` : ''
      }`,
    );
  }
  return data;
}

function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${ts}${rnd}`; // será usado como `e2e-<runId>` no servidor
}

// ============================================================
// API pública
// ============================================================

/** Insere linhas determinísticas. Retorna o handle com `runId` e `marker`. */
export async function seedE2eFixtures(opts: FixtureOptions = {}): Promise<FixtureHandle> {
  const runId = opts.runId ?? generateRunId();
  await callFixtures({
    action: 'seed',
    runId,
    target: opts.target ?? 'all',
    count: opts.count ?? 3,
  });
  return { runId, marker: `${E2E_PREFIX}${runId}` };
}

/** Remove TODAS as linhas escopadas pelo `runId`. No-op se nada existir. */
export async function cleanupE2eFixtures(runId: string, target: SeedTarget = 'all'): Promise<void> {
  if (!runId) return;
  await callFixtures({ action: 'cleanup', runId, target });
}

/**
 * Atalho declarativo: registra `beforeAll`/`afterAll` no test runner para
 * semear antes da suite e limpar depois — mesmo se algum teste falhar.
 *
 * Retorna um objeto vivo (`{ runId, marker }`) — os campos só ficam preenchidos
 * após `beforeAll`. Capture-o por closure no escopo `describe`.
 */
export function useE2eFixtures(
  test: typeof baseTest,
  opts: FixtureOptions = {},
): FixtureHandle {
  const handle: FixtureHandle = { runId: '', marker: '' };
  test.beforeAll(async () => {
    const seeded = await seedE2eFixtures(opts);
    handle.runId = seeded.runId;
    handle.marker = seeded.marker;
  });
  test.afterAll(async () => {
    if (handle.runId) {
      await cleanupE2eFixtures(handle.runId, opts.target ?? 'all').catch((e) => {
        // Cleanup é best-effort no afterAll — logar mas não quebrar a suite.
         
        console.warn(`[e2e seed] cleanup failed for runId=${handle.runId}:`, e);
      });
    }
  });
  return handle;
}
