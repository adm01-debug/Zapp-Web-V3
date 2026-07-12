/**
 * STEP 4B Migration: ai-conversation-analysis now forwards to unified ai-router
 */

import { handleCors, errorResponse, getCorsHeaders } from "../_shared/validation.ts";

/**
 * Edge Function: Comprehensive AI Conversation Analysis
 *
 * Performs deep analysis of customer/contact conversations across multiple business departments.
 * Evaluates sentiment, urgency, satisfaction, agent performance, churn risk, and business opportunities.
 * Aggregates contact context (history, metadata) for richer AI analysis and persists findings to database.
 *
 * Security: RLS-enforced queries prevent cross-tenant data access; service role bypasses for admin context only.
 * Error Handling: Two-tier JSON parsing with regex fallback ensures graceful degradation on malformed AI responses.
 * Persistence: Atomically updates both conversation_analyses table and contacts record (ai_sentiment, ai_priority).
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    const body = await req.json();
    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL") || "http://localhost:54321/functions/v1/ai-router";
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ action: "conversation_analysis", ...body }),
    });

    const responseBody = await res.json();
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
