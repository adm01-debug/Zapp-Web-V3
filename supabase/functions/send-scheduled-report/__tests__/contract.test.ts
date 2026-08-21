/**
 * Contract tests — send-scheduled-report@v1/@v2.
 *
 * v1 (compat): { reportId } — UI/manual envia runs pendentes DAQUELE relatório.
 * v2 (cron):   {} ou { limit?, dryRun? } — batch da outbox (cron
 * scheduled-reports-dispatch a cada 15 min chama com body '{}').
 *
 * Diferente dos demais webhooks v1/v2 deste plano (sicoob-bridge*, gmail-webhook,
 * evolution-webhook, whatsapp-cloud-webhook), send-scheduled-report NÃO tem
 * `sunset` declarado para v1 em CONTRACTS (contract-versions.ts) — v1 aqui é o
 * modo "UI/manual" (reportId específico), não um payload de provedor externo em
 * migração; não há prazo de descontinuação definido. isDeprecatedVersion() por
 * isso retorna false para v1 e a resposta não carrega x-contract-deprecated/sunset
 * mesmo quando v1 é negociado. Ver etapa 55 do plano (política de sunset) para
 * decidir se isso deve mudar.
 *
 * Casos: válidos (v1/v2, completo/mínimo), campos ausentes, tipos errados,
 * valores fora de faixa, campos extras (.strict()), versionamento v1/v2.
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SendScheduledReportV1Schema,
  SendScheduledReportV2Schema,
} from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

// ─── Schema V1 ───────────────────────────────────────────────────────────────

Deno.test("Contract: send-scheduled-report v1 — { reportId } válido", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: "r1" }).success, true);
});

Deno.test("Contract: send-scheduled-report v1 — {} rejeitado (reportId obrigatório)", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({}).success, false);
});

Deno.test("Contract: send-scheduled-report v1 — reportId vazio rejeitado (min 1)", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: "" }).success, false);
});

Deno.test("Contract: send-scheduled-report v1 — reportId tipo errado rejeitado", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: 123 }).success, false);
});

Deno.test("Contract: send-scheduled-report v1 — reportId acima de 200 chars rejeitado", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: "x".repeat(201) }).success, false);
});

Deno.test("Contract: send-scheduled-report v1 — reportId com 200 chars aceito (limite exato)", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: "x".repeat(200) }).success, true);
});

Deno.test("Contract: send-scheduled-report v1 — null rejeitado", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: send-scheduled-report v1 — campo extra rejeitado (.strict())", () => {
  assertEquals(SendScheduledReportV1Schema.safeParse({ reportId: "r1", limit: 10 }).success, false);
});

// ─── Schema V2 ───────────────────────────────────────────────────────────────

Deno.test("Contract: send-scheduled-report v2 — {} válido (cron dispatch sem body)", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({}).success, true);
});

Deno.test("Contract: send-scheduled-report v2 — { limit } válido", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 20 }).success, true);
});

Deno.test("Contract: send-scheduled-report v2 — { limit, dryRun } válido", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 5, dryRun: true }).success, true);
});

Deno.test("Contract: send-scheduled-report v2 — limit 0 rejeitado (min 1)", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 0 }).success, false);
});

Deno.test("Contract: send-scheduled-report v2 — limit 101 rejeitado (max 100)", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 101 }).success, false);
});

Deno.test("Contract: send-scheduled-report v2 — limit 100 aceito (limite exato)", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 100 }).success, true);
});

Deno.test("Contract: send-scheduled-report v2 — limit fracionário rejeitado (int)", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ limit: 1.5 }).success, false);
});

Deno.test("Contract: send-scheduled-report v2 — dryRun tipo errado rejeitado", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ dryRun: "true" }).success, false);
});

Deno.test("Contract: send-scheduled-report v2 — reportId (campo de v1) rejeitado em v2 (.strict())", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse({ reportId: "r1" }).success, false);
});

Deno.test("Contract: send-scheduled-report v2 — null rejeitado", () => {
  assertEquals(SendScheduledReportV2Schema.safeParse(null).success, false);
});

// ─── Versionamento v1/v2 (parseOrReject) ─────────────────────────────────────

Deno.test("Versioning: {} auto-detecta v2 (current, cron sem body)", () => {
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], null, {});
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v2");
});

Deno.test("Versioning: { reportId } auto-detecta v1 (não bate v2 strict)", () => {
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], null, { reportId: "r1" });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: x-contract-version header força v1 com { reportId }", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], req, { reportId: "r1" });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422 unsupported_contract_version", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], req, {});
  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.body.code, "unsupported_contract_version");
    assertEquals(result.response.status, 422);
    assertEquals(result.body.contract, "send-scheduled-report@v99");
  }
});

Deno.test("Versioning: v1 negociado → SEM sunset declarado, headers não carregam deprecated/sunset", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], req, { reportId: "r1" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, false);
    assertEquals(result.headers["x-contract-deprecated"], undefined);
    assertEquals(result.headers["sunset"], undefined);
    assertEquals(result.headers["x-contract-version"], "v1");
  }
});

Deno.test("Versioning: v2 (current) → x-contract-version: v2, sem deprecated", () => {
  const result = parseOrReject("send-scheduled-report", CONTRACT_SCHEMAS["send-scheduled-report"], null, { limit: 10 });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.headers["x-contract-version"], "v2");
    assertEquals(result.headers["x-contract-deprecated"], undefined);
  }
});
