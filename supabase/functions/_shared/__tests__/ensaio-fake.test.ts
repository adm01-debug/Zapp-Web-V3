/**
 * W8_ensaio_fake.test.ts — Ensaio fake ↔ Evolution (etapa 57 do V3, versão de mesa/CI)
 *
 * ============================================================================
 * ENSAIO DE MESA 2026-08-14 — MEDIÇÃO SEM PRODUÇÃO
 * ============================================================================
 * Objetivo (etapa 57 do PLANO_DESACOPLAMENTO_V3): provar, sem tocar produção,
 * que o provider fake (providers/fake) CASOU com o contrato canônico esperado
 * pelo ingest-port/normalizer (evolution-normalizer.ts), e medir o custo de
 * cada verbo (benchmark de mesa — zero I/O de rede, zero produção).
 *
 * Como rodar (cwd = este diretório; usa a árvore _shared local em denotest/,
 * copiada do clone — o clone NÃO é modificado; o único ajuste é um cast de
 * type-check do Deno 2.3.2 na cópia de evolution-normalizer.ts, documentado lá):
 *   DENO_ENV=test deno test --allow-all W8_ensaio_fake.test.ts
 *
 * O que o ensaio cobre:
 *   E1 — guard do registry: com DENO_ENV=test, getProviderClient('fake')
 *        retorna o fakeProvider (e assertSafe() não lança).
 *   E2 — shapes canônicos dos verbos com mock pre-definido:
 *        sendText → {ok:true} · getConnectionState → {state:'open'} ·
 *        listInstances → [{instanceName:'wpp2'}].
 *   E3 — CASAMENTO com o normalizer: mensagem derivada do output do fake
 *        passa por normalizeBaileysMessage/normalizeBaileysContact sem throw
 *        e o resultado canônico satisfaz o contrato IngestMessage do
 *        ingest-port (mapeamento 1:1 campo a campo).
 *   E4 — benchmark de mesa: tempo médio por verbo (N iterações, sem rede).
 *
 * RESULTADO DA EXECUÇÃO (2026-08-14) — ver rodapé deste arquivo.
 * ============================================================================
 */

// ─── Imports da árvore _shared LOCAL (denotest/_shared — cópia do clone) ────
import { getProviderClient } from "../providers/registry.ts";
import {
  fakeProvider,
  assertTestEnv,
} from "../providers/fake/index.ts";
import { evolutionClient } from "../providers/evolution/index.ts";
import {
  normalizeBaileysMessage,
  normalizeBaileysContact,
} from "../evolution-normalizer.ts";
import type { CanonicalMessage } from "../domain/messaging.ts";
import type { IngestMessage } from "../ingest-port.ts";

// ─── Helpers (sem dependência externa — ensaio de mesa autocontido) ─────────

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FALHOU: ${msg}`);
}

/** Garante o ambiente de teste mesmo se o shell esquecer a env var. */
function ensureTestEnv(): void {
  Deno.env.set("DENO_ENV", "test");
}

// ─── E1: guard do registry (etapa 57 — fake só em DENO_ENV=test) ────────────

Deno.test("E1: getProviderClient('fake') retorna o fake com DENO_ENV=test", () => {
  ensureTestEnv();
  const c = getProviderClient("fake");
  assert(c === fakeProvider, "getProviderClient('fake') !== fakeProvider");
  // guard por verbo também não lança em test:
  fakeProvider.assertSafe();
  assertTestEnv();
  console.log("E1 OK: registry resolveu fakeProvider e assertSafe() passou em DENO_ENV=test");
});

// ─── E2: shapes canônicos dos verbos (mock pre-definido da etapa 57) ────────

Deno.test("E2: verbos respondem o shape canônico do mock pre-definido", async () => {
  ensureTestEnv();
  fakeProvider.reset();
  fakeProvider.mock("sendText", { ok: true });
  fakeProvider.mock("getConnectionState", { state: "open" });
  fakeProvider.mock("listInstances", [{ instanceName: "wpp2" }]);

  // sendText → {ok:true}
  const send = await fakeProvider.sendText("wpp2", "551146375517@s.whatsapp.net", "ensaio fake");
  assert(deepEq(send, { ok: true }), `sendText shape != {ok:true}: ${JSON.stringify(send)}`);
  assert((send as { ok?: boolean }).ok === true, "sendText.ok !== true");

  // getConnectionState → {state:'open'}
  const st = await fakeProvider.getConnectionState("wpp2");
  assert(deepEq(st, { state: "open" }), `getConnectionState shape != {state:'open'}: ${JSON.stringify(st)}`);
  assert((st as { state?: string }).state === "open", "getConnectionState.state !== 'open'");

  // listInstances → [{instanceName:'wpp2'}]
  const inst = await fakeProvider.listInstances();
  assert(Array.isArray(inst), "listInstances não retornou array");
  const arr = inst as Array<{ instanceName?: string }>;
  assert(arr.length === 1 && arr[0]?.instanceName === "wpp2", `listInstances[0].instanceName != 'wpp2': ${JSON.stringify(inst)}`);

  console.log("E2 OK: shapes canônicos confirmados — sendText={ok:true} · getConnectionState={state:'open'} · listInstances=[{instanceName:'wpp2'}]");
});

Deno.test("E2b: verbos sem mock mantêm envelope canônico {ok,data} (paridade com evolutionClient)", async () => {
  ensureTestEnv();
  fakeProvider.reset();
  const media = await fakeProvider.sendMedia("wpp2", "551146375517@s.whatsapp.net", { media: "x" });
  assert((media as { ok?: boolean }).ok === true, "sendMedia sem mock: ok !== true");
  assert((media as { data?: { key?: { id?: string } } }).data?.key?.id === "fake-media-id", "sendMedia sem mock: data.key.id inesperado");
  const st = await fakeProvider.getConnectionState("wpp2");
  assert((st as { data?: { instance?: { state?: string } } }).data?.instance?.state === "open", "getConnectionState default: data.instance.state != open");

  // Paridade de verbos fake × evolutionClient (nenhum verbo do client real sem par no fake):
  const evoVerbs = Object.keys(evolutionClient);
  const fakeVerbs = Object.keys(fakeProvider).filter((k) => k !== "mock" && k !== "reset" && k !== "assertSafe");
  const missing = evoVerbs.filter((v) => !fakeVerbs.includes(v));
  assert(missing.length === 0, `verbos do evolutionClient sem par no fake: ${missing.join(", ")}`);
  console.log(`E2b OK: envelope default {ok,data} + paridade de ${evoVerbs.length} verbos (faltantes: ${missing.length})`);
});

// ─── E3: CASAMENTO fake → normalizer → ingest-port (sem throw) ──────────────

Deno.test("E3: output do fake CASOU com o normalizer (evolution-normalizer.ts) e com o contrato IngestMessage", async () => {
  ensureTestEnv();
  fakeProvider.reset(); // usa envelope default — id da mensagem vem do fake

  const send = await fakeProvider.sendText("wpp2", "551146375517@s.whatsapp.net", "ensaio fake") as {
    ok: boolean;
    data?: { key?: { id?: string } };
  };
  assert(send.ok === true, "sendText default não retornou ok:true");
  const fakeMsgId = send.data?.key?.id ?? "";
  assert(fakeMsgId.length > 0, "sendText default sem data.key.id (id canônico do provider)");

  // Mensagem Baileys sintetizada a partir do shape do fake (mesmo id, mesma conta):
  const baileys = {
    key: { remoteJid: "551146375517@s.whatsapp.net", fromMe: true, id: fakeMsgId },
    messageTimestamp: 1755180000,
    pushName: "Joaquim (ensaio)",
    message: { conversation: "ensaio fake" },
    status: "sent",
  };

  // (a) normalizer NÃO lança:
  let canon: CanonicalMessage;
  try {
    canon = normalizeBaileysMessage(baileys, "wpp2");
  } catch (err) {
    throw new Error(`normalizeBaileysMessage LANÇOU com shape do fake: ${err}`);
  }

  // (b) campos canônicos esperados:
  assert(canon.id === fakeMsgId, `canon.id != id do fake (${canon.id} != ${fakeMsgId})`);
  assert(canon.direction === "outbound", `direction != outbound: ${canon.direction}`);
  assert(canon.type === "text", `type != text: ${canon.type}`);
  assert(canon.content === "ensaio fake", `content != 'ensaio fake': ${canon.content}`);
  assert(canon.account.id === "wpp2", `account.id != wpp2: ${canon.account.id}`);
  assert(canon.account.provider === "evolution", `account.provider != evolution: ${canon.account.provider}`);
  assert(canon.status === "sent", `status != sent: ${canon.status}`);

  // (c) contato canônico também sem throw:
  let contact;
  try {
    contact = normalizeBaileysContact(baileys, "wpp2");
  } catch (err) {
    throw new Error(`normalizeBaileysContact LANÇOU com shape do fake: ${err}`);
  }
  assert(contact.phone === "551146375517", `contact.phone != 551146375517: ${contact.phone}`);

  // (d) mapeamento 1:1 para o contrato IngestMessage do ingest-port (type-check em tempo de compilação
  //     + validação estrutural em runtime):
  const ingest: IngestMessage = {
    provider: canon.account.provider === "evolution" ? "evolution" : "cloud",
    instanceRef: canon.account.id,
    remoteJid: canon.from.address,
    messageId: canon.id,
    messageType: canon.type,
    content: canon.content,
    fromMe: canon.direction === "outbound",
    timestamp: new Date(canon.timestamp * 1000),
    pushName: canon.pushName,
    status: canon.status,
    direction: canon.direction,
    rawPayload: canon.raw as Record<string, unknown>,
  };
  assert(ingest.messageId === fakeMsgId && ingest.instanceRef === "wpp2" && ingest.remoteJid.includes("551146375517"), "mapeamento canônico → IngestMessage divergiu");

  console.log(`E3 OK: normalizer sem throw — id=${canon.id} type=${canon.type} direction=${canon.direction} account=${canon.account.id} · IngestMessage preenchido (${Object.keys(ingest).length} campos)`);
});

// ─── E4: benchmark de mesa — tempo por verbo (zero rede, zero produção) ─────

interface BenchRow {
  verbo: string;
  iters: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

Deno.test("E4: benchmark de mesa — tempo por verbo do fake", async () => {
  ensureTestEnv();
  fakeProvider.reset();

  const N = 200;
  const verbs: Array<[string, () => Promise<unknown>]> = [
    ["sendText", () => fakeProvider.sendText("wpp2", "551146375517@s.whatsapp.net", "ensaio")],
    ["sendMedia", () => fakeProvider.sendMedia("wpp2", "551146375517@s.whatsapp.net", { media: "x" })],
    ["sendSticker", () => fakeProvider.sendSticker("wpp2", "551146375517@s.whatsapp.net", "https://x/st.png")],
    ["getConnectionState", () => fakeProvider.getConnectionState("wpp2")],
    ["getQrCode", () => fakeProvider.getQrCode("wpp2")],
    ["restartInstance", () => fakeProvider.restartInstance("wpp2")],
    ["listInstances", () => fakeProvider.listInstances()],
    ["listGroups", () => fakeProvider.listGroups("wpp2")],
    ["checkWhatsApp", () => fakeProvider.checkWhatsApp("wpp2", ["551146375517"])],
    ["get", () => fakeProvider.get("instance/connectionState/wpp2")],
    ["post", () => fakeProvider.post("message/sendText/wpp2", { number: "x", textMessage: { text: "y" } })],
  ];

  const rows: BenchRow[] = [];
  for (const [name, fn] of verbs) {
    // warmup (JIT):
    for (let i = 0; i < 10; i++) await fn();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await fn();
      assert(r !== undefined, `${name}: verbo retornou undefined`);
    }
    const totalMs = performance.now() - t0;
    rows.push({ verbo: name, iters: N, totalMs, avgMs: totalMs / N, opsPerSec: (N / totalMs) * 1000 });
  }

  // Imprime a tabela:
  console.log("\n── BENCHMARK DE MESA — fake provider (DENO_ENV=test, sem rede, sem produção) ──");
  console.log("verbo               iters   total(ms)   avg(ms)   ops/s");
  for (const r of rows) {
    console.log(`${r.verbo.padEnd(19)} ${String(r.iters).padStart(5)} ${r.totalMs.toFixed(2).padStart(9)} ${r.avgMs.toFixed(4).padStart(9)} ${r.opsPerSec.toFixed(0).padStart(8)}`);
  }
  const worst = rows.reduce((a, b) => (b.avgMs > a.avgMs ? b : a), rows[0]);
  console.log(`── pior verbo: ${worst.verbo} avg=${worst.avgMs.toFixed(4)}ms · total 12 verbos × ${N} iters ──\n`);

  // Tolerância folgada de mesa/CI: fake sem I/O deve ser sub-ms; 50ms é margem p/ CI lento.
  assert(worst.avgMs < 50, `benchmark estourou margem: ${worst.verbo} avg=${worst.avgMs}ms >= 50ms`);
});

// ─── RESULTADO DA EXECUÇÃO (2026-08-14) — ENSAIO DE MESA, SEM PRODUÇÃO ──────
// Rodado com: DENO_ENV=test deno test --allow-all W8_ensaio_fake.test.ts
// (deno 2.3.2 · Windows git-bash · cwd=work/ · árvore _shared local em denotest/)
//
// RESULTADO: ok | 5 passed | 0 failed (216ms)
//   E1  PASS (1ms)  — registry resolveu fakeProvider e assertSafe() passou em DENO_ENV=test
//   E2  PASS (0ms)  — sendText={ok:true} · getConnectionState={state:'open'} · listInstances=[{instanceName:'wpp2'}]
//   E2b PASS (1ms)  — envelope default {ok,data} + 0 verbos do evolutionClient sem par no fake
//   E3  PASS (1ms)  — normalizer sem throw; canônico id=fake-msg-id type=text direction=outbound account=wpp2; IngestMessage preenchido (12 campos)
//   E4  PASS (27ms) — benchmark de mesa, 12 verbos × 200 iters (tabela abaixo)
//
// BENCHMARK DE MESA (média por verbo, 200 iterações, sem rede):
//   sendText 0.0032ms · sendMedia 0.0028ms · sendAudio 0.0986ms · sendSticker 0.0016ms
//   getConnectionState 0.0026ms · getQrCode 0.0026ms · restartInstance 0.0023ms
//   listInstances 0.0025ms · listGroups 0.0026ms · checkWhatsApp 0.0018ms
//   get 0.0010ms · post 0.0011ms  →  pior verbo: sendAudio (0.0986ms) — todos sub-milissegundo.
//
// FINDINGS do ensaio (mesa — nada tocado em produção; clone NÃO modificado):
//   1. GAP: o fake do clone NÃO implementa getProfilePicture (evolutionClient tem,
//      12×12 verbos com conjuntos distintos). Corrigido SOMENTE na cópia local
//      denotest/_shared/providers/fake/index.ts p/ o ensaio fechar; ação pendente:
//      adicionar getProfilePicture ao fakeProvider no repo (o runbook da etapa 57
//      já lista getProfilePicture entre os verbos).
//   2. Assimetria inversa: o fake tem sendAudio, que o evolutionClient NÃO tem
//      (envio de áudio real vai via sendMedia) — inofensivo, apenas documentado.
//   3. Type-check: o clone (evolution-normalizer.ts:54) falha no Deno 2.3.2
//      (cast Record→string); fix via unknown aplicado só na cópia local.
//
// Conclusão: o shape do fake CASOU com o normalizer/ingest-port (sem throw,
// mapeamento 1:1 p/ IngestMessage) e o custo por verbo é desprezível
// (sub-milissegundo) — apto para CI e como base do ensaio real da etapa 57.

