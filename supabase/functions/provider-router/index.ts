// Edge Function: provider-router
// Roteia chamadas (sendText / sendMedia / getStatus) para o provedor preferido
// do canal, com failover automático para fallback. Registra sessão + logs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "sendText" | "sendMedia" | "getStatus" | "ping";

interface RouteRequest {
  action: Action;
  channel_connection_id?: string;
  whatsapp_connection_id?: string;
  payload?: Record<string, unknown>;
}

interface ProviderConfig {
  id: string;
  name: string;
  provider_type: "evolution" | "wppconnect" | "baileys" | "custom";
  base_url: string;
  auth_token: string | null;
  config: Record<string, unknown>;
  status: string;
  is_active: boolean;
}

interface ChannelRoute {
  id: string;
  current_provider_id: string | null;
  primary: ProviderConfig | null;
  fallback: ProviderConfig | null;
  [key: string]: unknown;
}

const ENDPOINTS: Record<string, Record<Action, { method: string; path: string }>> = {
  evolution: {
    sendText:  { method: "POST", path: "/message/sendText/{instance}" },
    sendMedia: { method: "POST", path: "/message/sendMedia/{instance}" },
    getStatus: { method: "GET",  path: "/instance/connectionState/{instance}" },
    ping:      { method: "GET",  path: "/" },
  },
  wppconnect: {
    sendText:  { method: "POST", path: "/api/{instance}/send-message" },
    sendMedia: { method: "POST", path: "/api/{instance}/send-image" },
    getStatus: { method: "GET",  path: "/api/{instance}/status-session" },
    ping:      { method: "GET",  path: "/healthz" },
  },
  baileys: {
    sendText:  { method: "POST", path: "/sessions/{instance}/messages/text" },
    sendMedia: { method: "POST", path: "/sessions/{instance}/messages/media" },
    getStatus: { method: "GET",  path: "/sessions/{instance}/status" },
    ping:      { method: "GET",  path: "/health" },
  },
  custom: {
    sendText:  { method: "POST", path: "/sendText" },
    sendMedia: { method: "POST", path: "/sendMedia" },
    getStatus: { method: "GET",  path: "/status" },
    ping:      { method: "GET",  path: "/" },
  },
};

async function callProvider(
  provider: ProviderConfig,
  action: Action,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; status: number; body: unknown; latencyMs: number; error?: string }> {
  const map = ENDPOINTS[provider.provider_type] ?? ENDPOINTS.custom;
  const ep = map[action];
  const instance = (payload.instance as string) || (provider.config?.instance as string) || "default";
  const path = ep.path.replace("{instance}", instance);
  const url = provider.base_url.replace(/\/$/, "") + path;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.auth_token) {
    if (provider.provider_type === "evolution") headers["apikey"] = provider.auth_token;
    else headers["Authorization"] = `Bearer ${provider.auth_token}`;
  }

  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      method: ep.method,
      headers,
      body: ep.method === "GET" ? undefined : JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { ok: res.ok, status: res.status, body, latencyMs };
  } catch (e) {
    return {
      ok: false, status: 0, body: null, latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  const urlHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
  const urlDefault = Deno.env.get('SUPABASE_URL');
  const url = (typeof urlHosted === 'string' && urlHosted.length > 0)
    ? urlHosted
    : (typeof urlDefault === 'string' && urlDefault.length > 0 ? urlDefault : '');

  const serviceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
  const serviceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const serviceKey = (typeof serviceKeyHosted === 'string' && serviceKeyHosted.length > 0)
    ? serviceKeyHosted
    : (typeof serviceKeyDefault === 'string' && serviceKeyDefault.length > 0 ? serviceKeyDefault : '');

  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RouteRequest;
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null) {
      console.warn('[provider-router] invalid json: not an object', { type: typeof parsed });
      return new Response(JSON.stringify({ error: "invalid_json" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    body = parsed as RouteRequest;
  } catch (e) {
    console.error('[provider-router] json parse error', { error: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.action || typeof body.action !== "string") {
    console.warn('[provider-router] missing or invalid action', { action: body.action });
    return new Response(JSON.stringify({ error: "action_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Buscar rota do canal
  const channelRef = body.channel_connection_id
    ? { channel_connection_id: body.channel_connection_id }
    : body.whatsapp_connection_id
    ? { whatsapp_connection_id: body.whatsapp_connection_id }
    : null;

  if (!channelRef) {
    return new Response(JSON.stringify({ error: "channel_ref_required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: route } = await admin
    .from("channel_provider_routes")
    .select("*, primary:primary_provider_id(*), fallback:fallback_provider_id(*)")
    .match(channelRef)
    .maybeSingle();

  if (!route) {
    return new Response(JSON.stringify({ error: "no_route_for_channel" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const candidates: ProviderConfig[] = [];
  const typedRoute = route as unknown as ChannelRoute;
  const current = typedRoute.current_provider_id;
  const primary = typedRoute.primary;
  const fallback = typedRoute.fallback;

  // Ordem de tentativa: provedor atual (se ainda válido), primário, fallback
  if (current && primary && current === primary.id) {
    candidates.push(primary);
    if (fallback && fallback.is_active) candidates.push(fallback);
  } else if (current && fallback && current === fallback.id) {
    // Já estamos no fallback — tenta voltar para primário se online
    if (primary?.is_active && primary.status !== "offline") candidates.push(primary);
    candidates.push(fallback);
  } else {
    if (primary?.is_active) candidates.push(primary);
    if (fallback?.is_active) candidates.push(fallback);
  }

  if (candidates.length === 0) {
    return new Response(JSON.stringify({ error: "no_active_provider" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let lastError: string | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const provider = candidates[i];

    // Garante sessão aberta para este provider+canal
    const { data: sessionRow } = await admin
      .from("provider_sessions")
      .select("id")
      .eq("provider_id", provider.id)
      .match(channelRef)
      .is("ended_at", null)
      .maybeSingle();

    let sessionId: string | undefined;
    if (sessionRow && typeof sessionRow === 'object' && typeof sessionRow.id === 'string') {
      sessionId = sessionRow.id;
    }

    if (!sessionId) {
      const { data: newSession } = await admin
        .from("provider_sessions")
        .insert({ provider_id: provider.id, ...channelRef, status: "connecting" })
        .select("id")
        .single();
      if (newSession && typeof newSession === 'object' && typeof newSession.id === 'string') {
        sessionId = newSession.id;
      }
    }

    const result = await callProvider(provider, body.action, body.payload ?? {});

    await admin.from("provider_session_logs").insert({
      session_id: sessionId,
      provider_id: provider.id,
      level: result.ok ? "info" : "error",
      event: body.action,
      message: result.error ?? `HTTP ${result.status}`,
      latency_ms: result.latencyMs,
      payload: result.ok ? null : { status: result.status, body: result.body },
    });

    if (result.ok) {
      // Atualiza sessão e rota para o provedor que funcionou
      await admin.from("provider_sessions").update({
        status: "connected",
        last_heartbeat_at: new Date().toISOString(),
      }).eq("id", sessionId!);

      const previousCurrent = current;
      const providerId = typeof provider.id === 'string' ? provider.id : '';
      const providerName = typeof provider.name === 'string' ? provider.name : 'unknown';

      if (previousCurrent !== providerId && providerId) {
        const routeId = typeof typedRoute.id === 'string' ? typedRoute.id : '';
        if (routeId) {
          await admin.from("channel_provider_routes").update({
            current_provider_id: providerId,
            switched_reason: i === 0 ? "primary_recovered" : `fallback_to_${providerName}: ${lastError ?? "n/a"}`,
          }).eq("id", routeId);
        }
      }

      if (providerId) {
        await admin.from("provider_configs").update({
          status: "online",
          last_ping_at: new Date().toISOString(),
          last_ping_latency_ms: result.latencyMs,
          last_error: null,
        }).eq("id", providerId);
      }

      return new Response(JSON.stringify({
        ok: true,
        provider_id: provider.id,
        provider_name: provider.name,
        used_fallback: i > 0,
        latency_ms: result.latencyMs,
        body: result.body,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Falhou — marca degradação e tenta próximo
    lastError = result.error ?? `HTTP ${result.status}`;
    const failedProviderId = typeof provider.id === 'string' ? provider.id : '';
    if (failedProviderId) {
      await admin.from("provider_configs").update({
        status: i === candidates.length - 1 ? "offline" : "degraded",
        last_error: lastError,
        last_ping_at: new Date().toISOString(),
      }).eq("id", failedProviderId);
    }
  }

  return new Response(JSON.stringify({
    ok: false,
    error: "all_providers_failed",
    last_error: lastError,
  }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
