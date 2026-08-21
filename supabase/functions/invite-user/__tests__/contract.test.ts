/**
 * Contract tests — invite-user@v1 (edge construída em 2026-08-18).
 *
 * Etapa 57.3/57.4 do plano (convites de usuário): edge `invite-user` com
 * validação zod e rate-limit, convite REAL via GoTrue admin API. Este arquivo
 * documenta o CONTRATO esperado; os testes de registro e de fonte falham
 * (RED) até a implementação existir:
 *
 *   - POST invite-user com { email, role? } (role default 'agent')
 *   - Sem JWT válido          → 401  (requireAdminOrSupervisor → requireUser)
 *   - JWT válido não-admin    → 403  (requireAdminOrSupervisor — "admin-only")
 *   - Admin/supervisor        → 200  { success: true, invite_id }
 *   - Rate limit              → 429  (mesmo padrão do create-user: 5/60s)
 *   - Backend: auth.admin.inviteUserByEmail (usuário invited_at + email de
 *     aceite com TTL do GoTrue). Divergência do plano documentada em
 *     2026-08-18: banco vivo sem RPC `invite_user` e sem tabela de convites
 *     (verificado no DB); migrations fora de escopo. Etapa 57.4 (RLS de
 *     convites / token próprio) permanece nível banco, quando houver tabela.
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
// Endpoint interno (admin) → estrito. email obrigatório; role fechada com
// default 'agent' (espelha o CreateUserV1Schema do repo).
const InviteUserV1Schema = z.object({
  email: z.string().email("Email inválido").max(255),
  role: z.enum(["admin", "supervisor", "agent"]).optional().default("agent"),
  message: z.string().max(500).optional(),
}).strict();

// ─── Matriz do contrato (passa standalone; documenta o shape) ───────────────

Deno.test("Contract: invite-user v1 — email válido → aceito (role default agent)", () => {
  const r = InviteUserV1Schema.safeParse({ email: "novo@atomica.br" });
  assertEquals(r.success, true);
  if (r.success) assertEquals(r.data.role, "agent");
});

Deno.test("Contract: invite-user v1 — email + role válidos → aceito", () => {
  assertEquals(
    InviteUserV1Schema.safeParse({ email: "novo@atomica.br", role: "supervisor" }).success,
    true,
  );
});

Deno.test("Contract: invite-user v1 — email ausente → rejeitado", () => {
  const r = InviteUserV1Schema.safeParse({});
  assertEquals(r.success, false);
  if (!r.success) {
    assertEquals(r.error.issues.map((i) => i.path.join(".")).includes("email"), true);
  }
});

Deno.test("Contract: invite-user v1 — email inválido → rejeitado", () => {
  assertEquals(InviteUserV1Schema.safeParse({ email: "nao-e-email" }).success, false);
});

Deno.test("Contract: invite-user v1 — role fora do enum → rejeitado", () => {
  const r = InviteUserV1Schema.safeParse({ email: "novo@atomica.br", role: "owner" });
  assertEquals(r.success, false);
  if (!r.success) {
    assertEquals(r.error.issues.map((i) => i.code).includes("invalid_enum_value"), true);
  }
});

Deno.test("Contract: invite-user v1 — campo extra → rejeitado (.strict())", () => {
  assertEquals(
    InviteUserV1Schema.safeParse({ email: "novo@atomica.br", hack: true }).success,
    false,
  );
});

// ─── Registro canônico (RED até a implementação registrar o contrato) ───────

Deno.test("Contract: invite-user v1 — registrado em CONTRACT_SCHEMAS (RED)", () => {
  const map = CONTRACT_SCHEMAS["invite-user"];
  assert(map?.v1, "CONTRACT_SCHEMAS['invite-user'] não registrado — edge inexistente");
  assertEquals(InviteUserV1Schema.safeParse({ email: "novo@atomica.br" }).success, true);
});

// ─── Âncoras de fonte (RED: index.ts não existe → readSourceFrom lança) ─────

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("Contract: invite-user v1 — admin-only: requireAdminOrSupervisor (401 sem JWT / 403 não-admin)", () => {
  assertMatch(SOURCE, /requireAdminOrSupervisor\(req\)/);
  assertMatch(SOURCE, /instanceof Response\) return/);
});

Deno.test("Contract: invite-user v1 — rate limit ANTES da auth (429)", () => {
  // Mesmo padrão do create-user: checkRateLimit primeiro, depois auth.
  assertMatch(SOURCE, /checkRateLimit\(`invite-user:/);
  assertMatch(SOURCE, /errorEnvelope\('rate_limit_exceeded', "Rate limit exceeded", 429, req\)/);
});

Deno.test("Contract: invite-user v1 — gate parseOrReject com contrato registrado", () => {
  assertMatch(SOURCE, /parseOrReject\(\s*'invite-user'/);
  assertMatch(
    SOURCE,
    /requireAdminOrSupervisor\(req\)[\s\S]{0,3000}?parseOrReject\('invite-user'/,
  );
});

Deno.test("Contract: invite-user v1 — backend convite REAL via GoTrue admin API", () => {
  // Divergência documentada (2026-08-18, ADR no dir): o plano (Etapa 57.3)
  // previa RPC `invite_user` + tabela de convites, mas o banco vivo não tem
  // nem o RPC nem a tabela (verificado no DB em 18/08/2026) e migrations
  // estão fora de escopo — o mínimo real é o fluxo nativo do GoTrue:
  // inviteUserByEmail cria o usuário com invited_at e envia o email de
  // aceite (token com TTL gerenciado pelo GoTrue). Ajuste permitido pela
  // regra do próprio arquivo ("nome do RPC/helper divergir do plano").
  // TODO Etapa 57.3/57.4: migrar para RPC invite_user + token próprio quando
  // o objeto existir no banco (migration versionada).
  assertMatch(SOURCE, /\.admin\.inviteUserByEmail\(/);
});

Deno.test("Contract: invite-user v1 — sucesso admin → 200 { success: true }", () => {
  assertMatch(SOURCE, /jsonResponse\(\{ success: true/);
});

Deno.test("Contract: invite-user v1 — convite reutilizado/expirado → erro tratado (não 500)", () => {
  // Etapa 57.4/57.8: token expirado ou já usado deve ter erro explícito.
  assertMatch(SOURCE, /errorResponse\([^)]*(409|400|404)/);
});
