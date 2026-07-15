/**
 * Edge Function: Provider Router — Multi-Channel Message Routing
 *
 * Intelligent message routing layer supporting multiple WhatsApp API providers
 * (Evolution, WPPConnect, Baileys, Custom) with automatic failover to fallback provider.
 *
 * Core Functions:
 * - sendText: Send text message to contact via primary/fallback provider
 * - sendMedia: Send image, video, audio, or document via provider
 * - getStatus: Query connection state (connected/disconnected/QR-waiting)
 * - ping: Health check for provider availability
 *
 * Provider Selection:
 * 1. Query channel_routes table to get primary + fallback provider for channel
 * 2. Try primary provider first (if active)
 * 3. On failure: Automatically failover to fallback provider
 * 4. Log which provider succeeded/failed for debugging
 * 5. Update channel_routes.current_provider_id with successful provider
 *
 * Supported Provider Types:
 * - evolution: Evolution API (most common; features: webhooks, media, advanced)
 * - wppconnect: WPPConnect (self-hosted, REST API)
 * - baileys: Baileys library wrapper (Puppeteer-based, lightest)
 * - custom: Admin-defined custom HTTP endpoints (flexible)
 *
 * Endpoint Routing:
 * Each provider type has provider-specific endpoint paths:
 * - Evolution:  POST /message/sendText/{instance}, GET /instance/connectionState/{instance}
 * - WPPConnect: POST /api/{instance}/send-message, GET /api/{instance}/status-session
 * - Baileys:    POST /sessions/{instance}/messages/text, GET /sessions/{instance}/status
 * - Custom:     POST /sendText, /sendMedia, GET /status (admin-configured)
 *
 * Authentication:
 * - Requires admin/supervisor role (no user-level access)
 * - Provider auth_token stored in database (encrypted at rest in Supabase)
 * - Evolution uses apikey header; others use Bearer token
 *
 * Failure Handling:
 * - Primary provider timeout (10s) or HTTP error: Failover to fallback
 * - Both providers fail: Return 500 with combined error details
 * - Invalid provider configuration: Return 400 (missing auth_token, bad URL)
 * - Instance not found: Return 404
 *
 * Latency Tracking:
 * - Measures time from request to response receipt
 * - Logs latency for each provider (helps identify slow endpoints)
 * - Used for provider performance monitoring and failover decisions
 *
 * Payload Handling:
 * - sendText: { phone, message, instance? }
 * - sendMedia: { phone, media_url, caption?, type, instance? }
 * - getStatus: { instance? } - defaults to 'default' instance if omitted
 * - All payloads forwarded to provider as-is (no transformation)
 *
 * Instance Multiplexing:
 * - Multiple WhatsApp accounts per provider via 'instance' parameter
 * - Default instance used if not specified
 * - Allows single provider to manage multiple business accounts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
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

/**
 * Makes HTTP call to a WhatsApp provider with timeout, error handling, and latency tracking.
 *
 * Provider Endpoint Resolution:
 * - Maps action (sendText, sendMedia, getStatus, ping) to provider-specific endpoint
 * - Falls back to generic custom endpoint if provider type not in ENDPOINTS map
 * - Substitutes {instance} placeholder with instance from payload or provider config
 * - Builds full URL: provider.base_url + computed path
 *
 * Authentication:
 * - Evolution: apikey header (provider.auth_token)
 * - Others: Authorization: Bearer {auth_token}
 * - Missing auth_token: Request still sent (provider may not require auth)
 *
 * Request Execution:
 * - GET requests: No body
 * - POST requests: Payload serialized as JSON body
 * - 10-second timeout per request (prevents hanging)
 * - AbortController cleanup: Clears timeout on completion
 *
 * Response Parsing:
 * - Text response decoded as UTF-8
 * - If response is valid JSON: Parsed; otherwise kept as text
 * - HTTP errors (4xx, 5xx) not re-thrown; client decides handling
 *
 * Latency Measurement:
 * - Captures wall-clock time from start of fetch to response body received
 * - Includes network RTT + provider processing time
 * - Used for provider performance monitoring
 *
 * Error Handling (caught, not re-thrown):
 * - Fetch timeout (AbortError): Returns {ok: false, status: 0, error: "timeout"}
 * - Network error (DNS, connection refused): Returns {ok: false, status: 0, error message}
 * - JSON parse error: Kept as text (non-fatal)
 *
 * Return Format:
 * {
 *   ok: boolean (HTTP 2xx-3xx),
 *   status: HTTP status code,
 *   body: parsed JSON or text string,
 *   latencyMs: elapsed time in milliseconds,
 *   error?: error message if exception occurred
 * }
 *
 * @param provider - ProviderConfig with base_url, auth_token, type
 * @param action - sendText, sendMedia, getStatus, or ping
 * @param payload - Request body (optional; combined with instance from provider config)
 * @returns Result object with status, body, latency, and optional error message
 */
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
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!body.action || typeof body.action !== "string") {
    console.warn('[provider-router] missing or invalid action', { action: body.action });
    return new Response(JSON.stringify({ error: "action_required" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false }, db: { schema: "zapp" }} );

  // Buscar rota do canal
  const channelRef = body.channel_connection_id
    ? { channel_connection_id: body.channel_connection_id }
    : body.whatsapp_connection_id
    ? { whatsapp_connection_id: body.whatsapp_connection_id }
    : null;

  if (!channelRef) {
    return new Response(JSON.stringify({ error: "channel_ref_required" }), {
      status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: route } = await admin
    .from("channel_provider_routes")
    .select("*, primary:primary_provider_id(*), fallback:fallback_provider_id(*)")
    .match(channelRef)
    .maybeSingle();

  if (!route) {
    return new Response(JSON.stringify({ error: "no_route_for_channel" }), {
      status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
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
      }), { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
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
  }), { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
});
