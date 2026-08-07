/**
 * STEP 4B Migration: ai-conversation-summary now forwards to unified ai-router
 */

import { handleCors, errorResponse, getCorsHeaders } from "../_shared/validation.ts";
import { parseRequestOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * Edge Function: AI Conversation Summary Generator
 *
 * Generates AI-powered summaries and analyses of customer/contact conversations.
 * Extracts conversation context (contact info, historical analyses), sends to AI API,
 * and persists results to Supabase database. Implements rate limiting, user authentication,
 * and dual-tier JSON parsing to handle AI response variations gracefully.
 *
 * Security: Uses RLS-enforced callerClient for writes to prevent cross-tenant data access.
 * Error Handling: Protected JSON parsing with regex fallback prevents production crashes.
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    // Contrato ai-conversation-summary@v1 (estrito) — payload da ação
    // conversation_summary validado antes de encaminhar ao ai-router.
    const parsed = await parseRequestOrReject('ai-conversation-summary', CONTRACT_SCHEMAS['ai-conversation-summary'], req, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorResponse("AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "conversation_summary" }),
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
