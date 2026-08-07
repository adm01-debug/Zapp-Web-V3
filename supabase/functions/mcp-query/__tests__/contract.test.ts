/**
 * Contract tests — mcp-query@v1 (gate adicionado 2026-08-07 — a função
 * nasceu sem contrato e quebrava o contract-coverage).
 *
 * Schema REAL: McpQueryV1Schema (contract-schemas-infra.ts) — sql obrigatória
 * (min 1, max 50k), limit opcional (int 1-10k). Permissivo em extras.
 */
import { assertEquals } from "jsr:@std/assert";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

Deno.test("Contract: mcp-query v1 — payload válido mínimo", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, { sql: "SELECT 1" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.version, "v1");
});

Deno.test("Contract: mcp-query v1 — válido com limit", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, { sql: "SELECT * FROM x", limit: 50 });
  assertEquals(r.ok, true);
});

Deno.test("Contract: mcp-query v1 — sql ausente → 422 contract_violation com path", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, {});
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.code, "contract_violation");
    const paths = r.body.details.map((d) => d.path);
    assertEquals(paths.includes("sql"), true);
  }
});

Deno.test("Contract: mcp-query v1 — sql tipo errado (number) → rejeitado", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, { sql: 42 });
  assertEquals(r.ok, false);
});

Deno.test("Contract: mcp-query v1 — sql vazia '' → rejeitado (min 1)", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, { sql: "" });
  assertEquals(r.ok, false);
});

Deno.test("Contract: mcp-query v1 — limit inválido (0 / string / 10001) → rejeitado", () => {
  for (const limit of [0, "50", 10_001]) {
    const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, { sql: "SELECT 1", limit });
    assertEquals(r.ok, false, `limit=${limit} deveria falhar`);
  }
});

Deno.test("Contract: mcp-query v1 — body null → 422 invalid_json", () => {
  const r = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], null, null);
  assertEquals(r.ok, false);
  if (r.ok === false) assertEquals(r.body.code, "invalid_json");
});
