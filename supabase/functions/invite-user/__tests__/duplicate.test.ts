/**
 * invite-user@v1 — âncoras de fonte para DUPLICADO / erro honesto (E57).
 *
 * RED até `../index.ts` existir (readSourceFrom lança). Quando a edge for
 * implementada, estas âncoras viram GREEN sem edição — mesmo padrão do
 * contract.test.ts canônico.
 *
 * Contrato (Etapa 57.3/57.4/57.8):
 *   - Email com conta auth existente      → 409 "Email already registered"
 *   - Email com convite pendente (RPC)    → 409 (mapeado, nunca 500)
 *   - RPC indisponível (PGRST202)         → 503 honesto (não "Internal error")
 *   - Não-admin                           → 403 (requireAdminOrSupervisor)
 */
import { assertMatch } from "jsr:@std/assert";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("invite-user: email já cadastrado → 409 honesto (pré-checagem de duplicado)", () => {
  // Pré-checagem via service_role no schema auth (auth.users) ANTES de criar.
  assertMatch(SOURCE, /\.schema\(["']auth["']\)/);
  assertMatch(SOURCE, /\.from\(["']users["']\)/);
  assertMatch(SOURCE, /errorResponse\([^)]*"Email already registered"[^)]*, 409, req\)/);
});

Deno.test("invite-user: RPC rejeita duplicado → mapeado para 409 (nunca 500)", () => {
  assertMatch(SOURCE, /rpcError/);
  assertMatch(SOURCE, /already registered|already invited/i);
  assertMatch(SOURCE, /errorResponse\([^)]*, 409, req\)/);
});

Deno.test("invite-user: RPC ausente no banco (PGRST202) → 503 honesto", () => {
  assertMatch(SOURCE, /PGRST202/);
  assertMatch(SOURCE, /errorResponse\([^)]*, 503, req\)/);
});

Deno.test("invite-user: erro de negócio do RPC → 400 (não 500 genérico)", () => {
  assertMatch(SOURCE, /errorResponse\([^)]*"Failed to create invite"[^)]*, 400, req\)/);
});
