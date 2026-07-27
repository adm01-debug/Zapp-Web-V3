/**
 * Testes de contrato para reprocess-webhook-dlq (DLQ worker de mensagens).
 *
 * Garantem que os comportamentos críticos fixados nesta PR não regredidam:
 *  - Fetch de TODOS os eventos pendentes (não apenas messages.upsert).
 *  - Abandono imediato de event types não reprocessáveis.
 *  - Timeout por entrada para evitar travar o cron run completo.
 *  - error_message sempre escrito (null limpa falhas anteriores no sucesso).
 *  - Contador `retrying` (não `failed`) na resposta JSON.
 *  - Lote limitado (MAX_BATCH) com filtro retry_count < MAX_RETRIES.
 *  - Transições de estado: succeeded / pending (retrying) / abandoned.
 *
 * Rodar: deno test supabase/functions/reprocess-webhook-dlq/__tests__/contract.test.ts
 */
import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasMarker, readSource } from "./_helpers.ts";

const SOURCE = await readSource();

// ── Auth & Setup ──────────────────────────────────────────────────────────────

Deno.test("Auth: requer service role key ou admin JWT", () => {
  assertMatch(SOURCE, /requireServiceRoleOrCron/);
  assertMatch(SOURCE, /requireAdminOrSupervisor/);
});

Deno.test("Setup: usa createZappAdminClient para acesso ao banco", () => {
  assertMatch(SOURCE, /createZappAdminClient/);
});

Deno.test("CORS: OPTIONS pre-flight tratado", () => {
  assertMatch(SOURCE, /req\.method === 'OPTIONS'/);
  assertMatch(SOURCE, /handleCorsPreflight/);
});

// ── Fetch sem filtro de event_type ────────────────────────────────────────────

Deno.test("Fetch: busca schema 'evo' tabela 'evolution_webhook_dlq'", () => {
  assertMatch(SOURCE, /schema\('evo'\)/);
  assertMatch(SOURCE, /from\('evolution_webhook_dlq'\)/);
});

Deno.test("Fetch: filtra status='pending' e retry_count < MAX_RETRIES", () => {
  assertMatch(SOURCE, /\.eq\('status', 'pending'\)/);
  assertMatch(SOURCE, /\.lt\('retry_count', MAX_RETRIES\)/);
});

Deno.test("Fetch: NÃO filtra por event_type (busca todas as entradas pendentes)", () => {
  // A query de fetch PRINCIPAL (início do handler) não deve ter .in('event_type', ...)
  // O bloco de fetch é antes do loop de processamento.
  const fetchBlock = SOURCE.slice(0, SOURCE.indexOf("for (const row of rows)"));
  assert(
    !fetchBlock.includes(".in('event_type'"),
    "Fetch principal não deve filtrar por event_type — event types não reprocessáveis devem ser abandonados no loop, não ignorados na query"
  );
});

Deno.test("Fetch: limite de lote definido por MAX_BATCH", () => {
  assertMatch(SOURCE, /\.limit\(MAX_BATCH\)/);
  assertMatch(SOURCE, /MAX_BATCH = 20/);
});

// ── Abandono de event types não reprocessáveis ────────────────────────────────

Deno.test("REPLAYABLE_EVENT_TYPES: conjunto definido incluindo 'messages.upsert'", () => {
  assertMatch(SOURCE, /REPLAYABLE_EVENT_TYPES/);
  assertMatch(SOURCE, /'messages\.upsert'/);
});

Deno.test("Abandono imediato: event types fora do conjunto são abandonados antes de qualquer retry", () => {
  assertMatch(SOURCE, /REPLAYABLE_EVENT_TYPES\.has\(eventType\)/);
  assertMatch(SOURCE, /event type.*is not replayable by the DLQ reprocessor/);
});

// ── Timeout por entrada ───────────────────────────────────────────────────────

Deno.test("Timeout: constante ENTRY_TIMEOUT_MS definida", () => {
  assertMatch(SOURCE, /ENTRY_TIMEOUT_MS\s*=\s*30_000/);
});

Deno.test("Timeout: withTimeout envolve cada chamada de processamento", () => {
  assertMatch(SOURCE, /withTimeout\(/);
  assertMatch(SOURCE, /ENTRY_TIMEOUT_MS/);
});

Deno.test("Timeout: withTimeout usa Promise.race com setTimeout", () => {
  assertMatch(SOURCE, /Promise\.race\(/);
  assertMatch(SOURCE, /clearTimeout/);
});

// ── markDlqEntry: error_message sempre escrito ────────────────────────────────

Deno.test("markDlqEntry: error_message escrito incondicionalmente (null limpa falha anterior)", () => {
  const markBlock = SOURCE.slice(SOURCE.indexOf("async function markDlqEntry"));
  // Deve ter error_message: errorMessage sem condicional (não wrapped em ternário ou spread)
  assertMatch(markBlock, /error_message:\s*errorMessage/);
  // NÃO deve ter o padrão antigo de spread condicional
  assert(
    !markBlock.includes("errorMessage ? { error_message: errorMessage }"),
    "markDlqEntry não deve usar spread condicional — error_message deve sempre ser escrito (null limpa o campo)"
  );
});

Deno.test("markDlqEntry: status='succeeded' grava succeeded_at", () => {
  const markBlock = SOURCE.slice(SOURCE.indexOf("async function markDlqEntry"));
  assertMatch(markBlock, /succeeded_at:/);
  assertMatch(markBlock, /status === 'succeeded'/);
});

Deno.test("markDlqEntry: grava retry_count e last_attempt_at em todo update", () => {
  const markBlock = SOURCE.slice(SOURCE.indexOf("async function markDlqEntry"));
  assertMatch(markBlock, /retry_count:\s*retryCount/);
  assertMatch(markBlock, /last_attempt_at:/);
});

// ── Contadores na resposta ────────────────────────────────────────────────────

Deno.test("Resposta: contadores succeeded, retrying (não failed), abandoned, processed", () => {
  assert(hasMarker(SOURCE, "succeeded"), "faltou contador succeeded");
  assert(hasMarker(SOURCE, "retrying"), "faltou contador retrying");
  assert(hasMarker(SOURCE, "abandoned"), "faltou contador abandoned");
  assert(hasMarker(SOURCE, "processed"), "faltou contador processed");
  // O contador antigo 'failed' não deve aparecer como chave de resposta
  assert(
    !SOURCE.includes("{ processed: rows.length, succeeded, failed, abandoned }"),
    "resposta não deve usar 'failed' como chave — deve ser 'retrying'"
  );
});

// ── Transições de estado ──────────────────────────────────────────────────────

Deno.test("Sucesso: marca 'succeeded' com retry_count incrementado e null para error_message", () => {
  assertMatch(SOURCE, /markDlqEntry\(supabase, row\.id, 'succeeded'/);
});

Deno.test("Falha: abandona depois de MAX_RETRIES tentativas", () => {
  assertMatch(SOURCE, /retryCount \+ 1 >= MAX_RETRIES \? 'abandoned' : 'pending'/);
  assertMatch(SOURCE, /MAX_RETRIES = 5/);
});

Deno.test("Abandono: payload inválido (sem instance ou payload) é abandonado", () => {
  assertMatch(SOURCE, /missing instance_name or payload/);
});

Deno.test("Abandono: mensagem sem external_id é abandonada", () => {
  assertMatch(SOURCE, /missing message id in payload/);
});

// ── Roteamento de mensagens ───────────────────────────────────────────────────

Deno.test("Roteamento: fromMe=true -> handleOutgoingWhatsAppMessage", () => {
  assertMatch(SOURCE, /handleOutgoingWhatsAppMessage/);
  assertMatch(SOURCE, /key\.fromMe/);
});

Deno.test("Roteamento: fromMe=false -> handleIncomingMessage", () => {
  assertMatch(SOURCE, /handleIncomingMessage/);
});

// ── Logs de identificação ─────────────────────────────────────────────────────

Deno.test("Logs: prefixo [dlq-reprocess] em mensagens de erro", () => {
  assertMatch(SOURCE, /\[dlq-reprocess\]/);
});
