/**
 * STEP 4B Migration: ai-transcribe-audio now forwards to unified ai-router
 */

import { handleCors, errorResponse, getCorsHeaders } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    const body = await req.json();
    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorResponse("AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "transcribe_audio" }),
      signal: AbortSignal.timeout(60_000),
    });

    let responseBody: unknown;
    try {
      responseBody = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `Upstream error: HTTP ${res.status}`, detail: text.slice(0, 200) }),
        {
          status: res.ok ? 502 : res.status,
          headers: { ...getCorsHeaders(req), "content-type": "application/json" },
        }
      );
    }
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
