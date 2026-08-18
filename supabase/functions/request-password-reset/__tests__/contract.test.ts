/**
 * Contract tests — request-password-reset@v1 (Etapa 55: reset de senha ponta a ponta).
 *
 * Fluxo de SOLICITAÇÃO pública de reset de senha: o visitante anônimo informa o
 * email; a EF valida, resolve o usuário server-side (service role — o anon NÃO
 * pode ler zapp.profiles nem inserir em zapp.password_reset_requests, cuja RLS
 * exige user_id = auth.uid()) e cria a solicitação com status pending.
 *
 * Contrato de segurança:
 *   - PÚBLICA (sem requireUser/requireAdminOrSupervisor) — a página
 *     /forgot-password roda anônima; a RLS do banco NÃO permite insert anon
 *     (prr_insert_own é authenticated-only), então a EF é o único caminho.
 *   - Rate limit por IP ANTES de qualquer lookup (5/60s) — anti-spam.
 *   - Anti-enumeração: resposta GENÉRICA idêntica para email existente e
 *     inexistente ({ success: true } nos dois caminhos) — nunca confirma
 *     existência de conta.
 *   - Gate zod via parseOrReject (422 envelope canônico) ANTES de qualquer
 *     acesso ao banco.
 *
 * RED esperado: index.ts ainda não existe (leitura de fonte falha) e o schema
 * não está registrado em CONTRACT_SCHEMAS. O GREEN chega com a implementação.
 */
import { assertEquals, assertMatch, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import { CONTRACT_SCHEMAS, RequestPasswordResetV1Schema } from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ─── Schema registrado (contrato do body público) ───────────────────────────

Deno.test("Contract: request-password-reset v1 — registrado em CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["request-password-reset"]?.v1);
});

Deno.test("Contract: request-password-reset v1 — email válido + reason opcional → aceito", () => {
  const r = RequestPasswordResetV1Schema.safeParse({
    email: "usuario@exemplo.com",
    reason: "Esqueci minha senha",
    userAgent: "Mozilla/5.0",
    ipAddress: "200.1.2.3",
  });
  assertEquals(r.success, true);
});

Deno.test("Contract: request-password-reset v1 — só email → aceito (demais opcionais)", () => {
  assertEquals(RequestPasswordResetV1Schema.safeParse({ email: "a@b.com" }).success, true);
});

Deno.test("Contract: request-password-reset v1 — email inválido → rejeitado (zod email)", () => {
  assertEquals(RequestPasswordResetV1Schema.safeParse({ email: "nao-e-email" }).success, false);
  assertEquals(RequestPasswordResetV1Schema.safeParse({ email: "" }).success, false);
});

Deno.test("Contract: request-password-reset v1 — email ausente → rejeitado", () => {
  assertEquals(RequestPasswordResetV1Schema.safeParse({ reason: "x" }).success, false);
});

Deno.test("Contract: request-password-reset v1 — reason > 500 chars → rejeitado (abuso)", () => {
  const r = RequestPasswordResetV1Schema.safeParse({
    email: "a@b.com",
    reason: "x".repeat(501),
  });
  assertEquals(r.success, false);
});

Deno.test("Contract: request-password-reset v1 — null → rejeitado (zod object)", () => {
  assertEquals(RequestPasswordResetV1Schema.safeParse(null).success, false);
});

// ─── Gate (parseOrReject, envelope 422) ─────────────────────────────────────

Deno.test("Contract: request-password-reset v1 — gate: body null → 422 invalid_json", () => {
  const r = parseOrReject("request-password-reset", CONTRACT_SCHEMAS["request-password-reset"], null, null);
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.error, true);
    assertEquals(r.body.code, "invalid_json");
  }
});

Deno.test("Contract: request-password-reset v1 — gate: payload válido → ok", () => {
  const r = parseOrReject("request-password-reset", CONTRACT_SCHEMAS["request-password-reset"], null, {
    email: "usuario@exemplo.com",
  });
  assertEquals(r.ok, true);
});

// ─── Âncoras de fonte (comportamento real do index.ts) ──────────────────────

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("Contract: request-password-reset v1 — pública: SEM requireUser/requireAdminOrSupervisor", () => {
  // Forma de CHAMADA (com parênteses) — o comentário do header cita os nomes.
  assert(!/requireUser\(|requireAdminOrSupervisor\(/.test(SOURCE));
});

Deno.test("Contract: request-password-reset v1 — rate limit por IP ANTES de qualquer lookup", () => {
  assertMatch(SOURCE, /checkRateLimit\(`reset-request:\$\{ip\}`, 5, 60_000\)/);
  assertMatch(SOURCE, /errorResponse\("Rate limit exceeded", 429, req\)/);
  // Ordem: rate limit → gate zod → lookup. O rate limit aparece antes do
  // primeiro acesso a .from( (banco) e antes do parseOrReject.
  const rlIdx = SOURCE.indexOf("checkRateLimit");
  const fromIdx = SOURCE.indexOf('.from("profiles")');
  const gateIdx = SOURCE.indexOf("parseOrReject('request-password-reset'");
  assert(rlIdx !== -1 && fromIdx !== -1 && gateIdx !== -1);
  assert(rlIdx < gateIdx, "rate limit deve preceder o gate zod");
  assert(gateIdx < fromIdx, "gate zod deve preceder o lookup no banco");
});

Deno.test("Contract: request-password-reset v1 — gate zod (parseOrReject + early return)", () => {
  // O envelope 422 vive no parseOrReject (contract-kit); o handler só precisa
  // chamar o gate e retornar cedo quando falhar.
  assertMatch(SOURCE, /parseOrReject\('request-password-reset'/);
  assertMatch(SOURCE, /parsed\.ok === false\) return parsed\.response/);
});

Deno.test("Contract: request-password-reset v1 — lookup server-side por email (service role)", () => {
  assertMatch(SOURCE, /\.from\(\s*["']profiles["']\s*\)\s*\.select\(\s*["']user_id["']\s*\)\s*\.eq\(\s*["']email["']/);
});

Deno.test("Contract: request-password-reset v1 — insert pendente em password_reset_requests", () => {
  assertMatch(SOURCE, /\.from\(\s*["']password_reset_requests["']\s*\)\s*\.insert\(/);
  assertMatch(SOURCE, /status:\s*["']pending["']/);
});

Deno.test("Contract: request-password-reset v1 — anti-enumeração: MESMA resposta genérica p/ existente e inexistente", () => {
  // Uma única const de sucesso (ex.: successResponse) usada nos DOIS caminhos —
  // email inexistente e email existente recebem payload idêntico { success: true }.
  assertMatch(SOURCE, /successResponse|genericSuccess/);
  const successVar = SOURCE.match(/const\s+(successResponse|genericSuccess)\s*=\s*/)?.[1];
  assert(successVar, "deve existir uma const de resposta genérica de sucesso");
  const occurrences = SOURCE.split(successVar).length - 1;
  assert(occurrences >= 3, `resposta genérica usada nos dois caminhos (ocorrências: ${occurrences})`);
});

Deno.test("Contract: request-password-reset v1 — nunca retorna status/existência no payload", () => {
  // O corpo de sucesso NÃO carrega campo tipo found/exists/userId.
  const body = extractSuccessJson(SOURCE);
  assert(!/\bfound\b|\bexists\b|userId/.test(body), "payload de sucesso não pode vazar existência");
});

// Helper local: isola o trecho do jsonResponse de sucesso para inspeção.
function extractSuccessJson(source: string): string {
  const m = source.match(/jsonResponse\(\{[\s\S]{0,300}?\}, 200, req\)/);
  if (!m) return "";
  return m[0];
}
