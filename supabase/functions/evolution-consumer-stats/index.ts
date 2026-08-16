// E89 (2026-08-16): receptor HTTP de stats do evolution-rabbit-consumer.
// O consumer envia POST com HMAC-SHA256 (header X-Stats-Signature) e este
// endpoint valida o contrato evolution-consumer-stats@v1 + HMAC e persiste via
// RPC de contrato evo.rpc_boundary_insert_consumer_stats.
// Substitui gradualmente a escrita direta PG_EVOLUTION_URL (psycopg2).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyHmacSignature } from "../_shared/hmac-validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { getCorsHeaders } from "../_shared/validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STATS_HMAC_SECRET = Deno.env.get("STATS_HTTP_HMAC_SECRET") ?? "";

// schema-check-exempt: RPC de contrato exposta em public (evo fora do PostgREST; zapp não tem a RPC no cache)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: "public" },
});

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  const json = JSON.parse(raw);
  const parsed = parseOrReject(
    "evolution-consumer-stats",
    CONTRACT_SCHEMAS["evolution-consumer-stats"],
    req,
    json,
  );
  if (!parsed.ok) return parsed.response;

  const signature = req.headers.get("X-Stats-Signature") ?? "";
  const valid = STATS_HMAC_SECRET
    ? await verifyHmacSignature(raw, signature, STATS_HMAC_SECRET)
    : false;
  if (!valid) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { error } = await supabase.rpc("rpc_boundary_insert_consumer_stats", {
      p_row: parsed.data,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[evolution-consumer-stats] persist error:", JSON.stringify(e));
    return new Response(JSON.stringify({ error: "persist_failed" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
