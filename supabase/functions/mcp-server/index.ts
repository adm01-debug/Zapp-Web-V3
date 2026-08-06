import { getCorsHeaders, handleCors } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * MCP Server for Claude / AI Agents
 * Implements the Model Context Protocol over HTTP
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const url = new URL(req.url);
    const raw = await req.json().catch(() => ({}));
    const parsed = parseOrReject("mcp-server", CONTRACT_SCHEMAS["mcp-server"], req, raw, {
      extraHeaders: corsHeaders,
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, any>;

    // Basic MCP request handling
    // In a real implementation, we'd list tools and execute them
    if (body.method === "list_tools") {
      return new Response(JSON.stringify({
        tools: [
          { name: "list_connections", description: "List all active WhatsApp instances" },
          { name: "get_instance_status", description: "Check if an instance is online" }
        ]
      }), { status: 200, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "MCP Server is active",
      protocol: "1.0"
    }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

  } catch (error) {
    console.error('[mcp-server] unhandled error:', error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
