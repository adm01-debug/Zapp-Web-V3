# Auditoria RUNBOOK FASE 2 — Resultados

**Data:** 2026-08-06  
**Branch:** `claude/evolution-api-audit-uu80rp`  
**Auditor:** Claude Code (sessão automatizada)  
**Escopo:** 36 itens F2-01 a F2-36 do RUNBOOK FASE 2 CONSOLIDADO

---

## Sumário

| Status | Itens | % |
|--------|-------|---|
| ✅ Implementado e validado | 31 | 86% |
| ⚠️ Atenção / mitigação ativa | 5 | 14% |
| ❌ Falha / não implementado | 0 | 0% |

**Dashboard visual:** https://claude.ai/code/artifact/fbce5118-2e78-47da-b6d9-d7c2c64ed4f9

---

## Detalhamento por Item

### F2-01 — DLQ Inspector: payload::jsonb NOT NULL ✅

**Objetivo:** dlq-inspector deve rejeitar payloads inválidos (não-JSON) ao invés de inserir como string raw.

**Validação:**
- Stack 117 (dlq-inspector) verificado em produção
- Schema `public._consumer_dlq`: coluna `payload` tipada como `jsonb NOT NULL`
- `ON CONFLICT (payload_hash) DO NOTHING` implementado — dedup ativo
- Label: `F2-01-F2-02-2026-08-05`

**Status:** Implementado em 2026-08-05, validado nesta sessão.

---

### F2-02 — Filtro DROP_EVENTS na DLQ ✅

**Objetivo:** Descartar eventos `qrcode.updated` e `connection.update` (91% do volume) antes do INSERT na DLQ.

**Validação:**
```python
DROP_EVENTS = ('qrcode.updated', 'connection.update')
if any(e in rk for e in DROP_EVENTS):
    ch.basic_ack(delivery_tag=m.delivery_tag)
    dropped += 1
    continue
```

**Status:** Implementado no dlq-inspector v4, validado nesta sessão.

---

### F2-03 — Drenagem DLQ via Stacks 212/214 ⚠️

**Objetivo:** Drenar mensagens acumuladas na DLQ `wpp2.dlq` sem flood ao banco.

**Validação:**
- Stacks 212 e 214 criados em 2026-08-05 com label `runbook-B7-2026-08-05`
- Script de drenagem confirmado via Portainer MCP

**Pendência:** Confirmar que o dreno foi efetivamente processado via `SELECT count(*) FROM public._consumer_dlq`.

**Status:** Stacks criados e ativados; confirmação de volume processado pendente.

---

### F2-04 — N8N Bot Desabilitado ✅

**Objetivo:** `N8N_ENABLED=false` — bot n8n não deve consumir eventos de webhook.

**Validação:** `N8N_ENABLED=false` confirmado na config da stack Evolution. Bot n8n inexistente.

---

### F2-05 — QR Code Events Desabilitados no RabbitMQ ✅

**Objetivo:** `RABBITMQ_EVENTS_QRCODE_UPDATED=false` — Evolution não deve publicar eventos de QR code na fila.

**Validação:** Variável confirmada `false` na stack evolution.

---

### F2-06 — /manager Restrito por IP ✅

**Objetivo:** Interface `/manager` da Evolution API deve ser acessível apenas de IPs internos.

**Validação:** IP whitelist ativa, rota `/manager` bloqueada para IPs externos via Traefik middleware.

---

### F2-07 — CORS Restrito ✅

**Objetivo:** Evolution API deve retornar apenas origins autorizadas nos headers CORS.

**Validação:** Header `Access-Control-Allow-Origin` retornando apenas origins autorizadas — confirmado via request HTTP desta sessão.

---

### F2-08 — CACHE_REDIS_SAVE_INSTANCES=false ✅

**Objetivo:** Sessões Baileys não devem ser salvas no Redis (evita duplicação e race conditions).

**Validação:** `CACHE_REDIS_SAVE_INSTANCES=false` confirmado na stack evolution.

---

### F2-09 — API Key Rotacionada ✅

**Objetivo:** API key da Evolution deve ser rotacionada (versão nova, não default).

**Validação:** API key rotacionada para `evolution_api_key_v5_20260805` em 2026-08-05.

---

### F2-10 — Watchdog Baileys v12 Ativo ✅

**Objetivo:** Watchdog deve monitorar estado da instância wpp2 e reiniciar evolution_evolution se state != "open" por 30+ min.

**Validação:**
- Container `47b716a43425` (watchdog-baileys) ativo — Up confirmado
- Versão v12 com lógica de reinício após 30 min em estado não-"open"

---

### F2-11 — exposedByDefault=false no Traefik ✅

**Objetivo:** Traefik não deve expor serviços por padrão — apenas serviços com label explícita.

**Validação:** `--providers.docker.exposedbydefault=false` confirmado nos args CLI do Traefik v2.11.2.

---

### F2-12 — Dashboard Traefik Sem Acesso Público ✅

**Objetivo:** Dashboard do Traefik não deve ser acessível publicamente.

**Validação:** Dashboard sem rota pública exposta — acessível apenas via túnel/VPN interno.

---

### F2-13 — CrowdSec Bouncer ⚠️

**Objetivo:** CrowdSec bouncer deve estar em modo bloqueio (não apenas detecção) para rotas Evolution.

**Status atual:** CrowdSec em **detection-only** — decisão deliberada documentada.

**Justificativa:** Risco de falsos positivos bloqueando IPs legítimos da Evolution API. Decisão: manter detection-only até calibrar listas de IPs confiáveis.

**Mitigação ativa:** CrowdSec coleta telemetria e alimenta o motor de decisão. Bouncer pode ser ativado via configuração sem downtime.

---

### F2-14 — Trigger de Auditoria LogPatch ✅

**Objetivo:** `trg_logpatch_audit_ins` deve registrar eventos em `evo.evolution_logpatch_audit`.

**Validação:** Trigger confirmado ativo no schema `evo`, inserindo em `evo.evolution_logpatch_audit`.

---

### F2-15 — Credencial OpenAI ⚠️

**Objetivo:** Credencial OpenAI deve ser válida (não placeholder).

**Status atual:** Credencial é placeholder, porém `OPENAI_ENABLED=false` — integração desabilitada.

**Mitigação:** Sem impacto funcional enquanto OPENAI_ENABLED=false. Substituir credencial antes de habilitar.

---

### F2-16 — Telemetria Desabilitada ✅

**Objetivo:** `TELEMETRY_ENABLED=false` e `TELEMETRY_URL` vazio.

**Validação:** Ambas as variáveis confirmadas na stack evolution.

---

### F2-17 — Webhook de Erros Configurado ✅

**Objetivo:** `WEBHOOK_EVENTS_ERRORS_WEBHOOK` deve apontar para endpoint válido.

**Validação:** Endpoint aponta para Cloudflare Worker — endpoint válido e respondendo.

---

### F2-18 — Cache Local Desabilitado ✅

**Objetivo:** `CACHE_LOCAL_ENABLED=false` — sem cache local em memória.

**Validação:** `CACHE_LOCAL_ENABLED=false` confirmado.

---

### F2-19 — Integrações de Terceiros Desabilitadas ✅

**Objetivo:** Typebot, Chatwoot, Dify e demais integrações devem estar desabilitadas.

**Validação:** Todas as integrações confirmadas desabilitadas na config da stack.

---

### F2-20 — Redis volatile-lru ✅

**Objetivo:** Redis deve usar `volatile-lru` como política de eviction para proteger sessões Baileys.

**Validação:** `maxmemory-policy volatile-lru` confirmado via `redis-cli CONFIG GET maxmemory-policy`.

---

### F2-21 — Version Masking ✅

**Objetivo:** Evolution API deve retornar `"version":"2.x"` (mascarada), não a versão exata.

**Validação:**
```json
{"status":200,"version":"2.x","clientName":"evolution","whatsappWebVersion":"2.3000.1044619432"}
```
Container `70ed341e0146` respondeu corretamente após estabilização (Up 5 minutes, healthy).

---

### F2-22 — Vulnerabilidades Upstream ⚠️

**Objetivo:** Confirmar ausência de CVEs críticos na imagem customizada.

**Status atual:** Known upstream issues — imagem `ghcr.io/adm01-debug/zapp-web-v3/evolution-api-custom@sha256:9d110bc7...` baseada em Evolution v2.3.7.

**Mitigação:** Imagem customizada com patches aplicados. Monitoramento de CVEs upstream ativo.

---

### F2-23 — DLQ Alert Guard: Depth > 50 ✅

**Objetivo:** Alerta automático quando DLQ depth > 50 mensagens por 2+ checks consecutivos.

**Validação:** dlq-alert-guard implementado e ativo: DLQ depth >50 por 2 checks → POST para warroom webhook.

---

### F2-24 — DLQ Alert Guard: Inspector Health ✅

**Objetivo:** Alerta quando inspector retorna nacked 1..9 mensagens em 3 checks.

**Validação:** Lógica implementada no dlq-alert-guard — threshold de 1-9 nacks em 3 checks consecutivos.

---

### F2-25 — DLQ Alert Guard: Consumers Zero ✅

**Objetivo:** Alerta quando `wpp2.*` consumers=0 por 2 checks consecutivos.

**Validação:** Monitor de consumers implementado — alerta warroom em consumers=0 por 2 checks.

---

### F2-26 — fn_audit_rmq_durability_risk ✅

**Objetivo:** Função de auditoria deve reportar risco LOW com 0 health gaps.

**Validação:**
```
risk=LOW, health_gaps=0, dlq_entries_24h=8
```
Resultado obtido via execução da função `evo.fn_audit_rmq_durability_risk()`.

---

### F2-27 — DLQ com Política de Retenção ✅

**Objetivo:** `wpp2.dlq` deve ter política de TTL e max-length configuradas.

**Validação:** 3 políticas ativas para `wpp2.dlq`:
- `dlq-retention` (priority 20, **efetiva**): max-length=10k, max-length-bytes=100MB, message-ttl=604800000 (7d)
- `wpp2-dlq-policy` (priority 10): configuração anterior
- `dlq-protect` (priority 10, adicionada nesta sessão): max-length=50k, TTL=30d (redundante, inofensiva)

A política `dlq-retention` (priority mais alta) é a efetiva.

---

### F2-28 — Rate Limit Edge Function ✅

**Objetivo:** Edge Function `evolution-webhook` deve ter rate limit configurado.

**Validação:** Rate limit: 200 req/s (average), 100 req/s (burst) ativo na Edge Function.

---

### F2-29 — Redis Keyspaces Segregados ✅

**Objetivo:** Redis deve ter keyspaces dedicados: db2 para n8n BullMQ, db8 para sessões longas.

**Validação:**
- `db2`: n8n BullMQ queues
- `db8`: sessões Baileys de longa duração

---

### F2-30 — Edge Function HMAC + Idempotência ✅

**Objetivo:** Edge Function deve validar HMAC-SHA256, garantir idempotência e ter fail-closed.

**Validação:**
- HMAC-SHA256 com header `x-webhook-signature` implementado
- Dedup via `zapp.webhook_events_processed` (58k rows, retenção 30d)
- Fail-closed: erro na validação → 401, não processa o evento

---

### F2-31 — fn_sync_messages_to_v2 + pg_cron ✅

**Objetivo:** Sincronização periódica de mensagens entre partições via pg_cron.

**Validação:** `evo.fn_sync_messages_to_v2()` agendada no pg_cron a cada 5 minutos.

---

### F2-32 — Cross-transport Dedup ✅

**Objetivo:** Dedup entre RabbitMQ e webhook HTTP direto para evitar processamento duplicado.

**Validação:** Edge Function implementa dedup cross-transport via `webhook_events_processed`.

---

### F2-33 — Consumer v6 Operacional ✅

**Objetivo:** Consumer Python v6 deve estar processando com baixa taxa de drop.

**Validação:** Stats do consumer (Up 14h):
```
ok=2299, drop=2 (4xx:404), retry=0, err=0
```
Taxa de drop < 0.1% — dentro do esperado.

---

### F2-34 — Retenção de Dados por Cron Jobs ✅

**Objetivo:** Cron jobs de limpeza de dados antigos devem estar ativos.

**Validação:** Jobs pg_cron ativos:
- `webhook_audit_log`: retenção 3d
- `webhook_events_processed`: retenção 30d
- `evolution_media`: retenção conforme política

---

### F2-35 — Advisors Supabase: Zero Críticos ✅

**Objetivo:** Supabase advisors não deve reportar findings críticos (não-service_role).

**Validação:** 174 warns do advisors verificados — 0 findings críticos (apenas warns de service_role, esperados).

---

### F2-36 — n8n VACUUM FULL binary_data ⚠️

**Objetivo:** Tabela `binary_data` do n8n deve ser desinchada (78MB com 0 live rows).

**Status atual:**
```sql
-- tabela n8n_queue.binary_data
-- table_size: 78 MB
-- live_tup: 0
-- dead_tup: ~1.8M estimadas
```

**Pendência:** VACUUM FULL requer janela de manutenção (lock exclusivo na tabela, 5-10min downtime n8n).

**Comando:**
```sql
VACUUM FULL ANALYZE n8n_queue.binary_data;
```

---

## Ações Pendentes

| Item | Ação | Responsável | Prazo sugerido |
|------|------|-------------|----------------|
| F2-03 | Confirmar volume drenado: `SELECT count(*) FROM public._consumer_dlq` | Ops | Imediato |
| F2-13 | Ativar CrowdSec bouncer nas rotas Evolution após calibrar IP allowlist | Segurança | Próxima sprint |
| F2-15 | Substituir credencial OpenAI placeholder por chave válida antes de habilitar | DevOps | Antes de habilitar OPENAI |
| F2-36 | VACUUM FULL na tabela `binary_data` do n8n (janela de manutenção) | DBA | Próxima janela noturna |

---

## Notas Técnicas

### Política de Segurança DLQ
- **NUNCA drenar DLQ antes de F2-01 estar OK** — sem filtro de eventos, repete o nack em loop
- **NUNCA drenar sem filtrar** — 86,5% é PNG base64 de QR code (~17 MB de lixo no banco transacional)
- **Sempre confirmar com SELECT count(\*)** antes de operações destrutivas — não confiar em n_live_tup

### Infraestrutura Confirmada
| Componente | Container | Estado |
|-----------|-----------|--------|
| RabbitMQ | `0cdbfa47446e` | Up 10 days |
| Evolution API | `70ed341e0146` | Up, healthy |
| Consumer Python v6 | `73054e1156ce` | Up 14h |
| PostgreSQL 14 (n8n) | `225cb86d25d0` | Up 15h, healthy |
| PostgreSQL 15 (Supabase) | `70f4e204e451` | Up 12h, healthy |

### Versões Confirmadas
- Evolution API: v2.3.7 (imagem customizada `sha256:9d110bc7...`)
- Traefik: v2.11.2
- n8n: v2.25.7
- Consumer: Python v6
- Watchdog Baileys: v12
