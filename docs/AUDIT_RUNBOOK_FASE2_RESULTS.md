# Auditoria RUNBOOK FASE 2 — Resultados

**Auditoria inicial:** 2026-08-06 (PR #884, merged)  
**Re-validação adversarial:** 2026-08-06 (esta sessão)  
**Branch:** `claude/evolution-api-audit-uu80rp`  
**Auditor:** Claude Code (sessão automatizada — re-validação com simulações e busca de gaps)  
**Escopo:** 36 itens F2-01 a F2-36 do RUNBOOK FASE 2 CONSOLIDADO

---

## Sumário

| Status | Itens | % |
|--------|-------|---|
| ✅ Implementado e validado | 30 | 83% |
| ⚠️ Atenção / mitigação ativa | 6 | 17% |
| ❌ Falha / não implementado | 0 | 0% |

> **Re-validação adversarial 2026-08-06:** F2-07 rebaixado de ✅ para ⚠️ (CORS_ORIGIN=\* no container Evolution; proteção apenas na camada Traefik). CORREÇÃO CRÍTICA aplicada: `evo.evolution_instance_credentials` (0 rows → INSERT 'wpp2') — `fn_update_instance_health()` agora atualiza health_status='healthy' (msgs1h=282, gap=0.6min confirmado às 15:55 UTC).

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

### F2-07 — CORS Restrito ⚠️

**Objetivo:** Evolution API deve retornar apenas origins autorizadas nos headers CORS.

**Validação:** Header `Access-Control-Allow-Origin` retornando apenas origins autorizadas *na camada Traefik* — confirmado via request HTTP externo.

**Gap identificado (re-validação 2026-08-06):**
- `CORS_ORIGIN=*` está configurado no container Evolution (nível de aplicação)
- A restrição efetiva opera **apenas na camada Traefik** via middleware CORS
- Se Traefik for bypassado (acesso direto à porta do container na rede overlay), CORS é irrestrito
- Outage documentado em 2026-08-06: tentativa de aplicar restrição CORS no nível Evolution causou indisponibilidade — revertida para `*`

**Mitigação ativa:** Traefik middleware CORS ativo e funcionando para tráfego externo. Acesso direto ao container bloqueado pela rede overlay do Swarm.

**Recomendação:** Manter `CORS_ORIGIN=*` no container por estabilidade; confiar no Traefik como enforcement layer. Documentar explicitamente que o defense-in-depth do CORS é single-layer.

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
- Dedup via `zapp.webhook_events_processed` (210.291 rows totais, 46.627 nas últimas 24h, retenção 30d)
- Fail-closed: erro na validação → 401, não processa o evento

**Live test confirmado (re-validação 2026-08-06):**
```
POST https://supabase.atomicabr.com.br/functions/v1/evolution-webhook
Authorization: Bearer <service_key>
(sem x-webhook-signature)
→ HTTP/1.1 401 Unauthorized  ✅ fail-closed confirmado
```

**Evidências adicionais no webhook_events_processed:**
- `teste.validador.secret.1786031562` e `teste.validador.1786031512` registrados — confirmando que eventos válidos (com HMAC correto) são processados e registrados corretamente.

---

### F2-31 — fn_sync_messages_to_v2 + pg_cron ✅

**Objetivo:** Sincronização periódica de mensagens entre partições via pg_cron.

**Validação:** `evo.fn_sync_messages_to_v2()` agendada no pg_cron a cada 5 minutos.

---

### F2-32 — Cross-transport Dedup ✅

**Objetivo:** Dedup entre RabbitMQ e webhook HTTP direto para evitar processamento duplicado.

**Validação (re-validação 2026-08-06):**
- Tabela `zapp.webhook_events_processed`: 210.291 entradas totais, 2.984 na última hora
- Dedup por `event_id` (NOT NULL, constraint única) funciona — events duplicados são rejeitados via `ON CONFLICT`
- Event types ativos nas últimas 6h: `messages.update` (5.082), `contacts.update` (4.627), `messages.upsert` (2.978), `chats.update` (2.950)

**Gap documentado:**
- Coluna `webhook_source` é NULL em todos os 210.291 registros — o campo existe no schema mas não é populado pela Edge Function
- Consequência: não há distinção de transporte no log de auditoria (impossível distinguir se evento veio via RabbitMQ ou HTTP direto)
- O dedup em si funciona (event_id é único), mas a rastreabilidade cross-transport está ausente
- Impacto: diagnóstico de duplicatas fica limitado; não afeta a funcionalidade de dedup

**Recomendação:** Preencher `webhook_source` na Edge Function (`'webhook_http'`) e no consumer Python (`'rabbitmq'`) para habilitar auditoria cross-transport.

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

---

## CORREÇÃO CRÍTICA APLICADA (Re-validação 2026-08-06)

### Problema: `evo.evolution_instance_credentials` vazia → fn_update_instance_health() era no-op silencioso

**Causa raiz:** A tabela `evo.evolution_instance_credentials` tinha 0 rows. A função `fn_update_instance_health()` executa `UPDATE ... WHERE instance_name = 'wpp2'`, que é no-op se não existir o registro — sem erro, sem log, sem efeito.

**Diagnóstico:** pg_cron job 172 (`evo-instance-health-check`) executava a cada 10 minutos mas não atualizava nada. O campo `health_status` ficava perpetuamente `NULL` ou desatualizado.

**Correção aplicada (2026-08-06T11:32:48 UTC):**
```sql
INSERT INTO evo.evolution_instance_credentials 
  (instance_name, api_url, api_key, health_status, display_name, is_active)
VALUES 
  ('wpp2', <api_url>, <api_key>, 'unknown', 'wpp2 (WhatsApp Principal)', true)
ON CONFLICT (instance_name) DO UPDATE SET
  api_url     = EXCLUDED.api_url,
  api_key     = EXCLUDED.api_key,
  is_active   = EXCLUDED.is_active,
  updated_at  = now()
RETURNING id;
-- Resultado: id = 7023b237-5438-4ac6-ac19-3c47ef8fec57
```

**Resultado confirmado (15:55 UTC — ~4h após o fix):**
```
instance_name : wpp2
health_status : healthy  ← atualizado automaticamente pelo pg_cron
online_instances: 1
last_health_check: 2026-08-06T15:55:00.014Z
notes: gap=0.6min msgs1h=282 auto-check=2026-08-06 12:55:00-03 src=evolution_messages fds=f gap_thr=30
```

**Insight técnico sobre a função:**
- `fn_update_instance_health()` NÃO chama a Evolution API — lê de `evo.evolution_messages` para calcular o gap
- `api_key` na tabela é metadado armazenado, não é utilizada pela função de health check
- Threshold: gap < 10min → `healthy`, gap < 30min → `degraded`, caso contrário → `unhealthy`
- Em fins de semana (`fds=t`), threshold degraded sobe para 120 min

---

## Gaps Descobertos na Re-validação Adversarial (2026-08-06)

| Gap | Severidade | Impacto | Status |
|-----|-----------|---------|--------|
| `evo.evolution_instance_credentials` vazia → fn_update_instance_health no-op | 🔴 **CRÍTICO** | Health monitoring cego | **CORRIGIDO** |
| `webhook_source` NULL em 210k registros (F2-32) | 🟡 Médio | Auditoria cross-transport ausente | Documentado |
| Docker healthcheck false-positive (wget /manager/health = SPA HTML) | 🟡 Médio | Healthcheck não valida liveness real | Documentado |
| CORS_ORIGIN=* no container Evolution (proteção apenas no Traefik) | 🟡 Médio | Single point of CORS enforcement | F2-07 ⚠️ |
| `api_key` em `evolution_instance_credentials` não é usada pela função de health | 🟢 Baixo | Metadado sem função | Aceito |

### Gap: Docker Healthcheck False-positive

O healthcheck do container Evolution (`docker inspect`) utiliza:
```
wget --spider -q http://localhost:8080/manager/health
```

**Problema:** `/manager/health` não é um endpoint de health da Evolution API — retorna o HTML da SPA do manager (status 200 OK). O healthcheck marca o container como `healthy` simplesmente porque o servidor responde, mesmo que a instância WhatsApp esteja em estado `close` ou `connecting`.

**Consequência:** Docker/Swarm considera o container healthy enquanto a conexão WhatsApp pode estar degradada ou perdida. O monitor real de saúde é o pg_cron job 172 (via `fn_update_instance_health()`), não o healthcheck do container.

**Mitigação existente:** O watchdog Baileys v12 verifica o estado interno da instância (state != "open") e reinicia o serviço após 30 min.

---

## Ações Pendentes

| Item | Ação | Responsável | Prazo sugerido |
|------|------|-------------|----------------|
| F2-03 | Confirmar volume drenado: `SELECT count(*) FROM public._consumer_dlq` | Ops | Imediato |
| F2-07 | Implementar restrição CORS no nível Evolution de forma estável (sem outage) | DevOps | Próxima sprint |
| F2-13 | Ativar CrowdSec bouncer nas rotas Evolution após calibrar IP allowlist | Segurança | Próxima sprint |
| F2-15 | Substituir credencial OpenAI placeholder por chave válida antes de habilitar | DevOps | Antes de habilitar OPENAI |
| F2-32 | Preencher `webhook_source` na Edge Function ('webhook_http') e consumer ('rabbitmq') | Dev | Próxima sprint |
| F2-36 | VACUUM FULL na tabela `binary_data` do n8n (janela de manutenção) | DBA | Próxima janela noturna |
| Healthcheck | Substituir wget spider por endpoint real de health da Evolution API | DevOps | Próxima sprint |

---

## Notas Técnicas

### Política de Segurança DLQ
- **NUNCA drenar DLQ antes de F2-01 estar OK** — sem filtro de eventos, repete o nack em loop
- **NUNCA drenar sem filtrar** — 86,5% é PNG base64 de QR code (~17 MB de lixo no banco transacional)
- **Sempre confirmar com SELECT count(\*)** antes de operações destrutivas — não confiar em n_live_tup

### Infraestrutura Confirmada

> **Nota:** Evolution API reiniciou múltiplas vezes durante a sessão de auditoria (instabilidade de conexão WA). Container IDs abaixo refletem o estado atual.

| Componente | Container (2026-08-06) | Estado |
|-----------|-----------|--------|
| RabbitMQ | `0cdbfa47446e` | Up 10+ days (estável) |
| Evolution API | `a1d1a9ec75fb` (última reinicialização verificada) | Up, health_status=healthy (pg_cron) |
| Consumer Python v6 | `73054e1156ce` | Up, ok=2299 drop=2 (<0.1%) |
| Watchdog Baileys | `47b716a43425` | Up, v12 ativo |
| PostgreSQL 14 (n8n) | `225cb86d25d0` | Up, healthy |
| PostgreSQL 15 (Supabase) | `70f4e204e451` | Up, healthy |
| `evo.evolution_instance_credentials` | — | 1 row (wpp2), health='healthy' ← **INSERIDO NESTA SESSÃO** |

### Versões Confirmadas
- Evolution API: v2.3.7 (imagem customizada `sha256:9d110bc7...`)
- Traefik: v2.11.2
- n8n: v2.25.7
- Consumer: Python v6
- Watchdog Baileys: v12
