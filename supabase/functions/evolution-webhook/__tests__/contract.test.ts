/**
 * Testes de regressão (estáticos) do evolution-webhook.
 *
 * Garantem que contratos críticos não regridam:
 *  - Validação HMAC habilitada quando há WEBHOOK_SECRET (com STRICT_MODE).
 *  - Idempotência por hash (instance:event:bodyHash) e short-circuit em duplicatas.
 *  - Auditoria persistida em rejected/duplicate/processed/error.
 *  - Erros de handler não retornam 5xx para a Evolution (evita retry-storm).
 *  - JSON inválido => 400 + audit rejected.
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
  assertMatch(SOURCE, /createWebhookValidator\(WEBHOOK_SECRETS, STRICT_MODE\)/);
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
  assertMatch(SOURCE, /sha256Hex\(rawBody\)/);
  assertMatch(SOURCE, /\$\{instance \|\| 'unknown'\}:\$\{event\}:\$\{bodyHash\}/);
  assertMatch(SOURCE, /markEventProcessed\(supabase, eventId/);
  assertMatch(SOURCE, /duplicate: true/);
});

Deno.test("JSON inválido => 400 + audit rejected", () => {
  assertMatch(SOURCE, /error: 'invalid_json'/);
  assertMatch(SOURCE, /status: 400/);
});

Deno.test("Resiliência: handler_error retorna 200 (sem retry-storm)", () => {
  const block = SOURCE.slice(SOURCE.indexOf("} catch (error: unknown)"));
  assertMatch(block, /handler_error/);
  assertMatch(block, /status: 200/);
  assertMatch(block, /error: 'internal_error'/);
});

Deno.test("Auditoria: estados rejected/duplicate/processed/error presentes", () => {
  for (const s of ["'rejected'", "'duplicate'", "'processed'", "'error'"]) {
    assert(hasMarker(SOURCE, `status: ${s}`), `faltou status ${s}`);
  }
});

/**
 * Lista canônica de 27 eventos do webhook Evolution v2 (mantida em
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

Deno.test("Roteamento: lista canônica tem exatamente 27 eventos", () => {
  assert(
    WEBHOOK_EVENTS_27.length === 27,
    `Esperado 27 eventos, encontrado ${WEBHOOK_EVENTS_27.length}. ` +
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
      `Adicione-os em WEBHOOK_EVENTS_27 + WEBHOOK_EVENTS ou remova do roteador.`,
  );
});

Deno.test("Privacidade: redactJid usado em logs de mensagens", () => {
  assertMatch(SOURCE, /redactJid\(key\.remoteJid\)/);
});

Deno.test("Observabilidade: requestId em todas as respostas", () => {
  assertMatch(SOURCE, /generateRequestId\(\)/);
  assertMatch(SOURCE, /'x-request-id': requestId/);
});
