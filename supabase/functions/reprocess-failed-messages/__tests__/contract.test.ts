/**
 * Testes de regressão do reprocess-failed-messages (DLQ worker).
 *
 * Garantem que o contrato com `failed_messages` não regrida:
 *  - Lote limitado (MAX_BATCH) e seleção por status pending|retrying com
 *    next_attempt_at <= now().
 *  - Backoff exponencial limitado (cap 1h).
 *  - Transições de estado: succeeded / retrying / abandoned (com retry_count).
 *  - Path da Evolution embutido no payload via campo __path (removido antes do envio).
 *  - Falhas de fetch/exception também marcam retry/abandon (não vazam 5xx).
 *  - Credenciais Evolution validadas antes do loop.
 */
import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";
import { hasMarker, readSource } from "./_helpers.ts";

const SOURCE = await readSource();
const BACKOFF_SOURCE = await readSourceFrom(
  import.meta.url,
  "../../_shared/dlq-backoff.ts",
);

Deno.test("Setup: usa SERVICE_ROLE_KEY e egresso via gateway evolutionFetch", () => {
  assertMatch(SOURCE, /SUPABASE_SERVICE_ROLE_KEY/);
  // F5 (2026-08-13): URL/KEY resolvidas pelo gateway (client.ts) — o index não
  // deve mais conter EVOLUTION_API_URL literal (senão o inventory v3 acusa).
  assertMatch(SOURCE, /evolutionFetch/);
  assertMatch(SOURCE, /from '\.\.\/_shared\/providers\/evolution\/index\.ts'/);
  assertMatch(SOURCE, /createZappAdminClient/);
});

Deno.test("CORS: pre-flight OPTIONS tratado", () => {
  assertMatch(SOURCE, /req\.method === 'OPTIONS'/);
  assertMatch(SOURCE, /Access-Control-Allow-Origin/);
});

Deno.test("Seleção: status in (pending, retrying) com next_attempt_at <= now e limite de lote", () => {
  assertMatch(SOURCE, /\.in\('status', \['pending', 'retrying'\]\)/);
  assertMatch(SOURCE, /\.lte\('next_attempt_at'/);
  assertMatch(SOURCE, /\.limit\(MAX_BATCH\)/);
  assertMatch(SOURCE, /MAX_BATCH = 25/);
});

Deno.test("Path da Evolution: __path removido antes do envio", () => {
  assertMatch(SOURCE, /payload\.__path as string\) \|\| '\/message\/sendText'/);
  assertMatch(SOURCE, /delete \(body as Record<string, unknown>\)\.__path/);
});

Deno.test("Envio: POST via evolutionFetch para path/instance com Idempotency-Key", () => {
  // F5: URL montada pelo gateway (client.ts); o index só passa path+instance.
  assertMatch(SOURCE, /evolutionFetch\(/);
  assertMatch(SOURCE, /path\.replace\(\/\^\\\/\/, ''\)\}\/\$\{instance\}/);
  assertMatch(SOURCE, /method: 'POST'/);
  assertMatch(SOURCE, /Idempotency-Key/);
});

Deno.test("Sucesso: marca succeeded com succeeded_at e incrementa retry_count", () => {
  const block = SOURCE.slice(SOURCE.indexOf("if (resp.ok)"));
  assertMatch(block, /status: 'succeeded'/);
  assertMatch(block, /succeeded_at:/);
  assertMatch(block, /retry_count: attempt/);
});

Deno.test("Esgotado: attempt >= max_retries => abandoned", () => {
  assertMatch(SOURCE, /attempt >= row\.max_retries/);
  assertMatch(SOURCE, /status: 'abandoned'/);
});

Deno.test("Backoff exponencial limitado (cap em 1h)", () => {
  // O worker delega o cálculo ao helper compartilhado, agora reason-aware.
  assertMatch(SOURCE, /computeBackoffMsByReason\(attempt \+ 1, reason\)/);
  assertMatch(SOURCE, /from '\.\.\/_shared\/dlq-backoff\.ts'/);
  assertMatch(SOURCE, /next_attempt_at:/);
  // O helper mantém a fórmula base*2^(n-1) com teto em 1h (60_000 → 3_600_000).
  assertMatch(BACKOFF_SOURCE, /BASE_DELAY_MS\s*=\s*60_000/);
  assertMatch(BACKOFF_SOURCE, /MAX_DELAY_MS\s*=\s*3_600_000/);
  assertMatch(BACKOFF_SOURCE, /Math\.min\(raw,\s*MAX_DELAY_MS\)/);
  assertMatch(BACKOFF_SOURCE, /BASE_DELAY_MS \* Math\.pow\(2, safeAttempt - 1\)/);
});

Deno.test("Catch: exceções também respeitam max_retries (retry/abandon)", () => {
  const block = SOURCE.slice(SOURCE.indexOf("} catch (e)"));
  assertMatch(block, /attempt >= row\.max_retries \? 'abandoned' : 'retrying'/);
  assertMatch(block, /error_message: msg\.slice\(0, 500\)/);
});

Deno.test("Resposta: contadores processed/succeeded/failed/abandoned", () => {
  for (const k of ["processed", "succeeded", "failed", "abandoned"]) {
    assert(hasMarker(SOURCE, k), `faltou contador ${k} na resposta`);
  }
});

Deno.test("Logs: marca dlq-reprocess com identificadores chave", () => {
  assertMatch(SOURCE, /\[dlq-reprocess\]/);
});

Deno.test('Reason-aware backoff: usa classifyRetryReason + computeBackoffMsByReason', () => {
  assertMatch(SOURCE, /classifyRetryReason\(/);
  assertMatch(SOURCE, /computeBackoffMsByReason\(/);
  assertMatch(SOURCE, /last_retry_reason:/);
});
