// Edge Function: provider-healthcheck
// Pinga todos os provedores ativos. Atualiza provider_configs.status, registra log
// e dispara switchover automático em rotas cujo current_provider_id ficou offline.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireServiceRoleOrCron, requireUser } from "../_shared/auth.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
async function ping(baseUrl: string, authToken: string | null, providerType: string) {
  const url = baseUrl.replace(/\/$/, "") + (
    providerType === "evolution" ? "/" :
    providerType === "wppconnect" ? "/healthz" :
    providerType === "baileys" ? "/health" : "/"
  );
  const headers: Record<string, string> = {};
  if (authToken) {
    if (providerType === "evolution") headers["apikey"] = authToken;
    else headers["Authorization"] = `Bearer ${authToken}`;
  }
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    clearTimeout(t);
    await res.text();
    return { ok: res.ok, status: res.status, latencyMs: Date.now() - start, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Accept service-role/cron (automated) OR user JWT (admin UI-triggered)
  if (requireServiceRoleOrCron(req)) {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
  }

  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'));
  const serviceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: providers } = await admin
    .from("provider_configs")
    .select("id, name, provider_type, base_url, auth_token, status, is_active")
    .eq("is_active", true);

  if (!providers || providers.length === 0) {
    return new Response(JSON.stringify({ checked: 0, message: "no active providers" }), {
      status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  type ProviderResult = { provider: string; ok: boolean; latency_ms: number; status: string };

  const settled = await Promise.allSettled(
    providers.map(async (p): Promise<ProviderResult> => {
      const r = await ping(p.base_url, p.auth_token, p.provider_type);
      const newStatus = r.ok ? "online" : "offline";

      await admin.from("provider_configs").update({
        status: newStatus,
        last_ping_at: new Date().toISOString(),
        last_ping_latency_ms: r.latencyMs,
        last_error: r.error,
      }).eq("id", p.id);

      await admin.from("provider_session_logs").insert({
        provider_id: p.id,
        level: r.ok ? "info" : "warn",
        event: "healthcheck",
        message: r.error ?? "ok",
        latency_ms: r.latencyMs,
      });

      // Se provedor caiu E é o atual de alguma rota, tenta switchover para fallback
      if (!r.ok) {
        const { data: affectedRoutes } = await admin
          .from("channel_provider_routes")
          .select("id, fallback_provider_id, primary_provider_id")
          .eq("current_provider_id", p.id);

        await Promise.allSettled(
          (affectedRoutes ?? []).map(async (route) => {
            const target = route.fallback_provider_id && route.fallback_provider_id !== p.id
              ? route.fallback_provider_id
              : route.primary_provider_id !== p.id ? route.primary_provider_id : null;
            if (target) {
              await admin.from("channel_provider_routes").update({
                current_provider_id: target,
                switched_reason: `healthcheck_failover: ${p.name} offline`,
              }).eq("id", route.id);
            }
          })
        );
      }

      return { provider: p.name, ok: r.ok, latency_ms: r.latencyMs, status: newStatus };
    })
  );

  const results: ProviderResult[] = settled
    .map(r => (r.status === "fulfilled" ? r.value : null))
    .filter((v): v is ProviderResult => v !== null);
  const errors = settled
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));
  if (errors.length > 0) console.error('[provider-healthcheck] rejected tasks:', errors);

  return new Response(JSON.stringify({
    checked: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
    finished_at: new Date().toISOString(),
  }), {
    status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
});
