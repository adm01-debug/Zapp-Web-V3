/**
 * Contract tests — revoke-session@v1 (RED: edge NÃO EXISTE ainda).
 *
 * Etapa 56 do plano (gestão e revogação de sessões ativas) — "ausência total
 * hoje". Este arquivo documenta o CONTRATO esperado; os testes de registro e
 * de fonte falham (RED) até a implementação existir:
 *
 *   - POST revoke-session com { sessionId } (UUID de auth.sessions)
 *   - Sem JWT válido                    → 401  (requireUser)
 *   - Sessão de OUTRO usuário (não-admin)→ 403  (ownership check)
 *   - Admin/supervisor revogando de outro → 200 (is_admin_or_supervisor)
 *   - Dono revogando a própria sessão   → 200  { success: true }
 *   - Sessão inexistente/já revogada    → 404  (erro tratado, idempotente)
 *   - Backend: RPC SECURITY DEFINER `sessions_revoke` (search_path fixo,
 *     grants mínimos) — Etapa 56.3; integração GoTrue deleteSession — 56.4.
 *
 * Regra de ouro do repo: o teste é o contrato. Quando a edge for
 * implementada, os testes de registro/fonte abaixo viram GREEN sem edição
 * (ajustes apenas se o nome do RPC/helper divergir do plano).
 */
import { assertEquals, assertMatch, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ─── Contrato local (contract-first; registro ainda não existe) ─────────────
// Endpoint interno → estrito. sessionId obrigatório UUID.
const RevokeSessionV1Schema = z.object({
  sessionId: z.string().uuid("sessionId deve ser um UUID de auth.sessions"),
}).strict();

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

// ─── Matriz do contrato (passa standalone; documenta o shape) ───────────────

Deno.test("Contract: revoke-session v1 — sessionId UUID válido → aceito", () => {
  assertEquals(RevokeSessionV1Schema.safeParse({ sessionId: UUID }).success, true);
});

Deno.test("Contract: revoke-session v1 — sessionId ausente → rejeitado", () => {
  const r = RevokeSessionV1Schema.safeParse({});
  assertEquals(r.success, false);
  if (!r.success) {
    assertEquals(r.error.issues.map((i) => i.path.join(".")).includes("sessionId"), true);
  }
});

Deno.test("Contract: revoke-session v1 — sessionId não-UUID → rejeitado", () => {
  const r = RevokeSessionV1Schema.safeParse({ sessionId: "abc" });
  assertEquals(r.success, false);
});

Deno.test("Contract: revoke-session v1 — campo extra → rejeitado (.strict())", () => {
  assertEquals(RevokeSessionV1Schema.safeParse({ sessionId: UUID, hack: true }).success, false);
});

Deno.test("Contract: revoke-session v1 — body null → rejeitado", () => {
  assertEquals(RevokeSessionV1Schema.safeParse(null).success, false);
});

// ─── Registro canônico (RED até a implementação registrar o contrato) ───────

Deno.test("Contract: revoke-session v1 — registrado em CONTRACT_SCHEMAS (RED)", () => {
  // Invariante 9 do repo: placeholder = shape vazio E aceita {__x:1};
  // EmptyStrict legítimo rejeita extras. O registro deve apontar para um
  // schema que valide sessionId UUID.
  const map = CONTRACT_SCHEMAS["revoke-session"];
  assert(map?.v1, "CONTRACT_SCHEMAS['revoke-session'] não registrado — edge inexistente");
  assertEquals(RevokeSessionV1Schema.safeParse({ sessionId: UUID }).success, true);
});

// ─── Âncoras de fonte (RED: index.ts não existe → readSourceFrom lança) ─────

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("Contract: revoke-session v1 — auth requireUser ANTES do gate (401 sem JWT)", () => {
  // Ordem auth→gate é o oracle do repo (micro-auditoria 2026-08-05): anônimo
  // deve receber 401, nunca 422 do contrato.
  assertMatch(SOURCE, /requireUser\(req\)/);
  assertMatch(SOURCE, /instanceof Response\) return/);
  assertMatch(SOURCE, /requireUser\(req\)[\s\S]{0,3000}?parseOrReject\('revoke-session'/);
});

Deno.test("Contract: revoke-session v1 — gate parseOrReject com contrato registrado", () => {
  assertMatch(SOURCE, /parseOrReject\(\s*'revoke-session'/);
});

Deno.test("Contract: revoke-session v1 — ownership: sessão de outro usuário → 403", () => {
  // Dono só revoga as próprias; admin/supervisor revoga de outros (Etapa 56.8).
  assertMatch(SOURCE, /is_admin_or_supervisor/);
  assertMatch(SOURCE, /errorResponse\([^)]*, 403, req\)/);
});

Deno.test("Contract: revoke-session v1 — backend RPC sessions_revoke (SECURITY DEFINER)", () => {
  // Etapa 56.3: RPC `sessions_revoke` com search_path fixo e grants mínimos.
  assertMatch(SOURCE, /\.rpc\(\s*["']sessions_revoke["']/);
});

Deno.test("Contract: revoke-session v1 — sessão inexistente → 404 erro tratado (idempotente)", () => {
  // Etapa 56.8: idempotência — revogar sessão já revogada não é 500.
  assertMatch(SOURCE, /errorResponse\([^)]*404/);
});

Deno.test("Contract: revoke-session v1 — sucesso dono → 200 { success: true }", () => {
  assertMatch(SOURCE, /jsonResponse\(\{ success: true/);
});
