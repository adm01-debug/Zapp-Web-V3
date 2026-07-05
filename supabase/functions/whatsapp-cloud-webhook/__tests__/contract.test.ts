/**
 * Testes de regressão (estáticos) do whatsapp-cloud-webhook.
 *
 * Cobrem o contrato de deduplicação introduzido na auditoria de 2026-07-05
 * (sessão 7): a dedup de mensagens passou a reusar o helper compartilhado
 * `markEventProcessed` (insert-first + detecção de duplicata via violação de
 * unique constraint em `webhook_events_processed`), no lugar do antigo
 * select-then-insert contra `processed_webhook_events` — tabela que foi
 * dropada num incidente de DDL e nunca recriada (ver
 * docs/EVOLUTION_API_AUDIT_2026-07-05_sessao7.md §1.3/§2).
 *
 * Sem isso, uma futura mudança no nome da tabela, na constraint ou na
 * semântica de retorno do helper poderia regredir a dedup silenciosamente
 * (apontado em review por Copilot e cubic-dev-ai no PR #195).
 */
import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readSource } from "./_helpers.ts";

const SOURCE = await readSource();

Deno.test("Dedup: reusa o helper compartilhado markEventProcessed (insert-first)", () => {
  assertMatch(SOURCE, /import \{ markEventProcessed \} from "\.\.\/_shared\/evolution-helpers\.ts";/);
  assertMatch(SOURCE, /markEventProcessed\(localClient, eventId, "whatsapp-cloud", "messages\.upsert"\)/);
});

Deno.test("Dedup: eventId namespaced por canal (whatsapp-cloud:<messageId>)", () => {
  assertMatch(SOURCE, /const eventId = `whatsapp-cloud:\$\{messageId\}`;/);
});

Deno.test("Dedup: retorno do helper (isNew) é invertido corretamente para isDuplicate", () => {
  // markEventProcessed retorna true quando é a PRIMEIRA vez (não-duplicata) —
  // isDuplicate precisa negar esse valor, não repassá-lo direto.
  const block = SOURCE.slice(
    SOURCE.indexOf("async function isDuplicate"),
    SOURCE.indexOf("async function persistInbound"),
  );
  assertMatch(block, /const isNew = await markEventProcessed\(/);
  assertMatch(block, /return !isNew;/);
});

Deno.test("Dedup: mensagem sem messageId não bloqueia o processamento (fail-open por design)", () => {
  const block = SOURCE.slice(
    SOURCE.indexOf("async function isDuplicate"),
    SOURCE.indexOf("async function persistInbound"),
  );
  assertMatch(block, /if \(!messageId\) return false;/);
});

Deno.test("Regressão: não referencia mais a tabela dropada processed_webhook_events", () => {
  // supabase/migrations/20260705013000_evo_zapp_security_and_integrity_hardening.sql
  // documenta que a tabela foi dropada em 2026-07-04 e nunca recriada (era um
  // alias legado de webhook_events_processed segundo scripts/check_schema_drift.sql).
  assert(
    !SOURCE.includes("processed_webhook_events"),
    "whatsapp-cloud-webhook não deve mais consultar a tabela legada processed_webhook_events",
  );
});

Deno.test("Chamador: duplicata incrementa contador e pula persistInbound", () => {
  const loopBlock = SOURCE.slice(SOURCE.indexOf("for (const msg of messages)"));
  assertMatch(loopBlock, /if \(await isDuplicate\(msg\.id\)\) \{/);
  assertMatch(loopBlock, /duplicates\+\+;/);
  assertMatch(loopBlock, /continue;/);
});
