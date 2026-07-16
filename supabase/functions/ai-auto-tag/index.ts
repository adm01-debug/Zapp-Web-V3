/**
 * STEP 4B Migration: ai-auto-tag now forwards to unified ai-router
 *
 * This function maintains backward compatibility while delegating to the
 * unified router. All handler logic, rate limiting, circuit breaker, and
 * timeout management now occur centrally in ai-router.
 *
 * Benefits:
 * - Single cold start instead of individual function startup overhead
 * - Unified observability and metrics collection
 * - Shared circuit breaker state across all AI operations
 * - Centralized error handling and retry logic
 */

import { handleCors, errorResponse, getCorsHeaders } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Extract auth header and forward as-is to ai-router
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return errorResponse("Unauthorized", 401, req);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400, req);
    }

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorResponse("AI_ROUTER_URL not configured", 503, req);
    const forwardResponse = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries(
          [...req.headers.entries()]
            .filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")
        ),
      },
      body: JSON.stringify({ ...body, action: "auto_tag" }),
    });

    const responseBody = await forwardResponse.json();
    return new Response(JSON.stringify(responseBody), {
      status: forwardResponse.status,
      headers: {
        ...getCorsHeaders(req),
        "content-type": "application/json",
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Proxy error: ${errorMsg}`, 502, req);
  }
});
