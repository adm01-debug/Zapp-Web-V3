/**
 * ensaio-f5-operacional.test.ts — Ensaio cronometrado OPERACIONAL
 * (Plano V4-FINAL, etapas 53-62; docs/decouple/ENSAIO_F5_OPERACIONAL_20260815.md)
 *
 * ============================================================================
 * Divisão de cobertura (ver docs/decouple/ENSAIO_V4_LOG.md):
 *   - O ensaio DE MESA (`ensaio-fake.test.ts`, PR #1082) já valida o CONTRATO:
 *     guard do registry, shapes canônicos com mocks pontuais, casamento com o
 *     normalizer, benchmark de 12 verbos. NÃO repetido aqui.
 *   - Este ensaio OPERACIONAL mede o que o de mesa não mede:
 *       (a) tempo de RESOLUÇÃO do provider via registry (evolution→fake→evolution),
 *       (b) tempo por verbo com validação de shape via o MESMO contrato Zod
 *           (evolutionGatewayContract) usado pelo gateway real — não apenas
 *           igualdade estrutural manual,
 *       (c) rollback cronometrado com prova de IDENTIDADE (===) contra o
 *           client baseline — mais forte que comparação de shape,
 *       (d) degradação forçada (fake retorna erro) documentada.
 *   - DENO_ENV=test, ZERO rede: evolutionClient NUNCA é chamado (só resolvido
 *     e comparado por identidade/estrutura) — nenhum I/O real acontece.
 * ============================================================================
 */

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { getProviderClient } from "../providers/registry.ts";
import { fakeProvider } from "../providers/fake/index.ts";
import { evolutionClient } from "../providers/evolution/index.ts";
import { evolutionGatewayContract, type EvolutionGatewayVerb } from "../providers/evolution/contract.zod.ts";

function ensureTestEnv(): void {
  Deno.env.set("DENO_ENV", "test");
}
function setProviderUnderTest(v: string | undefined): void {
  if (v === undefined) Deno.env.delete("PROVIDER_UNDER_TEST");
  else Deno.env.set("PROVIDER_UNDER_TEST", v);
}

// ─── F5-1: tempo de resolução do provider — evolution → fake → evolution ────

interface ResolutionRow {
  passo: string;
  resolvedTo: string;
  ms: number;
}
const resolutionRows: ResolutionRow[] = [];

Deno.test("F5-1: tempo de resolução do provider (evolution baseline → fake → evolution rollback)", () => {
  ensureTestEnv();
  setProviderUnderTest(undefined);

  // Baseline: sem PROVIDER_UNDER_TEST, registry resolve o evolution real.
  let t0 = performance.now();
  const baseline = getProviderClient();
  const tBaseline = performance.now() - t0;
  assertStrictEquals(baseline, evolutionClient, "baseline deveria resolver evolutionClient");
  resolutionRows.push({ passo: "1. baseline (evolution)", resolvedTo: "evolution", ms: tBaseline });

  // Troca: PROVIDER_UNDER_TEST=fake → registry resolve o fakeProvider.
  setProviderUnderTest("fake");
  t0 = performance.now();
  const swapped = getProviderClient();
  const tSwap = performance.now() - t0;
  assertStrictEquals(swapped, fakeProvider, "troca deveria resolver fakeProvider");
  resolutionRows.push({ passo: "2. troca (evolution→fake)", resolvedTo: "fake", ms: tSwap });

  // Rollback: remove a flag → registry volta a resolver o evolution real.
  setProviderUnderTest(undefined);
  t0 = performance.now();
  const rolledBack = getProviderClient();
  const tRollback = performance.now() - t0;
  assertStrictEquals(rolledBack, evolutionClient, "rollback deveria resolver evolutionClient");
  // Prova mais forte que "shape igual": é o MESMO objeto do baseline (===).
  assertStrictEquals(rolledBack, baseline, "rollback deveria ser IDÊNTICO (===) ao client baseline");
  resolutionRows.push({ passo: "3. rollback (fake→evolution)", resolvedTo: "evolution", ms: tRollback });

  console.log("\n── F5-1: RESOLUÇÃO DO PROVIDER (registry.getProviderClient) ──");
  console.log("passo                          resolveu     tempo(ms)");
  for (const r of resolutionRows) {
    console.log(`${r.passo.padEnd(30)} ${r.resolvedTo.padEnd(10)} ${r.ms.toFixed(4).padStart(10)}`);
  }
  console.log("rollback === baseline (identidade de objeto, não apenas shape): true\n");
});

// ─── F5-2: tempo por verbo (12) + validação de shape canônico (Zod real) ────

interface VerbRow {
  verbo: EvolutionGatewayVerb;
  ms: number;
  contrato: "PASS" | "FAIL";
  issues?: string;
}
const verbRows: VerbRow[] = [];

Deno.test("F5-2: troca evolution→fake — 12 verbos medidos e validados contra o contrato Zod real", async () => {
  ensureTestEnv();
  setProviderUnderTest("fake");
  const provider = getProviderClient();
  assertStrictEquals(provider, fakeProvider);

  fakeProvider.reset();
  // Payloads conformes ao contrato real (evolutionGatewayContract) — mesmas
  // formas documentadas em contract-fixtures.test.ts (v2.3.x real).
  fakeProvider.mock("sendText", { ok: true, data: { key: { id: "ensaio-send-id", fromMe: true } } });
  fakeProvider.mock("sendMedia", { ok: true, data: { key: { id: "ensaio-media-id" } } });
  fakeProvider.mock("sendSticker", { ok: true, data: { key: { id: "ensaio-sticker-id" } } });
  fakeProvider.mock("getConnectionState", { ok: true, data: { instance: { state: "open" } } });
  fakeProvider.mock("getQrCode", { ok: true, data: { base64: "data:image/png;base64,AA==", code: "QR-ABC", count: 1 } });
  fakeProvider.mock("restartInstance", { ok: true, data: { restart: true } });
  fakeProvider.mock("listInstances", { ok: true, data: [{ instance: { instanceName: "wpp2", state: "open" } }] });
  fakeProvider.mock("listGroups", { ok: true, data: [] });
  fakeProvider.mock("checkWhatsApp", { ok: true, data: [{ exists: true, jid: "5511999999999@s.whatsapp.net" }] });
  fakeProvider.mock("getProfilePicture", { ok: true, data: { profilePictureUrl: "https://example.invalid/pic.jpg" } });
  fakeProvider.mock("get", { ok: true, data: { instance: { state: "open" } } });
  fakeProvider.mock("post", { ok: true, data: { key: { id: "ensaio-post-id" } } });

  const calls: Array<[EvolutionGatewayVerb, () => Promise<unknown>]> = [
    ["sendText", () => fakeProvider.sendText("wpp2", "5511999999999@s.whatsapp.net", "ensaio F5")],
    ["sendMedia", () => fakeProvider.sendMedia("wpp2", "5511999999999@s.whatsapp.net", { media: "x" })],
    ["sendSticker", () => fakeProvider.sendSticker("wpp2", "5511999999999@s.whatsapp.net", "https://x/st.png")],
    ["getConnectionState", () => fakeProvider.getConnectionState("wpp2")],
    ["getQrCode", () => fakeProvider.getQrCode("wpp2")],
    ["restartInstance", () => fakeProvider.restartInstance("wpp2")],
    ["listInstances", () => fakeProvider.listInstances()],
    ["listGroups", () => fakeProvider.listGroups("wpp2")],
    ["checkWhatsApp", () => fakeProvider.checkWhatsApp("wpp2", ["5511999999999"])],
    ["getProfilePicture", () => fakeProvider.getProfilePicture("wpp2", "5511999999999")],
    ["get", () => fakeProvider.get("instance/connectionState/wpp2")],
    ["post", () => fakeProvider.post("message/sendText/wpp2", { number: "x", textMessage: { text: "y" } })],
  ];

  for (const [verb, fn] of calls) {
    const t0 = performance.now();
    const res = await fn() as { ok: boolean; data?: unknown };
    const ms = performance.now() - t0;
    assert(res.ok === true, `${verb}: esperava ok:true, recebeu ${JSON.stringify(res)}`);

    const result = evolutionGatewayContract[verb].response.safeParse(res.data);
    verbRows.push({
      verbo: verb,
      ms,
      contrato: result.success ? "PASS" : "FAIL",
      issues: result.success ? undefined : result.error.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(", "),
    });
  }

  console.log("\n── F5-2: TEMPO POR VERBO + VALIDAÇÃO DE SHAPE CANÔNICO (contrato Zod real) ──");
  console.log("verbo               tempo(ms)   contrato");
  for (const r of verbRows) {
    console.log(`${r.verbo.padEnd(19)} ${r.ms.toFixed(4).padStart(9)}   ${r.contrato}${r.issues ? ` (${r.issues})` : ""}`);
  }
  const totalMs = verbRows.reduce((acc, r) => acc + r.ms, 0);
  const worst = verbRows.reduce((a, b) => (b.ms > a.ms ? b : a), verbRows[0]);
  console.log(`total 12 verbos: ${totalMs.toFixed(4)}ms · pior verbo: ${worst.verbo} (${worst.ms.toFixed(4)}ms)\n`);

  const failures = verbRows.filter((r) => r.contrato === "FAIL");
  assertEquals(failures.length, 0, `verbos fora do contrato: ${failures.map((f) => f.verbo).join(", ")}`);

  fakeProvider.reset();
});

// ─── F5-3: degradação forçada — fake retorna erro, comportamento documentado ─

Deno.test("F5-3: degradação — fake força erro em sendText, chamador recebe erro explícito (sem exceção não tratada)", async () => {
  ensureTestEnv();
  setProviderUnderTest("fake");
  fakeProvider.reset();
  fakeProvider.mock("sendText", { ok: false, status: 500, error: "ensaio F5: erro forçado" });

  const res = await fakeProvider.sendText("wpp2", "5511999999999@s.whatsapp.net", "vai falhar") as {
    ok: boolean;
    status?: number;
    error?: string;
  };

  assertEquals(res.ok, false, "degradação deveria retornar ok:false");
  assertEquals(res.error, "ensaio F5: erro forçado");
  console.log(`\n── F5-3: degradação — sendText retornou ok:false, error="${res.error}" (sem throw) ──\n`);

  fakeProvider.reset();
});

// ─── F5-4: rollback — prova estrutural adicional (paridade de verbos intacta) ─

Deno.test("F5-4: rollback — evolutionClient pós-troca tem os mesmos 12 verbos do baseline (sem drift estrutural)", () => {
  ensureTestEnv();
  setProviderUnderTest("fake");
  getProviderClient(); // troca
  setProviderUnderTest(undefined);
  const rolledBack = getProviderClient(); // rollback

  const verbs: EvolutionGatewayVerb[] = [
    "sendText", "sendMedia", "sendSticker", "getConnectionState", "getQrCode",
    "restartInstance", "listInstances", "listGroups", "checkWhatsApp",
    "getProfilePicture", "get", "post",
  ];
  for (const v of verbs) {
    assert(typeof (rolledBack as unknown as Record<string, unknown>)[v] === "function", `evolutionClient pós-rollback sem verbo ${v}`);
  }
  console.log(`── F5-4: rollback preserva os ${verbs.length}/12 verbos do contrato (sem drift estrutural) ──\n`);
});
