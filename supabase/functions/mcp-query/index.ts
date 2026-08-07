const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-mcp-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

// P1 2026-08-07: o secret era HARDCODED no source (repo público) — agora vem
// exclusivamente da env MCP_QUERY_SECRET (definida no runtime do serviço
// supabase_functions). Fail-closed: sem env → 503, nunca aceita sem segredo.
const SECRET = Deno.env.get("MCP_QUERY_SECRET") ?? "";

// Whitelist read-only (P1 2026-08-07): a função executa com service_role via
// exec_sql — qualquer comando que não seja leitura (SELECT/EXPLAIN/WITH) é
// rejeitado ANTES de chegar ao banco. Bloqueia INSERT/UPDATE/DELETE/DDL/
// GRANT/etc. (o filtro antigo só cobria DROP/TRUNCATE).
const READ_ONLY_RE = /^\s*(SELECT|EXPLAIN|WITH)\b/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!SECRET || req.headers.get("x-mcp-secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  // Gate de contrato (2026-08-07 — função nasceu sem gate, quebrava o
  // contract-coverage): valida { sql, limit } antes de qualquer execução.
  const raw = await req.json().catch(() => null);
  const parsed = parseOrReject("mcp-query", CONTRACT_SCHEMAS["mcp-query"], req, raw, {
    extraHeaders: CORS,
  });
  if (parsed.ok === false) return parsed.response;
  const { sql, limit = 100 } = parsed.data as { sql: string; limit?: number };
  if (!READ_ONLY_RE.test(sql)) {
    return new Response(JSON.stringify({
      error: true,
      code: "READ_ONLY_VIOLATION",
      message: "Somente consultas de leitura são permitidas (SELECT/EXPLAIN/WITH).",
    }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const finalSql = /\blimit\b/i.test(sql) ? sql : `${sql} LIMIT ${limit}`;
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "apikey": key,
    },
    body: JSON.stringify({ query: finalSql }),
  });
  const data = await res.json();
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const rows = Array.isArray(data) ? data : [data];
  return new Response(JSON.stringify({ rows, count: rows.length }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
