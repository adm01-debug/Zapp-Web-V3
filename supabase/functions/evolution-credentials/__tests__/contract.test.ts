/**
 * Contract tests — evolution-credentials (GET) + evolution-credentials-write (POST CRUD).
 *
 * Cobre:
 *  - GET: EvolutionCredentialsV1Schema (EmptyStrict) + gate parseOrReject.
 *  - POST: EvolutionCredentialsWriteV1Schema (discriminatedUnion save|delete),
 *    gate aplicado no handleWrite (correção 2026-08-04 — antes lia req.json()
 *    sem contrato).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/evolution-credentials/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
const WRITE_SCHEMA = CONTRACT_SCHEMAS["evolution-credentials-write"].v1!;

const VALID_UUID = "24ab9157-eb2d-457f-a8a4-36c599f6113e";

function req(body: unknown): Request {
  return new Request("https://edge.local/evolution-credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function gate(body: unknown) {
  return parseOrReject("evolution-credentials-write", CONTRACT_SCHEMAS["evolution-credentials-write"], req(body), body, { extraHeaders: {} });
}

// ─── POST save — válidos ─────────────────────────────────────────────────────

Deno.test("Write: save completo válido", () => {
  const r = WRITE_SCHEMA.safeParse({
    action: "save",
    instance_name: "wpp2",
    api_url: "https://evo.atomicabr.com.br",
    api_key: "sk-123",
    display_name: "WhatsApp Principal",
    department: "Vendas",
    is_active: true,
  });
  assertEquals(r.success, true);
});

Deno.test("Write: save mínimo válido (opcionais ausentes)", () => {
  const r = WRITE_SCHEMA.safeParse({ action: "save", instance_name: "wpp3", api_url: "https://evo.x.com", api_key: "k" });
  assertEquals(r.success, true);
  if (r.success) assertEquals(r.data.is_active, undefined); // default fica no handler
});

Deno.test("Write: save com extras (passthrough — handler valida negócio)", () => {
  const r = WRITE_SCHEMA.safeParse({ action: "save", instance_name: "wpp2", api_url: "https://evo.x.com", api_key: "k", extra: 1 });
  assertEquals(r.success, true);
});

// ─── POST save — inválidos ───────────────────────────────────────────────────

Deno.test("Write: save sem instance_name → falha", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "save", api_url: "https://evo.x.com", api_key: "k" }).success, false);
});

Deno.test("Write: save sem api_url → falha", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "save", instance_name: "wpp2", api_key: "k" }).success, false);
});

Deno.test("Write: save sem api_key → falha", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "save", instance_name: "wpp2", api_url: "https://evo.x.com" }).success, false);
});

Deno.test("Write: save com instance_name vazio → falha (min 1)", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "save", instance_name: "", api_url: "https://evo.x.com", api_key: "k" }).success, false);
});

// ─── POST delete ─────────────────────────────────────────────────────────────

Deno.test("Write: delete com UUID válido", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "delete", id: VALID_UUID }).success, true);
});

Deno.test("Write: delete sem id → falha", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "delete" }).success, false);
});

Deno.test("Write: delete com id não-UUID → falha", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "delete", id: "not-a-uuid" }).success, false);
});

// ─── POST action inválida ────────────────────────────────────────────────────

Deno.test("Write: action desconhecida → falha (discriminatedUnion)", () => {
  assertEquals(WRITE_SCHEMA.safeParse({ action: "list" }).success, false);
  assertEquals(WRITE_SCHEMA.safeParse({ action: "update", instance_name: "wpp2", api_url: "https://x", api_key: "k" }).success, false);
});

// ─── Gate (parseOrReject, envelope 422) ─────────────────────────────────────

Deno.test("Write: body null → 422 invalid_json", async () => {
  const r = gate(null);
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string };
    assertEquals(body.code, "invalid_json");
  }
});

Deno.test("Write: payload sem action → 422 contract_violation", async () => {
  const r = gate({ instance_name: "wpp2" });
  assertEquals(r.ok, false);
  if (!r.ok) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string; contract: string };
    assertEquals(body.code, "contract_violation");
    assertEquals(body.contract, "evolution-credentials-write@v1");
  }
});

Deno.test("Write: save válido → ok (gate passa)", () => {
  const r = gate({ action: "save", instance_name: "wpp2", api_url: "https://evo.x.com", api_key: "k" });
  assertEquals(r.ok, true);
});

// ─── Ancoragem na fonte (gate no POST + registros) ──────────────────────────

Deno.test("Source: handleWrite usa parseOrReject com o registro write", () => {
  assertMatch(SOURCE, /parseOrReject\('evolution-credentials-write', CONTRACT_SCHEMAS\['evolution-credentials-write'\]/);
  assertMatch(SOURCE, /if \(!parsed\.ok\) return parsed\.response/);
});

Deno.test("Source: GET preserva gate + role gate + RPC get", () => {
  assertMatch(SOURCE, /fn_edge_get_evolution_credentials/);
  assertMatch(SOURCE, /requireAdminOrSupervisor/);
  assertMatch(SOURCE, /X-Evolution-Key/);
});

Deno.test("Source: CRUD preserva RPCs upsert/delete + rate limit próprio", () => {
  assertMatch(SOURCE, /fn_edge_upsert_evolution_credentials/);
  assertMatch(SOURCE, /fn_edge_delete_evolution_credentials/);
  assertMatch(SOURCE, /evolution-credentials-write:/);
});

Deno.test("Registry: evolution-credentials-write presente no CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["evolution-credentials-write"], "registro ausente");
  assert(CONTRACT_SCHEMAS["evolution-credentials-write"].v1, "v1 ausente");
});
