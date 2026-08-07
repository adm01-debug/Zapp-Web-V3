# Runbook — 401s na Evolution API vindo de callers externos (workers/mcp/edge functions)

**Data do diagnóstico:** 2026-08-06 (13:15–13:58 UTC)
**Branch local:** `f2/runbook-fase2-20260805` (documento NÃO commitado)
**Instância afetada:** `wpp2` (conectada HOJE, `state=open` — NÃO derrubar)

---

## 1. Resumo executivo

- **Worker Cloudflare `evolution-mcp` (`evolution-mcp.adm01.workers.dev`) JÁ ESTÁ CORRETO** com a chave v5
  (`keySource=env`, `last401Ts=null`, `isHealthy=true` — verificado ao vivo em 2026-08-06T13:26:44Z).
  Os `GET /instance/connectionState/wpp2` a cada 5 min que retornam **200** vêm deste worker
  (egress Cloudflare `172.64.x/172.69.x/172.71.x`), disparados pelo health-probe do n8n
  (`GET /` do worker → `evo_status` → `connectionState` + `fetchInstances`).
- **Os 401s ativos vêm de IPs AWS (34.x/52.x/54.x/3.x/108.x/46.51.x/63.32.x) = egress das
  edge functions do Supabase CLOUD do repo `match`** (projeto `gwopzfulndgjtujbmxzj`), que
  ainda usam a chave antiga no secret `EVOLUTION_API_KEY` do projeto.
  - `supabase/functions/evolution-health/index.ts` → **CONFIRMADO 401 ao vivo** (fetchInstances → 401, 13:57Z).
  - Padrão observado no Traefik: `GET /instance/connectionState/wpp2` a cada 5 min (401) e
    `POST /message/sendText/wpp2` a cada 15 min (401, IP fixo `52.67.175.207` = sa-east-1).
- **NÃO existem credenciais Cloudflare** (CF_API_TOKEN / CF_ACCOUNT_ID / CLOUDFLARE / WRANGLER)
  em nenhum repositório da conta `adm01-debug` (verificado via `gh secret list` em ~25 repos).
  → Deploy de workers é **manual** (wrangler local / dashboard). Este documento é o passo-a-passo.
- **NÃO existem credenciais do Supabase Cloud do `match`** nos secrets do GitHub
  (sem `SUPABASE_ACCESS_TOKEN`/service role do projeto `gwopzfulndgjtujbmxzj`).
  → Atualização da chave das edge functions também é manual (CLI `supabase`).

---

## 2. Topologia dos callers (evidência)

| Caller | Onde está | Chave em | Estado (06/08 13:58Z) |
|---|---|---|---|
| Worker CF `evolution-mcp` | repo `adm01-debug/mcp-servers/evolution-mcp/src/worker.mjs` | Worker Secret `EVO_KEY` | ✅ v5 (200, `last401Ts=null`) |
| Probe n8n (5 min) | workflow n8n "Evolution MCP — Health Probe (fix #8)" (`workflows/health-probe.json` no repo mcp-servers) | — (chama o worker) | ✅ ok |
| Edge fn `evolution-health` (Supabase Cloud) | repo `adm01-debug/match/supabase/functions/evolution-health/` | Secret do Supabase Cloud `EVOLUTION_API_KEY` | ❌ **401 — chave antiga** |
| Edge fn `evolution-api` (proxy) | repo `adm01-debug/match/supabase/functions/evolution-api/` | Secret do Supabase Cloud `EVOLUTION_API_KEY` | ⚠️ 401 (mesma chave) |
| Edge fn `send-whatsapp` | repo `adm01-debug/match/supabase/functions/send-whatsapp/` | Secret do Supabase Cloud `EVOLUTION_API_KEY` | ⚠️ 401 (mesma chave) |
| Edge fn `evolution-health` (match-v2) | repo `adm01-debug/match-v2/supabase/functions/evolution-health/` | Secret do Supabase Cloud (projeto `syinhicmyrsdeaeyayjs`) | ⚠️ `url_set=false` (não ativa, mas alinhar) |
| Worker CF `evolution-webhook-proxy` | **não versionado** (deploy manual) | — (só recebe POST de webhooks) | ✅ 405 em GET = vivo, sem chave |

**Evidência da causa raiz (Traefik access log, `traefik_traefik_logs`):**
```
GET /instance/connectionState/wpp2 → 401  a cada 5 min exatos (:00/:05/:10/…) de IPs AWS rotativos
POST /message/sendText/wpp2         → 401  a cada 15 min (:00/:15/:30/:45) de 52.67.175.207 (AWS sa-east-1)
GET /instance/connectionState/wpp2 → 200  de 172.69.90.14 / 172.71.223.163 / 172.64.222.26 (Cloudflare = evolution-mcp v5)
GET //instance/fetchInstances      → 404  de 3.75.243.205 (barra dupla — edge fn com URL base com trailing slash)
```

Confirmação ao vivo (13:57Z): `GET https://gwopzfulndgjtujbmxzj.supabase.co/functions/v1/evolution-health`
→ `"fetch_instances": {"status": 401, "error": "Unauthorized"}` com `url_set=true, key_set=true`.

---

## 3. Ações necessárias

### 3.1 (Confirmar) Worker Cloudflare `evolution-mcp` — já atualizado

O worker lê `env.EVO_KEY` (Worker Secret). Se por algum motivo for necessário reaplicar:

```bash
# a) obter a chave v5 SEM imprimir em chat (via VPS, montando o secret em serviço temporário):
docker service create --name tmp-secret --secret evolution_api_key_v5_20260805 \
  --restart-condition none alpine:3.19 cat /run/secrets/evolution_api_key_v5_20260805
docker service logs tmp-secret   # copiar valor para a área de transferência (não colar em chats)
docker service rm tmp-secret

# b) atualizar o secret do worker (máquina com wrangler autenticado na conta adm01):
cd mcp-servers/evolution-mcp
wrangler secret put EVO_KEY --name evolution-mcp        # colar a chave v5
wrangler secret put EVO_URL --name evolution-mcp        # https://evolution.atomicabr.com.br
wrangler secret put EVO_DEFAULT_INSTANCE --name evolution-mcp  # wpp2

# c) validar (não derruba nada — só GET /health):
curl -s https://evolution-mcp.adm01.workers.dev/health
#  esperado: "keySource":"env", "last401Ts": null, "connection":"open", "isHealthy": true
```

> Alternativa via dashboard: Cloudflare → Workers & Pages → `evolution-mcp` → Settings → Variables
> (3 secrets: `EVO_KEY`, `EVO_URL`, `EVO_DEFAULT_INSTANCE`).

### 3.2 CORRIGIR a causa dos 401s ativos — Supabase Cloud do `match`

As edge functions do projeto **`gwopzfulndgjtujbmxzj`** (repo `adm01-debug/match`) precisam do
secret `EVOLUTION_API_KEY` = conteúdo do secret Swarm `evolution_api_key_v5_20260805`.

```bash
# a) obter a chave v5 sem imprimir (mesmo procedimento da seção 3.1a, ou na VPS:
#    docker exec <container com o secret> cat /run/secrets/evolution_api_key_v5_20260805)

# b) com supabase CLI autenticado no projeto do match:
cd match
supabase link --project-ref gwopzfulndgjtujbmxzj
supabase secrets set EVOLUTION_API_KEY='<chave v5>' \
  EVOLUTION_API_URL='https://evolution.atomicabr.com.br' \
  EVOLUTION_INSTANCE_NAME='wpp2'

# c) redeploy das edge functions afetadas (para garantir env nova):
supabase functions deploy evolution-health
supabase functions deploy evolution-api
supabase functions deploy send-whatsapp

# d) validar (sem derrubar a instância — a edge fn faz fetchInstances + connectionState):
curl -s https://gwopzfulndgjtujbmxzj.supabase.co/functions/v1/evolution-health
#  esperado: "fetch_instances": {"status": 200}, "connection_state": {"status": 200}
```

> ⚠️ **Correção de bug no repo `match`**: em `evolution-health/index.ts` e `evolution-api/index.ts`
> o `EVOLUTION_INSTANCE_NAME` está sendo usado com valor de URL em produção (o health check retornou
> `instance_name: "https://evolution.atomicabr.com.br/"`). Garantir que o secret
> `EVOLUTION_INSTANCE_NAME=wpp2` (não a URL) e, se quiser blindar, usar `EVOLUTION_INSTANCE_NAME` com
> `wpp2` explícito.

### 3.3 Alinhar match-v2 (preventivo)

Projeto `syinhicmyrsdeaeyayjs` (repo `match-v2`) tem `evolution-health` com `url_set=false`
(não está chamando a Evolution hoje, mas evitar drift futuro):

```bash
cd match-v2
supabase link --project-ref syinhicmyrsdeaeyayjs
supabase secrets set EVOLUTION_API_KEY='<chave v5>' \
  EVOLUTION_API_URL='https://evolution.atomicabr.com.br' \
  EVOLUTION_INSTANCE_NAME='wpp2'
supabase functions deploy evolution-health evolution-api send-whatsapp 2>/dev/null || true
```

---

## 4. Verificação final (após aplicar 3.2)

1. **Traefik** (VPS):
   ```bash
   docker exec <traefik-container> grep -E "(connectionState|sendText)/wpp2" /var/log/traefik/access-log | grep " 401 " | tail -5
   #  esperado: sem entradas novas 401 a partir do próximo ciclo (5 min / 15 min)
   ```
2. **Health check do worker** (deve continuar 200 — regressão zero):
   ```bash
   curl -s https://evolution-mcp.adm01.workers.dev/health | grep -E 'isHealthy|last401Ts'
   ```
3. **Instância wpp2**: `GET /instance/connectionState/wpp2` via MCP evolution (`evo_status`) →
   `state=open` (NÃO derrubar; nenhum passo acima reinicia a instância).

---

## 5. Notas / pendências

- **Sem credenciais Cloudflare no GitHub** → nenhum secret de worker pode ser rotacionado via CI;
  o deploy de workers é manual (wrangler na máquina do Joaquim).
- **Sem credenciais do Supabase Cloud (match)** → a correção 3.2 é manual via `supabase` CLI
  (usuário dono do projeto) ou dashboard (Edge Functions → Secrets).
- O padrão `GET //instance/fetchInstances` (404, barra dupla) indica que alguma edge function
  concatena URL base com trailing slash — corrigir a config de `EVOLUTION_API_URL` (sem `/` final).
- Se os 401s de `sendText` persistirem após 3.2, checar o agendador que chama as edge functions
  (cron/pg_cron no projeto match — não versionado) — ver `supabase/migrations/*.sql` do match-v2
  (pg_cron+pg_net habilitados) e o workflow `proactive-alerts` (a cada 5 min).
