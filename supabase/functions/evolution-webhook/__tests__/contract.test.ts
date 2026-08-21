/**
 * Testes de regressão (estáticos) do evolution-webhook.
 *
 * Garantem que contratos críticos não regridam:
 *  - Validação HMAC habilitada quando há WEBHOOK_SECRET (com STRICT_MODE).
 *  - Idempotência por hash (instance:event:bodyHash) e short-circuit em duplicatas.
 *  - Auditoria persistida em rejected/duplicate/processed/error.
 *  - Erros de handler não retornam 5xx para a Evolution (evita retry-storm).
 *  - JSON inválido => 422 canônico (envelope contract-kit) + audit rejected.
 *  - CORS pre-flight tratado antes de qualquer leitura de body.
 *  - Cobertura mínima de eventos roteados (PRESENCE/CONTACTS/CHATS/CALL/LABELS).
 */
import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasMarker, readSource } from "./_helpers.ts";

const SOURCE = await readSource();

Deno.test("HMAC: lê WEBHOOK_SECRET[S] (incl. EVOLUTION_WEBHOOK_*) e instala validador", () => {
  assertMatch(SOURCE, /EVOLUTION_WEBHOOK/);
  assertMatch(SOURCE, /WEBHOOK_SECRET/);
  // Validador é instalado com a lista (string|string[]) — multi-secret rotation.
  // [C-9] 3º arg = ALLOW_SHARED_SECRET (gate de deprecação do plaintext).
  assertMatch(SOURCE, /createWebhookValidator\(WEBHOOK_SECRETS, STRICT_MODE, ALLOW_SHARED_SECRET\)/);
});

Deno.test("[C-9] HMAC primário: checagem inline de x-webhook-secret removida (validação única via validador)", () => {
  // Antes do C-9 o index.ts validava x-webhook-secret ANTES do HMAC (__staticSecretOk),
  // então plaintext tinha precedência. Agora só existe o validador: HMAC primeiro,
  // shared-secret como fallback deprecated.
  assert(!SOURCE.includes("__staticSecretOk"), "checagem inline de plaintext não pode voltar");
  assert(!SOURCE.includes("timingSafeStringEqual"), "import não usado do auth.ts deve permanecer removido");
});

Deno.test("[C-9] Gate EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET presente e wireado no validador", () => {
  assertMatch(SOURCE, /EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET/);
  // default true (compat temporária); false => HMAC-only
  assertMatch(SOURCE, /\?\? 'true'\)\.toLowerCase\(\) !== 'false'/);
});

Deno.test("[C-9] Fallback plaintext DEPRECATED loga warning e expõe sharedSecretValid", () => {
  assertMatch(SOURCE, /DEPRECATED auth: x-webhook-secret/);
  assertMatch(SOURCE, /result\.sharedSecretValid/);
});

Deno.test("HMAC: assinatura inválida => 401 + audit rejected", () => {
  assertMatch(SOURCE, /if \(!result\.valid\)/);
  assertMatch(SOURCE, /status: 'rejected'/);
  assertMatch(SOURCE, /status: 401/);
});

Deno.test("CORS: handleCors antes de qualquer parsing/IO", () => {
  const corsIdx = SOURCE.indexOf("handleCors(req)");
  const bodyIdx = SOURCE.indexOf("await req.text()");
  assert(corsIdx > 0 && (bodyIdx === -1 || corsIdx < bodyIdx),
    "handleCors deve ser chamado antes de ler o body");
});

Deno.test("Method guard: somente POST aceito", () => {
  assertMatch(SOURCE, /req\.method !== 'POST'/);
  assertMatch(SOURCE, /status: 405/);
});

Deno.test("Idempotência: dedup por sha256(instance:event:body) + markEventProcessed", () => {
  // NFC normalization is applied before hashing to prevent Unicode representation attacks
  // (e.g., café as U+00E9 vs combining U+0301 bypassing dedup). assertMatch both steps.
  assertMatch(SOURCE, /rawBody\.normalize\('NFC'\)/);
  assertMatch(SOURCE, /sha256Hex\(normalizedBody\)/);
  assertMatch(SOURCE, /\$\{instance \|\| 'unknown'\}:\$\{event\}:\$\{bodyHash\}/);
  assertMatch(SOURCE, /markEventProcessed\(supabase, eventId/);
  assertMatch(SOURCE, /duplicate: true/);
});

Deno.test("JSON inválido => 422 canônico + audit rejected", () => {
  // Correção 2026-08-06 (gap A1-B1): falha de validação SEMPRE 422 com
  // envelope contract-kit (era 400 {error} incompleto).
  assertMatch(SOURCE, /buildContractErrorBody\(/);
  assertMatch(SOURCE, /'invalid_json'/);
  assertMatch(SOURCE, /status: 422/);
  assertMatch(SOURCE, /status_code: 422/);
});

Deno.test("Resiliência: handler_error retorna 200 (sem retry-storm)", () => {
  const block = SOURCE.slice(SOURCE.indexOf("} catch (error: unknown)"));
  assertMatch(block, /handler_error/);
  assertMatch(block, /status: 200/);
  assertMatch(block, /error: 'internal_error'/);
});

Deno.test("Recuperabilidade: handler_error é roteado para a DLQ antes do audit", () => {
  // Regressão do gap wpp2: o evento é marcado processado (idempotência) ANTES
  // do handler e retornamos 200 mesmo em falha, então sem DLQ a perda é
  // permanente e silenciosa. O catch DEVE rotear para routeToDeadLetter.
  const block = SOURCE.slice(SOURCE.indexOf("} catch (error: unknown)"));
  assertMatch(block, /routeToDeadLetter\(supabase,/);
  // DLQ antes do audit para não depender do sucesso do audit.
  assert(
    block.indexOf("routeToDeadLetter") < block.indexOf("auditWebhookEvent"),
    "routeToDeadLetter deve ser chamado antes de auditWebhookEvent",
  );
});

Deno.test("Auditoria: estados rejected/duplicate/processed/error presentes", () => {
  for (const s of ["'rejected'", "'duplicate'", "'processed'", "'error'"]) {
    assert(hasMarker(SOURCE, `status: ${s}`), `faltou status ${s}`);
  }
});

/**
 * Lista canônica de 28 eventos do webhook Evolution v2 (mantida em
 * `supabase/functions/_shared/evolution-sync-actions.ts` — `WEBHOOK_EVENTS`).
 * Aqui mapeamos para o formato `lower.dotted` que a Evolution envia no payload.
 *
 * Eventos marcados como `critical: true` são bloqueantes: se o roteador do
 * webhook não tratá-los, o teste falha (não é só "warning"). Os demais ainda
 * geram falha se ausentes — mas com mensagem distinta para facilitar triagem.
 */
const WEBHOOK_EVENTS_27: Array<{ name: string; critical: boolean }> = [
  // Lifecycle / conexão (críticos — sem eles a UI fica órfã)
  { name: 'application.startup', critical: true },
  { name: 'qrcode.updated', critical: true },
  { name: 'connection.update', critical: true },
  { name: 'logout.instance', critical: true },

  // Mensagens (todos críticos — pipeline principal)
  { name: 'messages.set', critical: true },
  { name: 'messages.upsert', critical: true },
  { name: 'messages.update', critical: true },
  { name: 'messages.delete', critical: true },
  { name: 'messages.edited', critical: true },
  { name: 'messages.reaction', critical: true },
  { name: 'send.message', critical: true },

  // Contatos
  { name: 'contacts.set', critical: true },
  { name: 'contacts.upsert', critical: true },
  { name: 'contacts.update', critical: true },

  // Presença
  { name: 'presence.update', critical: true },

  // Chats (críticos — incluem reset de unreadCount)
  { name: 'chats.set', critical: true },
  { name: 'chats.upsert', critical: true },
  { name: 'chats.update', critical: true },
  { name: 'chats.delete', critical: true },

  // Grupos
  { name: 'groups.upsert', critical: true },
  { name: 'group.update', critical: true },
  { name: 'group.participants.update', critical: true },

  // Labels
  { name: 'labels.edit', critical: false },
  { name: 'labels.association', critical: false },

  // Chamadas
  { name: 'call', critical: true },

  // Auth refresh
  { name: 'new.jwt.token', critical: false },

  // Typebot (integração opcional)
  { name: 'typebot.start', critical: false },
  { name: 'typebot.change-status', critical: false },
];

Deno.test("Roteamento: lista canônica tem exatamente 28 eventos", () => {
  assert(
    WEBHOOK_EVENTS_27.length === 28,
    `Esperado 28 eventos, encontrado ${WEBHOOK_EVENTS_27.length}. ` +
      `Se a Evolution adicionou/removeu eventos, atualize WEBHOOK_EVENTS em ` +
      `_shared/evolution-sync-actions.ts e este teste em conjunto.`,
  );
});

Deno.test("Roteamento: todos os eventos CRÍTICOS do contrato estão cobertos pelo roteador", () => {
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];

  for (const ev of WEBHOOK_EVENTS_27) {
    const found = SOURCE.includes(`'${ev.name}'`) || SOURCE.includes(`"${ev.name}"`);
    if (!found) {
      if (ev.critical) missingCritical.push(ev.name);
      else missingOptional.push(ev.name);
    }
  }

  // Críticos: falha imediata.
  assert(
    missingCritical.length === 0,
    `❌ EVENTOS CRÍTICOS sem roteamento no evolution-webhook: ${missingCritical.join(", ")}. ` +
      `Cada um quebra um caminho central do produto (mensagens/contatos/conexão). ` +
      `Adicione o handler antes de mergear.`,
  );

  // Opcionais: apenas log informativo (não falha) — são integrações que podem
  // ser ativadas posteriormente sem regredir o produto.
  if (missingOptional.length > 0) {
    console.info(
      `ℹ️  Eventos opcionais ainda não roteados (registrados na Evolution mas ` +
        `sem handler dedicado — caem no fallback genérico): ${missingOptional.join(", ")}`,
    );
  }
});

Deno.test("Roteamento: nenhum evento órfão (presente no código sem estar no contrato)", () => {
  // Captura literais 'foo.bar' no source que pareçam nomes de evento Evolution
  // (lowercase, com pelo menos um ponto). Filtra strings óbvias que não são
  // eventos (ex.: paths, mime types). É uma heurística — falsos positivos
  // legítimos podem ser adicionados em ALLOWLIST_NON_EVENTS abaixo.
  const ALLOWLIST_NON_EVENTS = new Set<string>([
    'group-participants.update', // alias legado aceito pelo roteador
    'messages.edit', // alias de messages.edited
    'contacts.update', // já em WEBHOOK_EVENTS_27 — mantido aqui só por simetria
  ]);

  const literalRe = /'([a-z]+(?:[.-][a-z]+)+)'/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(SOURCE)) !== null) {
    const lit = m[1];
    // Ignora coisas claramente não-evento.
    if (lit.includes('/') || lit.includes(':')) continue;
    if (lit.startsWith('http') || lit.startsWith('text.') || lit.startsWith('image.')) continue;
    found.add(lit);
  }

  const known = new Set(WEBHOOK_EVENTS_27.map((e) => e.name));
  const orphans: string[] = [];
  for (const lit of found) {
    if (known.has(lit) || ALLOWLIST_NON_EVENTS.has(lit)) continue;
    // Só consideramos "órfão" quando o literal aparece num contexto de
    // comparação de evento — heurística simples: precedido por `event === `
    // ou `event ==` na mesma linha do source.
    const idx = SOURCE.indexOf(`'${lit}'`);
    const lineStart = SOURCE.lastIndexOf('\n', idx);
    const line = SOURCE.slice(lineStart, idx);
    if (/event\s*===?\s*$/.test(line)) orphans.push(lit);
  }

  assert(
    orphans.length === 0,
    `Eventos roteados mas NÃO listados no contrato dos 27: ${orphans.join(", ")}. ` +
      `Adicione-os em WEBHOOK_EVENTS_27 (agora 28 entradas) + WEBHOOK_EVENTS ou remova do roteador.`,
  );
});

Deno.test("Privacidade: redactJid usado em logs de mensagens", () => {
  assertMatch(SOURCE, /redactJid\(key\.remoteJid\)/);
});

Deno.test("LGPD: apikey redigida do payload persistido (TRILHA BRUTA)", () => {
  // Bloco da trilha bruta: do marcador até o catch que loga falha de persistência.
  const block = SOURCE.slice(
    SOURCE.lastIndexOf("TRILHA BRUTA"),
    SOURCE.indexOf("payload persist failed"),
  );
  // A redação acontece ANTES do update que persiste o payload.
  const delIdx = block.indexOf("delete rawJson.apikey");
  const updIdx = block.indexOf("update({ payload: rawJson })");
  assert(delIdx > 0, "delete rawJson.apikey deve existir no bloco TRILHA BRUTA");
  assert(delIdx < updIdx, "apikey deve ser removida ANTES do update({ payload: rawJson })");
  // Nenhuma outra chave do envelope é deletada (data/event/instance/date_time/
  // server_url preservadas — server_url é URL pública, não é segredo).
  const deletes = block.match(/delete\s+rawJson\.(\w+)/g) ?? [];
  assert(
    deletes.length === 1 && deletes[0] === "delete rawJson.apikey",
    `Apenas apikey pode ser deletada do envelope; encontrado: ${deletes.join(", ")}`,
  );
});

Deno.test("Observabilidade: requestId em todas as respostas", () => {
  assertMatch(SOURCE, /generateRequestId\(\)/);
  assertMatch(SOURCE, /'x-request-id': requestId/);
});

Deno.test("[PATCH 24] Whitelist compartilhada: EVO_EVENT_TYPES tem exatamente 18 entradas (paridade consumer.py:59-63)", () => {
  assertMatch(SOURCE, /EVO_EVENT_TYPES_SET\.has\(event\)/);
  assertMatch(SOURCE, /event_type_not_in_whitelist/);
  assertMatch(SOURCE, /webhookSource === 'consumer'/);
});

// Auth rejects (401/503) NÃO gravam no ledger por design: ingest-loss-alert (job 338)
// conta outcome='rejected' como perda — HMAC inválido de scanners daria falso alarme.
// Cobertura desses casos: webhook_audit_log + auto-pause.
Deno.test("[PATCH 23] Ledger: outcome 'rejected' + reject_reason em todos os descartes", async () => {
  const HELPERS_SOURCE = await Deno.readTextFile(
    new URL("../../_shared/evolution-helpers.ts", import.meta.url),
  );
  assertMatch(HELPERS_SOURCE, /outcome: 'rejected'/);
  assertMatch(HELPERS_SOURCE, /reject_reason:/);
  assertMatch(SOURCE, /logLedgerRejection\(/);
  for (const r of ['contract_violation', 'invalid_json',
                   'instance_paused', 'unknown_instance', 'rate_limit_exceeded', 'missing_message_id',
                   'entry_error', 'handler_error', 'unsupported_message_type', 'event_type_not_in_whitelist']) {
    assert(hasMarker(SOURCE, r), `faltou reject_reason ${r}`);
  }
});

Deno.test("[PATCH 28] message_type normalizado no ledger: conversation→text", async () => {
  assertMatch(SOURCE, /EVO_PROTOBUF_MESSAGE_TYPE_MAP/);
  assertMatch(SOURCE, /\?\? 'unknown'/); // default 'unknown', não 'text' (não mascarar)
  const MAP_SOURCE = await Deno.readTextFile(
    new URL("../../_shared/evolution-event-types.ts", import.meta.url),
  );
  assertMatch(MAP_SOURCE, /conversation: 'text'/);
  assertMatch(MAP_SOURCE, /EVO_EVENT_TYPES/);
});

Deno.test("[P25] Ledger processed: INSERT via createIngestLedgerClient com outcome 'processed'/'processed_reaction' e message_type normalizado (conversation→text)", async () => {
  const procBlock = SOURCE.slice(SOURCE.indexOf("createIngestLedgerClient().from('ingest_ledger').insert"));
  assertMatch(procBlock, /outcome: 'processed'/);
  assertMatch(procBlock, /message_type: mtype/);
  assertMatch(SOURCE, /outcome: 'processed_reaction'/);
  assertMatch(procBlock, /EVO_PROTOBUF_MESSAGE_TYPE_MAP\[Object\.keys\(msgObj\)\[0\] as string\] \?\? 'unknown'/);
  const HELPERS_SOURCE = await Deno.readTextFile(
    new URL("../../_shared/evolution-helpers.ts", import.meta.url),
  );
  assertMatch(HELPERS_SOURCE, /export function createIngestLedgerClient\(\): any/);
  assertMatch(HELPERS_SOURCE, /db: \{ schema: "public" \}/);
});

Deno.test("[P26] Ledger rejected: logLedgerRejection reusa o client public (createIngestLedgerClient) e nunca lança", async () => {
  const HELPERS_SOURCE = await Deno.readTextFile(
    new URL("../../_shared/evolution-helpers.ts", import.meta.url),
  );
  assertMatch(HELPERS_SOURCE, /const pub = createIngestLedgerClient\(\);/);
  const insBlock = HELPERS_SOURCE.slice(HELPERS_SOURCE.indexOf("pub.from('ingest_ledger').insert"));
  assertMatch(insBlock, /outcome: 'rejected'/);
  assertMatch(insBlock, /reject_reason: opts\.rejectReason/);
  assertMatch(HELPERS_SOURCE, /\[ingest_ledger\] rejected err:/);
  assertMatch(HELPERS_SOURCE, /\[ingest_ledger\] rejected exception:/);
  assert(!/throw/.test(HELPERS_SOURCE.slice(HELPERS_SOURCE.indexOf("export function logLedgerRejection"), HELPERS_SOURCE.indexOf("export async function markEventProcessed"))), "logLedgerRejection não pode lançar");
});

Deno.test("[P27] Whitelist: gate 24 bloqueia SÓ proveniência 'consumer' (HMAC válido), 200 ignored, ANTES do pause/idempotência", () => {
  assertMatch(SOURCE, /let webhookSource: 'consumer' \| 'evolution-native' = 'evolution-native'/);
  assertMatch(SOURCE, /webhookSource = 'consumer'/);
  const gate = SOURCE.slice(SOURCE.indexOf("webhookSource === 'consumer' && !EVO_EVENT_TYPES_SET.has(event)"));
  assertMatch(gate, /event_type_not_in_whitelist/);
  assertMatch(gate, /status_code: 200/);
  assertMatch(gate, /success: true, ignored: true/);
  assertMatch(gate, /logLedgerRejection\(supabase, \{/);
  assert(SOURCE.indexOf("EVO_EVENT_TYPES_SET.has(event)") < SOURCE.indexOf("isInstancePaused(supabase, instance)"), "gate 24 deve vir antes do pause guard");
  assert(SOURCE.indexOf("EVO_EVENT_TYPES_SET.has(event)") < SOURCE.indexOf("markEventProcessed(supabase, eventId"), "gate 24 deve vir antes da idempotência");
});

Deno.test("[P28] Ledger: falha do INSERT (400/404/PGRST106) NUNCA quebra o request — fire-and-forget, sem await", () => {
  const procBlock = SOURCE.slice(SOURCE.indexOf("createIngestLedgerClient().from('ingest_ledger').insert"));
  assertMatch(procBlock, /\.then\(\(\) => \{\}, \(e: unknown\) => console\.warn\('\[ingest_ledger\] msg err:/);
  assertMatch(procBlock, /\[ingest_ledger\] reaction err:/);
  assert(!/await\s+createIngestLedgerClient\(\)/.test(SOURCE), "INSERT do ledger não pode ser aguardado (fire-and-forget)");
});

// [P29] Hotfix (auditoria multi-agente 2026-08-21, Bloco 5.1): as respostas
// 503 'instance_paused' e 429 'rate_limit_exceeded' são pós-gate (depois de
// contractResponseHeaders = parsed.headers) mas montavam os headers na mão
// sem espalhar ...contractResponseHeaders — único par de branches do arquivo
// que escapava do padrão seguido pelas outras 5 respostas pós-gate. Cliente
// v1 em sunset pausado/rate-limitado nunca via x-contract-deprecated/sunset.
Deno.test("[P29] instance_paused (503) e rate_limit_exceeded (429) propagam contractResponseHeaders", () => {
  const pausedBlock = SOURCE.slice(
    SOURCE.indexOf("is paused — skipping event"),
    SOURCE.indexOf("is paused — skipping event") + 400,
  );
  assertMatch(pausedBlock, /status: 503, headers: \{ \.\.\.corsHeaders, \.\.\.contractResponseHeaders, 'Retry-After': '60' \}/);

  const rateLimitBlock = SOURCE.slice(
    SOURCE.indexOf("error: 'rate_limit_exceeded', instance, requestId"),
    SOURCE.indexOf("error: 'rate_limit_exceeded', instance, requestId") + 200,
  );
  assertMatch(rateLimitBlock, /status: 429, headers: \{ \.\.\.corsHeaders, \.\.\.contractResponseHeaders, 'Retry-After': String\(retryAfterSeconds\) \}/);
});
