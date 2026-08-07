/**
 * Contract tests — mcp-query@v1 (gate adicionado 2026-08-07 — a função
 * nasceu sem contrato e quebrava o contract-coverage).
 *
 * Schema REAL: McpQueryV1Schema (contract-schemas-infra.ts) — sql obrigatória
 * (min 1, max 50k), limit opcional (int 1-10k). Permissivo em extras.
 */
import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
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

// ─── Hardening P1 (2026-08-07): secret via env + whitelist read-only ───────

const SOURCE = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("P1: secret NÃO está hardcoded no source (vem de MCP_QUERY_SECRET)", () => {
  assertMatch(SOURCE, /Deno\.env\.get\("MCP_QUERY_SECRET"\)/);
  // o literal antigo não pode existir no arquivo
  assertEquals(SOURCE.includes("zappweb_mcp_"), false, "secret hardcoded ainda presente");
});

Deno.test("P1: fail-closed — sem env o secret é vazio (401 para todos)", () => {
  assertMatch(SOURCE, /Deno\.env\.get\("MCP_QUERY_SECRET"\) \?\? ""/);
});

Deno.test("P1: whitelist read-only cobre SELECT/EXPLAIN/WITH", () => {
  assertMatch(SOURCE, /SELECT\|EXPLAIN\|WITH/);
  assertMatch(SOURCE, /READ_ONLY_VIOLATION/);
  assertMatch(SOURCE, /status: 403/);
});

Deno.test("P1: whitelist read-only é avaliada ANTES do exec_sql", () => {
  const blockStart = SOURCE.indexOf("READ_ONLY_RE.test(sql)");
  const blockEnd = SOURCE.indexOf("rpc/exec_sql");
  assert(blockStart > 0 && blockEnd > blockStart, "whitelist deve vir antes da execução");
});
