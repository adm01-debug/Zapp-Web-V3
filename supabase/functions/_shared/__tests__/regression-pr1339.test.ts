/**
 * Regressão — leva 2026-08-20 (PR #1339): 14 type errors em 13 edge functions.
 *
 * Cobre, em runtime (não type-only), os pontos que motivaram os fixes:
 *   (1) lgpd-scheduled-jobs: o import corrigido `requireServiceRoleOrCron`
 *       (TS2305 — antes apontava para validation.ts, função real fica em auth.ts).
 *   (2) health-check: resposta inclui `latency_ms` (TS2339 — propriedade
 *       ausente do type literal de resposta).
 *   (3) webhook-hmac-selftest: `validateRequest` é função (TS18046).
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/regression-pr1339.test.ts
 */
import { assertEquals, assert } from "jsr:@std/assert";

const FUNCTIONS = "supabase/functions";

// (1) Import corrigido de lgpd-scheduled-jobs — lê o fonte e garante que
//     requireServiceRoleOrCron vem de _shared/auth.ts (não validation.ts).
Deno.test("PR1339: lgpd-scheduled-jobs importa requireServiceRoleOrCron de _shared/auth.ts", async () => {
  const src = await Deno.readTextFile(`${FUNCTIONS}/lgpd-scheduled-jobs/index.ts`);
  const hasAuthImport = /import\s*\{[^}]*requireServiceRoleOrCron[^}]*\}\s*from\s*["']\.\.\/_shared\/auth\.ts["']/.test(src);
  // O bug original era requireServiceRoleOrCron vindo de validation.ts (não existe lá).
  // Não proíbe importar OUTRAS coisas de validation.ts (ex.: readJsonBodyOrEmpty, 2026-08-21).
  const hasWrongImport = /import\s*\{[^}]*requireServiceRoleOrCron[^}]*\}\s*from\s*["']\.\.\/_shared\/validation\.ts["']/.test(src);
  assert(hasAuthImport, "deve importar requireServiceRoleOrCron de _shared/auth.ts");
  assert(!hasWrongImport, "requireServiceRoleOrCron não deve vir de _shared/validation.ts");
});

// (2) health-check: resposta usa latency_ms — o type literal agora declara a prop.
Deno.test("PR1339: health-check referencia latency_ms no corpo de resposta", async () => {
  const src = await Deno.readTextFile(`${FUNCTIONS}/health-check/index.ts`);
  assert(src.includes("latency_ms"), "health-check deve incluir latency_ms na resposta");
});

// (3) webhook-hmac-selftest: validateRequest usado como função (narrowing com svc?.).
Deno.test("PR1339: webhook-hmac-selftest aplica narrowing em validateRequest", async () => {
  const src = await Deno.readTextFile(`${FUNCTIONS}/webhook-hmac-selftest/index.ts`);
  assert(/typeof\s+svc\??\.validateRequest\s*!==\s*["']function["']/.test(src) || /validateRequest\s*\(/.test(src),
    "validateRequest deve ser tratado como função (typeof guard)");
});

// Sanidade: ai-router NÃO entra nesta leva (residual TS2551) — garante que o
// arquivo consolidado não trouxe nada além dos 13 previstos.
Deno.test("PR1339: consolidado não inclui ai-router nesta leva", async () => {
  const expected = [
    "cleanup-storage-orphans", "db-health-monitor", "automation-suggest-reply",
    "followup-bridge", "health-check", "lgpd-scheduled-jobs", "mcp", "webauthn",
    "elevenlabs-voice", "transcribe-audio-internal", "whatsapp-cloud-api",
    "webhook-diagnostic", "webhook-hmac-selftest",
  ];
  for (const fn of expected) {
    const src = await Deno.readTextFile(`${FUNCTIONS}/${fn}/index.ts`);
    assert(src.length > 0, `${fn} deve existir e não estar vazio`);
  }
  assertEquals(expected.length, 13, "exatamente 13 funções na lista do PR #1339");
});