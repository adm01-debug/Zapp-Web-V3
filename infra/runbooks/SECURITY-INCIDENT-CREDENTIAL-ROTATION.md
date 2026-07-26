# Runbook: Rotação de Credenciais — Incidente de Segurança

**Data:** 2026-07-26
**Gatilho:** Credencial potencialmente exposta via repositório público / histórico git
**Responsável:** TI + DPO
**SLA:** Rotação em ≤ 1 hora após detecção

---

## Etapas 1 e 2 do Plano 50 Etapas — Onda 0

### 🔴 CRITICIDADE: INCIDENTE ATIVO

O arquivo `.mcp.json` (histórico git) continha o endpoint autenticado do MCP Supabase
(`https://supabase-mcp.atomicabr.com.br/s-{TOKEN}/mcp`) enquanto o repositório era público.
O token embutido no path da URL concede acesso a: SQL arbitrário, storage, auth, meta.

**Período de exposição:** confirmar no log de acesso do nginx/Cloudflare Worker.

---

## Rotação Obrigatória (Ordem de Execução)

### 1. Token MCP Supabase (CRÍTICO — PRIMEIRO)

```bash
# No servidor VPS (via Portainer ou SSH):
# 1. Localizar o serviço supabase-mcp
docker service ls | grep mcp

# 2. Revogar token atual e emitir novo
# O token está no path da URL — revogar requer reiniciar o serviço com novo SECRET
# Atualizar docker-compose/stack com novo TOKEN
docker service update --env-add MCP_TOKEN=<novo_token_uuid> supabase_mcp

# 3. Atualizar .mcp.json local (NÃO commitar)
# Trocar o segmento s-XXXXXXXX pelo novo token
```

**Critério de aceite:** request ao endpoint antigo → 401/404

---

### 2. Supabase Service Role Key

```bash
# Supabase Dashboard → Project Settings → API
# 1. "Roll" service_role key
# 2. Atualizar em todos os ambientes:

# Docker stacks (VPS):
docker secret create supabase_service_role_key_v2 -
# Atualizar cada serviço que usa o secret

# Vercel (frontend):
# Settings → Environment Variables → atualizar SUPABASE_SERVICE_ROLE_KEY

# N8N:
# Credentials → Supabase → atualizar service key

# Edge Functions:
# Redeploy automático após rotação do projeto Supabase
```

---

### 3. Supabase Anon Key + JWT Secret

```bash
# Supabase Dashboard → Project Settings → API
# Rolar anon key
# Atualizar VITE_SUPABASE_ANON_KEY no Vercel
# Atualizar nos docker stacks Evolution + outros consumidores
```

---

### 4. Evolution API Key

```bash
# Evolution API → /instance/setGlobalApiKey (ou via env AUTHENTICATION_API_KEY)
docker service update --env-add AUTHENTICATION_API_KEY=<novo_valor> evolution_api
# Atualizar em: N8N credentials, Supabase secrets (evo_api_key), edge functions
```

---

### 5. Token Portainer

```bash
# Portainer → Settings → Authentication → API Keys
# Revogar token atual, emitir novo com escopo mínimo
```

---

### 6. GitHub PAT (VPS)

```bash
# GitHub → Settings → Developer Settings → Personal Access Tokens
# Revogar PAT antigo
# Criar novo com escopos mínimos: repo (se necessário), read:packages
# Atualizar no servidor VPS
```

---

## Inventário de Consumidores de Cada Credencial

| Credencial              | Consumidores                                    |
|-------------------------|-------------------------------------------------|
| Supabase service_role   | Edge Functions, N8N, VPS scripts, supabase-mcp  |
| Supabase anon key       | Frontend (Vercel), Evolution API webhook         |
| Evolution API Key       | N8N, Supabase edge functions, webhooks           |
| Portainer token         | Scripts de deploy, agentes CI                   |
| GitHub PAT              | Scripts VPS, CI/CD pipeline                     |

---

## Confirmação de Rotação

Após cada rotação, verificar:

```bash
# Testar autenticação com credencial nova
curl -H "Authorization: Bearer <nova_key>" https://supabase.atomicabr.com.br/rest/v1/ -I

# Confirmar que serviços continuam funcionando
# Portainer → Stacks → verificar containers Running

# Testar envio de mensagem WhatsApp (smoke test)
curl -X POST https://evolution.atomicabr.com.br/message/sendText/wpp2 \
  -H "apikey: <nova_evolution_key>" \
  -d '{"number":"5500000000000","text":"teste rotação"}'
```

---

## Registro Pós-Incidente

| Item | Status | Responsável | Data |
|------|--------|-------------|------|
| Token MCP Supabase rotacionado | ⏳ | TI | — |
| service_role key rotacionada | ⏳ | TI | — |
| anon key rotacionada | ⏳ | TI | — |
| Evolution key rotacionada | ⏳ | TI | — |
| Portainer token rotacionado | ⏳ | TI | — |
| GitHub PAT rotacionado | ⏳ | TI | — |
| Confirmação de que nenhum serviço quebrou | ⏳ | TI | — |
| Avaliação LGPD (ver E11) | ⏳ | DPO | — |
| Notificação à ANPD (se aplicável) | ⏳ | DPO | — |

---

*Parte do Plano 50 Etapas — Etapas 1 e 2 (Onda 0 — Segurança)*
