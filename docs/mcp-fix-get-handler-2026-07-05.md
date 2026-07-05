## MCP Server Fix — GET /mcp Handler + Regex Routing
**Data:** 2026-07-05  
**Problema:** SUPABASE SELF HOSTED - MCP não processava tool calls do Claude.ai

### Root Cause
O servidor MCP (`supabase-db-mcp-server:latest`) tinha 3 bugs críticos:

1. **Rota incorreta**: `app.post("/mcp")` só aceitava exatamente `/mcp`, mas Claude.ai envia requests para `/s-a50174164e4b03ef181a29db65d2db80/mcp` (com server-id prefix). Todos os requests retornavam 404 silenciosamente.

2. **GET handler ausente**: O servidor não tinha `app.get("/mcp")`. O cliente Claude.ai tentava abrir um SSE stream via GET, recebia 404, e interpretava como falha de sessão — abortando antes de enviar qualquer tool call.

3. **Permissão negada**: Patch não funcionava como `mcpuser` (sem escrita em `/app/dist/`). Solução: rodar como root no startup e fazer `chown` depois.

### Fix Aplicado
Swarm service command atualizado para executar patch base64 no startup:
```bash
export DATABASE_URL=$(cat /run/secrets/supabase_db_url_v1)
echo 'BASE64_PATCH' | base64 -d | node  # aplica patch como root
chown mcpuser:mcpuser /app/dist/index.js
exec su -s /bin/sh mcpuser -c 'exec docker-entrypoint.sh node dist/index.js'
```

O patch JavaScript aplica 2 mudanças em `index.js`:
```javascript
// ANTES:
app.post("/mcp", apiKeyAuth, rateLimiter, ...)
app.use((_req, res) => { res.status(404)... })

// DEPOIS:
app.post(/\/mcp$/, apiKeyAuth, rateLimiter, ...)  // aceita qualquer path terminando em /mcp
app.get(/\/mcp$/, apiKeyAuth, rateLimiter, async (req, res) => {
  // SSE stream handler — necessário para Claude.ai MCP client
  const rS = createServer();
  const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { t.close(); void rS.close(); });
  await rS.connect(t);
  await t.handleRequest(req, res, req.body);
}); /* GMCP_HANDLER */
app.use((_req, res) => { res.status(404)... })
```

### Diagnóstico Completo
- **MCP tool calls via exec interno**: funcionavam (só testando `/mcp` direto)
- **MCP via Claude.ai**: falhavam porque requests chegavam em `/s-a.../mcp` → 404
- **Verificado**: `wget http://127.0.0.1:3100/s-XXX.../mcp` → 404 (antes) vs 200 (depois)

### Estado Atual
- Score: 94.2/A (pipeline silencioso 13h — resolve com próximo evento real)
- wpp2: CONNECTED ✅ (reconcile via phone-match)
- MCP: ONLINE ✅ (porta 3100, GET+POST /.*mcp$/)
- 131 crons OK / 0 falhas
- 1 alerta legítimo (high_value_deal)
