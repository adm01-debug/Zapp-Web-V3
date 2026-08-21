import { getCorsHeaders, handleCors, readJsonBodyOrEmpty } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * MCP Server for Claude / AI Agents — implementação REAL (R2, 2026-08-18).
 *
 * Substitui a fachada anterior (que admitia "In a real implementation, we'd
 * list tools and execute them" e retornava sucesso sem executar NADA — ver
 * auditoria features-fachada + simulação R2). Decisão do simulador:
 * CONSTRUIR como MCP real com tools READ-ONLY e RLS (mesmo espírito da
 * variante `mcp` auto-gerada), auth JWT do app (requireUser), zero escrita
 * e zero SQL público.
 *
 * Protocolo: JSON-RPC 2.0 sobre HTTP (initialize, tools/list, tools/call).
 * Tools:
 *   - whoami                  → identidade do usuário autenticado
 *   - list_whatsapp_connections → instâncias visíveis ao usuário (RLS)
 *   - search_contacts         → busca de contatos visíveis ao usuário (RLS)
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const url = new URL(req.url);
    if (url.pathname.endsWith("/health") || req.method === "GET") {
      return new Response(JSON.stringify({ ok: true, service: "mcp-server", contract: "mcp-server@v1" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await readJsonBodyOrEmpty(req);
    const parsed = parseOrReject("mcp-server", CONTRACT_SCHEMAS["mcp-server"], req, raw, {
      extraHeaders: corsHeaders,
    });
    if (parsed.ok === false) return parsed.response;

    const body = parsed.data as Record<string, unknown>;
    const method = typeof body.method === "string" ? body.method : "";
    const id = body.id ?? null;

    const jsonRpcError = (code: number, message: string) =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "zapp-mcp-server", version: "1.0.0" },
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (method === "tools/list") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            { name: "whoami", description: "Retorna informações do usuário autenticado (ID, e-mail).", inputSchema: { type: "object", properties: {} } },
            { name: "list_whatsapp_connections", description: "Lista as instâncias WhatsApp visíveis ao usuário (RLS).", inputSchema: { type: "object", properties: {} } },
            { name: "search_contacts", description: "Busca contatos visíveis ao usuário (RLS) por termo (nome, telefone ou JID).", inputSchema: { type: "object", properties: { q: { type: "string", description: "termo de busca" }, limit: { type: "number", description: "máx. resultados (padrão 20, teto 50)" } }, required: ["q"] } },
          ],
        },
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (method === "tools/call") {
      const params = (body.params ?? {}) as Record<string, unknown>;
      const toolName = typeof params.name === "string" ? params.name : "";
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const supabase = createZappClient(req);

      if (toolName === "whoami") {
        const { data: user } = await supabase.auth.getUser();
        if (!user?.user) return jsonRpcError(-32001, "Não autenticado.");
        const { data: profile } = await supabase.from("profiles").select("id, full_name, role").eq("user_id", user.user.id).maybeSingle();
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify({ user_id: user.user.id, email: user.user.email ?? null, profile: profile ?? null }, null, 2) }],
            structuredContent: { user_id: user.user.id, email: user.user.email ?? null, profile: profile ?? null },
          },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (toolName === "list_whatsapp_connections") {
        const { data, error } = await supabase.from("whatsapp_connections").select("instance_name, is_active, status").order("instance_name");
        if (error) return jsonRpcError(-32002, `Erro ao listar conexões: ${error.message}`);
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }], structuredContent: data ?? [] },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (toolName === "search_contacts") {
        const q = typeof args.q === "string" ? args.q.trim() : "";
        if (!q) return jsonRpcError(-32602, "Parâmetro 'q' é obrigatório.");
        const limit = Math.min(Math.max(typeof args.limit === "number" ? args.limit : 20, 1), 50);
        let query = supabase.from("contacts").select("id, name, phone, remote_jid, instance_name").limit(limit);
        query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,remote_jid.ilike.%${q}%`);
        const { data, error } = await query;
        if (error) return jsonRpcError(-32003, `Erro na busca de contatos: ${error.message}`);
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }], structuredContent: data ?? [] },
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return jsonRpcError(-32601, `Método não encontrado: ${toolName}`);
    }

    return jsonRpcError(-32601, `Método não encontrado: ${method}`);
  } catch (error) {
    console.error("[mcp-server] unhandled error:", error);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal server error" } }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
