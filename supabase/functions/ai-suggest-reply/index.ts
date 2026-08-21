/**
 * STEP 4B Migration: ai-suggest-reply now forwards to unified ai-router
 */

import { handleCors, errorResponse, errorEnvelope, getCorsHeaders } from "../_shared/validation.ts";
import { parseRequestOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorEnvelope("unauthorized", "Unauthorized", 401, req);

    // Contrato ai-suggest-reply@v1 (estrito) — valida o payload da ação
    // suggest_reply antes de encaminhar ao ai-router (mesmo schema do handler).
    const parsed = await parseRequestOrReject('ai-suggest-reply', CONTRACT_SCHEMAS['ai-suggest-reply'], req, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    // Normalize: inbox sends 'messages', ai-router expects 'conversationHistory'
    const conversationHistory = body.conversationHistory ?? body.messages;
    if (!conversationHistory) return errorResponse("'conversationHistory' or 'messages' is required", 400, req);
    const requestId = body.requestId ?? crypto.randomUUID();
    const { messages: _m, ...restBody } = body as Record<string, unknown> & { messages?: unknown };

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorEnvelope("ai_router_not_configured", "AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...restBody, action: "suggest_reply", conversationHistory, requestId }),
      signal: AbortSignal.timeout(60_000),
    });

    const responseBody = await res.json().catch(() => ({ error: `Upstream HTTP ${res.status}` }));
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
