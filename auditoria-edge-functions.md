# 📋 INVENTÁRIO COMPLETO DE EDGE FUNCTIONS — SUPABASE SELF-HOSTED

**Runtime:** edge-runtime v1.74.0 | **Container:** Up 2h (saudável)  
**Total de funções:** 120 deployadas | **Host:** VPS AtomicaBR (self-hosted)  
**Data da auditoria:** 30/07/2026 16:10 BRT  

---

## 📊 RESUMO GERAL

| Indicador | Quantidade |
|-----------|-----------|
| Total de funções | **120** |
| ✅ Saudáveis (ping 200) | **8** |
| ⚠️ Degradados/Config pendente | **6** |
| ❌ Com bugs/erros | **5** |
| 🔒 Auth required (esperado) | **108** |

---

## ✅ FUNÇÕES SAUDÁVEIS (ping 200)

| Função | Status | Observação |
|--------|--------|-----------|
| `health-check` | ✅ 200 | HEALTHY. DB conectado. latência 44ms |
| `status` | ✅ 200 | zapp-web-edge ativo |
| `connection-health-check` | ✅ 200 | 2 instâncias monitoradas |
| `mcp-server` | ✅ 200 | MCP Server ativo, protocolo 1.0 |
| `evolution-sender` | ✅ 200 | v6. Enfileiramento/envio |
| `evolution-followup` | ✅ 200 | v3. Follow-up automático |
| `evolution-templates` | ✅ 200 | Templates HSM (0 templates) |
| `webhook-diagnostic` | ✅ 200 | Diagnóstico completo |

---

## ⚠️ FUNÇÕES DEGRADADAS

| Função | Status | Problema |
|--------|--------|----------|
| `evolution-health` | ⚠️ 200 degraded | Webhook não configurado, database disconnected |
| `whatsapp-cloud-send` | ⚠️ 405 | Método não permitido (GET) — só aceita POST |
| `provider-router` | ⚠️ 405 | Método não permitido (GET) — só aceita POST |
| `ticket-router` | ⚠️ 405 | Método não permitido (GET) — só aceita POST |

---

## ❌ FUNÇÕES COM ERROS

| Função | Status | Erro |
|--------|--------|------|
| `evolution-chatbot` | ❌ 500 | Unexpected end of JSON input |
| `evolution-sentiment` | ❌ 404 | Endpoint não encontrado |
| `evolution-bitrix-sync` | ❌ 503 | Bitrix24 não configurado (BITRIX_WEBHOOK_URL ausente) |
| `whatsapp-webhook` | ❌ 500 | Configuration error |

---

## 🎯 INTERAÇÃO COM EVOLUTION API

### Funções Evolution (12)

| Função | Status | Descrição |
|--------|--------|-----------|
| **evolution-api** | 🔒 Auth req | **Proxy PRINCIPAL** para Evolution API (~2000+ linhas). Encaminha TODAS as ações: criar instâncias, conectar WhatsApp, enviar mensagens (texto/mídia/áudio/sticker/localização), gerenciar grupos, webhooks, Chatwoot, Typebot, OpenAI, Dify, Fluxo de bots. Usa env vars `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`. Código-fonte verificado — lógica robusta com rate limiting, anti-phantom-instance (UUID guard), fallback de perfil, pause automático. |
| **evolution-webhook** | 🔒 Auth req | Recebe webhooks da Evolution API via HMAC. Logs ativos: processando `chats.update` para instância wpp2. HMAC signature validada com sucesso em todas as requisições. |
| **evolution-health** | ⚠️ Degraded | Reporta: API reachable (67ms), webhook NÃO configurado, database disconnected. Instância wpp2 conectada (state: open). |
| **evolution-sender** | ✅ Healthy | v6. Enfileira e envia mensagens pendentes via Evolution API. 0 na fila. |
| **evolution-followup** | ✅ Healthy | v3. Follow-up automático de conversas via Evolution. |
| **evolution-templates** | ✅ Healthy | Gerencia templates HSM (Cloud API) na Evolution. |
| **evolution-sync** | 🔒 Auth req | Sincroniza dados da Evolution para o Supabase (contatos, chats, mensagens). |
| **evolution-credentials** | 🔒 Auth req | Gerencia credenciais de instâncias Evolution. |
| **evolution-retry-metrics** | 🔒 Auth req | Métricas de retry de webhooks Evolution. |
| **evolution-sentiment** | ❌ 404 BUG | Endpoint não encontrado — GET sem rota definida. |
| **evolution-chatbot** | ❌ 500 BUG | Unexpected end of JSON input — corpo JSON ausente/inválido. |
| **evolution-bitrix-sync** | ❌ 503 Não config | BITRIX_WEBHOOK_URL não configurada. |

### Funções WhatsApp Cloud API (7)

| Função | Status | Descrição |
|--------|--------|-----------|
| `whatsapp-cloud-api` | 🔒 Auth req | Proxy WhatsApp Cloud API |
| `whatsapp-cloud-webhook` | 🔒 Auth req | Webhook Cloud API |
| `whatsapp-cloud-webhook-verify` | 🔒 | Verificação de webhook |
| `whatsapp-cloud-send` | ⚠️ 405 | Método não permitido (GET) |
| `whatsapp-cloud-secrets-status` | 🔒 | Status de secrets |
| `fetch-whatsapp-avatar` | 🔒 | Busca avatar WhatsApp |
| `whatsapp-webhook` | ❌ 500 | Configuration error |

### Instâncias Evolution Detectadas

Via `webhook-diagnostic`:

| Instance ID | Phone | Status | Webhook | Fluxo (última hora) |
|-------------|-------|--------|---------|-------------------|
| *(null)* | — | ❌ disconnected | ❌ URL vazia | Sem tráfego |
| f7a73e2c-327d-426c-8fa6-6ea7743ace02 | 551146375517 | ✅ connected (open) | ❌ URL vazia | 252 in / 267 out (519 total) |
| a422ee94-0f5b-4bd1-8e6b-d9e08c50dc95 | 556484450900 | ❌ error (não existe) | ❌ URL vazia | Sem tráfego |

**Overall health score:** 20/100 — **CRITICAL**

---

## 🔒 FUNÇÕES COM AUTENTICAÇÃO (108 — comportamento esperado)

A maioria das funções requer JWT Bearer token ou x-api-key. Isso é esperado para funções que manipulam dados sensíveis. As respostas 401/403 confirmam que a proteção está ativa.

### Categorias:
- **AI/ML (16):** ai-auto-tag, ai-churn-analysis, ai-classify-tickets, ai-conversation-analysis, ai-conversation-summary, ai-enhance-message, ai-proxy, ai-router, ai-suggest-reply, ai-transcribe-audio, classify-audio-meme, classify-emoji, classify-sticker, speech-to-text, chatbot-l1, automation-suggest-reply
- **Evolution (5):** evolution-api, evolution-webhook, evolution-sync, evolution-credentials, evolution-retry-metrics
- **WhatsApp Cloud (5):** whatsapp-cloud-api, whatsapp-cloud-webhook, whatsapp-cloud-webhook-verify, whatsapp-cloud-secrets-status, fetch-whatsapp-avatar
- **Webhook/Diagnóstico (4):** webhook-hmac-selftest, webhook-secret-status, recheck-webhook-signature, e2e-webhook-fixture
- **Gmail/Email (10):** gmail-health, gmail-oauth, gmail-send, gmail-sync, gmail-token-refresh, gmail-webhook, outlook-oauth, email-imap-bridge, email-track-link, email-track-pixel
- **ElevenLabs/Áudio (14):** elevenlabs-agent-token, elevenlabs-dialogue, elevenlabs-scribe-token, elevenlabs-sfx, elevenlabs-sts, elevenlabs-tts, elevenlabs-tts-stream, elevenlabs-voice, elevenlabs-voice-design, elevenlabs-webhook, audio-transcribe, voice-agent, voice-changer, voice-copilot-action
- **Infra/Utilitários (54):** demais funções de backup, SLA, financeiro, segurança, test fixtures

---

## 🔍 LOGS RECENTES — EVOLUTION WEBHOOK

Os logs do serviço `supabase_functions` mostram:

```
serving the request with /home/deno/functions/evolution-webhook
[Info] [HMAC] Signature validated successfully
[Info] [webhook][...uuid...] received raw=chats.update norm=chats.update instance=wpp2
```

**Conclusão:** O webhook da Evolution está ativo e processando eventos `chats.update` da instância `wpp2`. HMAC validation bem-sucedido continuamente.

---

## ⚠️ ALERTAS E RECOMENDAÇÕES

1. **🟠 CRÍTICO — Webhook URL não configurada nas instâncias Evolution**
   - Nenhuma das 3 instâncias tem webhook URL configurada na Evolution API.
   - Esperado: `http://kong:8000/functions/v1/evolution-webhook`
   - Impacto: eventos críticos (MESSAGES_UPSERT, CONNECTION_UPDATE, QRCODE_UPDATED) não chegam.
   - **Ação:** Configurar webhook via `evolution-api` com `action=set-webhook`.

2. **❌ BUG — evolution-chatbot (500)**
   - Unexpected end of JSON input. Precisa de corpo JSON na requisição.
   - **Ação:** Verificar handler GET vs POST na função.

3. **❌ BUG — evolution-sentiment (404)**
   - Endpoint não encontrado. GET sem rota definida.
   - **Ação:** Adicionar rota ou redirecionar para POST.

4. **⚠️ evolution-health reporta database disconnected**
   - Embora o health-check geral esteja healthy, o evolution-health não consegue conectar ao DB.
   - **Ação:** Verificar env vars e permissões da função.

5. **🟢 evolution-bitrix-sync sem configuração**
   - BITRIX_WEBHOOK_URL ausente. Esperado se Bitrix24 não está em uso.
   - **Ação:** Configurar ou documentar como desativado intencionalmente.

---

*Auditoria realizada via Supabase MCP (functions_list, functions_ping, functions_invoke), Portainer MCP (exec_container, service_logs) e análise de código-fonte.*
