// =====================================================================
// GET /functions/v1/metrics — Prometheus text exposition (v0.0.4)
// Fonte: agrega contadores/latência de webhooks, edge functions e realtime
// a partir das tabelas de observabilidade já existentes no schema `zapp`.
//
// Segurança: endpoint público (Prometheus scrape) mas só expõe agregados.
// Rate limit via header METRICS_TOKEN opcional (env METRICS_SCRAPE_TOKEN).
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCRAPE_TOKEN = Deno.env.get("METRICS_SCRAPE_TOKEN") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
  db: { schema: "zapp" },
});

type Sample = { name: string; help: string; type: "counter" | "gauge" | "histogram"; labels?: Record<string, string>; value: number };

function fmt(samples: Sample[]): string {
  const grouped = new Map<string, Sample[]>();
  for (const s of samples) {
    const g = grouped.get(s.name) ?? [];
    g.push(s);
    grouped.set(s.name, g);
  }
  const out: string[] = [];
  for (const [name, list] of grouped) {
    out.push(`# HELP ${name} ${list[0].help}`);
    out.push(`# TYPE ${name} ${list[0].type}`);
    for (const s of list) {
      const lbl = s.labels
        ? "{" + Object.entries(s.labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(",") + "}"
        : "";
      out.push(`${name}${lbl} ${Number.isFinite(s.value) ? s.value : 0}`);
    }
  }
  return out.join("\n") + "\n";
}

async function collect(): Promise<Sample[]> {
  const samples: Sample[] = [];
  const since = new Date(Date.now() - 5 * 60_000).toISOString();

  // --- Webhooks Evolution: sucesso/falha nos últimos 5 min
  {
    const { data } = await admin
      .from("webhook_audit_log")
      .select("status, count:id")
      .gte("created_at", since);
    const map: Record<string, number> = {};
    for (const row of data ?? []) {
      const st = (row as { status?: string }).status ?? "unknown";
      map[st] = (map[st] ?? 0) + 1;
    }
    for (const [status, value] of Object.entries(map)) {
      samples.push({
        name: "zapp_webhook_events_total",
        help: "Webhook events received grouped by status (5m window)",
        type: "counter",
        labels: { status },
        value,
      });
    }
  }

  // --- Falhas de envio Evolution (retry metrics)
  {
    const { data } = await admin
      .schema("zapp")
      .from("evolution_retry_metrics")
      .select("outcome, latency_ms, created_at")
      .gte("created_at", since)
      .limit(5000);
    const rows = (data ?? []) as Array<{ outcome: string; latency_ms: number | null }>;
    const okCount = rows.filter(r => r.outcome === "success").length;
    const failCount = rows.filter(r => r.outcome !== "success").length;
    samples.push({ name: "zapp_evolution_send_total", help: "Evolution send attempts (5m)", type: "counter", labels: { outcome: "success" }, value: okCount });
    samples.push({ name: "zapp_evolution_send_total", help: "Evolution send attempts (5m)", type: "counter", labels: { outcome: "failure" }, value: failCount });

    const lats = rows.map(r => r.latency_ms ?? 0).filter(n => n > 0).sort((a, b) => a - b);
    if (lats.length) {
      const p = (q: number) => lats[Math.min(lats.length - 1, Math.floor(lats.length * q))];
      samples.push({ name: "zapp_evolution_send_latency_ms", help: "Evolution send latency (5m)", type: "gauge", labels: { quantile: "0.5" }, value: p(0.5) });
      samples.push({ name: "zapp_evolution_send_latency_ms", help: "Evolution send latency (5m)", type: "gauge", labels: { quantile: "0.95" }, value: p(0.95) });
      samples.push({ name: "zapp_evolution_send_latency_ms", help: "Evolution send latency (5m)", type: "gauge", labels: { quantile: "0.99" }, value: p(0.99) });
    }
  }

  // --- Realtime health (conexões WA ativas)
  {
    const { count: active } = await admin
      .from("whatsapp_connections")
      .select("*", { count: "exact", head: true })
      .eq("status", "connected");
    samples.push({
      name: "zapp_whatsapp_connections_active",
      help: "WhatsApp connections currently reported as connected",
      type: "gauge",
      value: active ?? 0,
    });
  }

  // --- DLQ backlog
  {
    const { count } = await admin.from("failed_messages").select("*", { count: "exact", head: true });
    samples.push({ name: "zapp_dlq_size", help: "Failed messages awaiting reprocess", type: "gauge", value: count ?? 0 });
  }

  // --- Rate-limit denies (5m)
  {
    const { count } = await admin
      .from("rate_limit_logs")
      .select("*", { count: "exact", head: true })
      .eq("blocked", true)
      .gte("created_at", since);
    samples.push({ name: "zapp_rate_limit_blocks_total", help: "Requests blocked by rate limit (5m)", type: "counter", value: count ?? 0 });
  }

  samples.push({ name: "zapp_metrics_scrape_timestamp_seconds", help: "Unix seconds of the last successful scrape", type: "gauge", value: Math.floor(Date.now() / 1000) });
  return samples;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  if (SCRAPE_TOKEN) {
    const provided = req.headers.get("x-metrics-token") ?? new URL(req.url).searchParams.get("token") ?? "";
    if (provided !== SCRAPE_TOKEN) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
  }
  try {
    const body = fmt(await collect());
    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`# scrape_error ${msg}\nzapp_metrics_scrape_error 1\n`, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  }
});
