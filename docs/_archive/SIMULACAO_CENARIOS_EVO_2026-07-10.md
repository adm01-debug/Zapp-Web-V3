# Simulação de Cenários de Falha — Pipeline Evolution API

**Data:** 2026-07-10 · **Método:** fault-injection analítico camada-a-camada, cada cenário classificado por evidência ao vivo (MCP Portainer/Supabase/Evolution).
**Legenda de estado:** ✅ mitigado (confirmado) · ⚠️ gap parcial / precisa verificação · ❌ gap aberto · 🔒 barrado por guardrail (requer aprovação/janela)

> 130+ cenários. Foco em prever **onde e como o sistema quebra** antes de produção.

---

## 1. Conexão WhatsApp / Baileys (14 cenários)

| # | Cenário | Falha prevista | Estado | Mitigação / Ação |
|---|---------|----------------|--------|------------------|
| C1.1 | WhatsApp encerra socket (err 1006) | Reconнeção automática | ✅ | Auto-recover; 0 transições de estado em 7d |
| C1.2 | Keep-alive timeout repetido | Degradação silenciosa | ⚠️ | Ruído nos logs, não-fatal; monitorar frequência |
| C1.3 | DEVICE_REMOVED (deslogado no cel) | Instância cai, sem reenvio | ⚠️ | `alert_on_disconnect=true`; precisa QR re-pair manual |
| C1.4 | Ban/bloqueio do número pelo WhatsApp | Perda total do canal | ❌ | Sem número de fallback; risco de negócio |
| C1.5 | Conflito de sessão (2 tasks Baileys) | Auth conflict, flap | ⚠️ | `stop-first` no compose; orphan task E1-01 pendente |
| C1.6 | Corrupção do volume `evolution_instances` | Perda de credencial de sessão | ✅ | baileys-backup R2 a cada 6h (último hoje 12:02) |
| C1.7 | Restore de sessão Baileys | Backup inválido → re-pair | ⚠️ | Backup existe; **restore não validado** (E9-05) |
| C1.8 | Sync inicial trava (AwaitingInitialSync) | Buffer não drena | ✅ | Force-online + flush após timeout (observado) |
| C1.9 | Prekey bundle / libsignal session churn | Log spam | ✅ | libsignal patch 4/4 aplicado |
| C1.10 | Mensagem de `@lid` sem original | "Original not found, skipping" | ⚠️ | Esperado (HISTORIC=false); update descartado |
| C1.11 | QR expira antes do pareamento | Onboarding falha | ✅ | `QRCODE_LIMIT=30` |
| C1.12 | Presença "online" vaza status | LGPD/privacidade | ✅ | `alwaysOnline=false`, `readStatus=false` |
| C1.13 | Rede QUIC/UDP degradada na VPS | Latência/desconexão | ⚠️ | Stack `sysctl-quic-fix` presente; validar efeito |
| C1.14 | Chamada recebida (call offer) | Interrupção | ✅ | `rejectCall=true` + msgCall automática |

## 2. Evolution API — aplicação (12)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C2.1 | logpatch T1–T5 falha no boot | Boot sem mask → risco LGPD | ✅ | fail-open + alerta `warroom_alerts`; T1/T2/T3/T4/T5a OK |
| C2.2 | main.js upstream muda (quebra patch) | Patch não casa | ✅ | Contadores T1(1)/T2(1) abortam boot se ≠ |
| C2.3 | Prisma migration pendente no boot | Schema drift | ✅ | `deploy_database.sh`; 57 migrations, 0 pendentes |
| C2.4 | Superuser URI usado em runtime | Excesso de privilégio | ✅ | Troca p/ `evolution_app` (least-priv) pós-migration |
| C2.5 | Migration falha (exit≠0) | Runtime com superuser | ⚠️ | Fallback documentado; alertar se ocorrer |
| C2.6 | API key rotacionada | Consumidores 401 | ❌ | **n8n + painéis com key pré-04/07** (E3) |
| C2.7 | Rate-limit Traefik estoura | 429 a clientes | ✅ | `evo-rl` 1000avg/500burst/1m |
| C2.8 | Header de segurança ausente | XSS/clickjacking | ✅ | `evo-sec` HSTS/nosniff/referrer/permissions |
| C2.9 | Server/X-Powered-By vaza versão | Fingerprint | ✅ | customResponseHeaders vazios |
| C2.10 | Métricas Prometheus expostas | Info leak | ✅ | `METRICS_AUTH_REQUIRED=true` + IP allowlist |
| C2.11 | OOM (limite 3G) sob carga | Restart | ⚠️ | limits 2cpu/3G; validar sob 500 msg/s |
| C2.12 | Sentry engole 401/DEVICE_REMOVED | Ruído/custo | ✅ | beforeSend filtra 401/403; traces 5% |

## 3. RabbitMQ (11)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C3.1 | Broker reinicia | Perda de msgs não-persistidas | 🔒 | **Durabilidade não verificada** (exec barrado) — E8 |
| C3.2 | Exchange `evolution` non-durable | Perda em crash | 🔒 | Verificar `durable=true` publisher+consumer |
| C3.3 | Fila non-durable / deliveryMode≠2 | Perda de mensagem | 🔒 | Verificar 17 filas + persistent |
| C3.4 | Mensagem unroutable | Evento perdido | ✅ | `unroutable.audit` + fila groups.update criada |
| C3.5 | Consumer desconecta | Backlog cresce | ✅ | resub=0; auto-reconnect (up 57min ok) |
| C3.6 | Fila enche (sem limite) | Memória do broker | ⚠️ | Definir max-length/TTL; validar |
| C3.7 | Poison message | Loop de retry | ✅ | DLQ presente (`evolution_dlq` vazia) |
| C3.8 | Duplicata de entrega | Dupe no banco | ✅ | Idempotência (UNIQUE event_id) |
| C3.9 | Dedup Set sem cap no consumer | Memory leak | ⚠️ | Verificar TTL/max-size (E8-01) |
| C3.10 | Consumer OOM | Parada | ✅ | Reinício automático (swarm) |
| C3.11 | Latência de ack alta | Throughput cai | ✅ | ok=4600+ estável, 0 err |

## 4. Consumer / roteamento (8)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C4.1 | pg_log falha | Perda de rastro | ✅ | pg_log_err=0 |
| C4.2 | Instância fantasma emite eventos | Insert de origem desconhecida | ✅ | Alerta `ghost_message_events` + rejeição |
| C4.3 | Shard de departamento inexistente | Insert falha | ✅ | `_default` como fallback (0 linhas) |
| C4.4 | Roteamento p/ tabela errada | Dado no lugar errado | ✅ | `source_schema_map` + 0 no default |
| C4.5 | Backpressure DB | Consumer trava | ✅ | shadow=0, drop=0 |
| C4.6 | Reprocessamento pós-incidente | Duplicação | ✅ | ForceUpdate=489 idempotente |
| C4.7 | Contacts-update em massa | Lock contention | ✅ | ok crescente sem err |
| C4.8 | Ordem de eventos fora de sequência | Estado inconsistente | ⚠️ | upsert por key mitiga; validar edge cases |

## 5. Banco de dados / Postgres (24)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C5.1 | Tabela sem RLS | Vazamento cross-tenant | ✅ | 0 tabelas sem RLS (evo/public/zapp/ops) |
| C5.2 | SECURITY DEFINER sem search_path | Schema injection | ✅ | **CORRIGIDO hoje**: 0 restantes em evo |
| C5.3 | FK sem índice | UPDATE/DELETE pai lento + lock | ✅ | **CORRIGIDO hoje**: health_logs, contacts.queue_id |
| C5.4 | Índice duplicado (write amplification) | INSERT lento | ⚠️ | 5 redundantes → migration revisada (Seção C) |
| C5.5 | Índice não-usado ocupa disco | Espaço/escrita | ⚠️ | idx_scan=0 pós-reset; observar 30d antes de dropar |
| C5.6 | Partição de mês futura ausente | Insert falha | ✅ | `fn_auto_create_next_partitions` até 2027_06 |
| C5.7 | Dados caindo em `_default` | Partição errada | ✅ | v2_default=0, wh_default=0 |
| C5.8 | Sequence int4 esgota | Insert para | ✅ | max 19k / 0.00% |
| C5.9 | Autovacuum não roda (hot table) | Bloat + plano ruim | ✅ | dead_tup baixo (wpp2=344) |
| C5.10 | VACUUM FULL sem disco (2×) | Rewrite falha | ⚠️ | E7-02; usar pg_repack/janela |
| C5.11 | Long-running query segura lock | Fila de locks | ✅ | Sem locks pendentes observados |
| C5.12 | Conexões esgotam (supavisor) | App sem conexão | ⚠️ | Validar pool sob pico |
| C5.13 | Replicação/WAL slot preso | Disco enche | ✅ | `check_wal_slots` ops presente |
| C5.14 | DDL não-auditada | Mudança silenciosa | ✅ | `fn_ddl_audit_log` (2563 op/semana rastreadas) |
| C5.15 | DROP acidental de tabela/índice | Perda de estrutura | ✅ | `fn_ddl_drop_alert` dispara alerta |
| C5.16 | RLS auto-enable não cobre schema | Nova tabela sem RLS | ✅ | `rls_auto_enable` cobre public+evo+zapp+ops |
| C5.17 | Policy USING(true) permissiva | Acesso amplo | ⚠️ | 363 policies; single-org + anon revogado (design) |
| C5.18 | anon com SELECT em public | Vazamento | ✅ | 0 grants anon (revogado) |
| C5.19 | View sem security_invoker | Bypass de RLS | ✅ | 546/546 security_invoker |
| C5.20 | Coluna updated_at sem trigger | Timestamp obsoleto | ✅ | Triggers `handle_updated_at` |
| C5.21 | Alerts table cresce sem retenção | Bloat | ✅ | 372 linhas, 1 > 30d; ok |
| C5.22 | Migration não-idempotente | Deploy quebra | ✅ | Padrão IF EXISTS no repo |
| C5.23 | Function volatile em índice | Corrupção de índice | ✅ | Não detectado |
| C5.24 | Schema drift cloud vs self-hosted | Divergência | ✅ | `check_schema_drift` + schema-drift-guard |

## 6. Mídia / Cloudflare R2 (10)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C6.1 | PUT de mídia falha (token) | Perda de mídia | ✅ | 21.007 objetos, 100% com storage_url |
| C6.2 | Bucket inexistente | Upload falha | ✅ | Bucket ativo (objetos gravando hoje) |
| C6.3 | makeBucket AccessDenied no boot | Falso alarme | ✅ | Benigno (token object-scoped); silenciar log |
| C6.4 | Token R2 sem Object:Write | Data loss | ✅ | Refutado — writes OK todos os tipos |
| C6.5 | Objeto órfão (DB sem R2) | Link quebrado | ⚠️ | Spot-check HEAD recomendado |
| C6.6 | Vídeo grande estoura limite | Upload rejeitado | ✅ | 49 vídeos OK últimos 7d |
| C6.7 | R2 fora do ar | Mídia indisponível | ⚠️ | Sem cache local de mídia; degradação |
| C6.8 | base64 fallback enche o banco | Bloat | ✅ | 0 base64 em 7d |
| C6.9 | Custo egress R2 | Financeiro | ✅ | `sim_wa_budget_guard` monitora |
| C6.10 | Retenção de mídia | Crescimento infinito | ⚠️ | Definir lifecycle no bucket |

## 7. Webhook / Edge Functions (10)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C7.1 | Webhook error-proxy 401 | Erros não entregues | ⚠️ | Proxy rejeita; path secundário (v2=0/24h) |
| C7.2 | Edge fn com verify token fraco | Spoofing | ✅ | HMAC multi-secret + retorna 500 sem token |
| C7.3 | Webhook retry esgota | Evento perdido | ✅ | 10 tentativas, backoff exp, DLQ |
| C7.4 | Status não-retriável (4xx) | Loop evitado | ✅ | `NON_RETRYABLE=400,401,403,404,422` |
| C7.5 | Idempotência de webhook | Duplicata | ✅ | UNIQUE event_id (10.718 dupes limpos) |
| C7.6 | Rate-limit antes de idempotência | Retry consome quota | ✅ | Idempotência antes do rate-limit |
| C7.7 | Payload malformado | Crash do handler | ✅ | Zod/contract-schemas + testes |
| C7.8 | Edge fn stale (deploy velho) | Comportamento divergente | ✅ | `fn_edge_fn_staleness_check` |
| C7.9 | webhook_dlq acumula | Backlog | ✅ | webhook_dlq=0 |
| C7.10 | v2 partition ingest parado | Silencioso | ✅ | v2 é standby (RabbitMQ é o path ativo) |

## 8. Integrações externas (9)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C8.1 | n8n credential vencida | Automação quebra | ❌ | **E3-01 em andamento** (atualizar credential) |
| C8.2 | Painel compras/financeiro key velha | Painel 401 | ❌ | **E3-06** (atualizar Docker secret) |
| C8.3 | Bitrix sync falha | Fila cresce | ✅ | bitrix_queue=0; sync_enabled |
| C8.4 | Bitrix field mapping quebra | Dado errado | ✅ | `evolution_bitrix_field_mapping` |
| C8.5 | Chatwoot desabilitado esperado | N/A | ✅ | chatwoot_enabled=false (design) |
| C8.6 | Typebot/Dify/OpenAI off | N/A | ✅ | Desabilitados por design |
| C8.7 | Sicoob notify on reply | Notificação perdida | ✅ | `fn_notify_sicoob_on_reply` secdef+sp |
| C8.8 | Webhook de terceiro lento | Timeout | ✅ | `WEBHOOK_REQUEST_TIMEOUT_MS=60000` |
| C8.9 | MCP evolution externo abusa API | Rate/segurança | ⚠️ | Rate-limit Traefik; auditar tokens MCP |

## 9. Segurança / secrets (10)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C9.1 | Secret em env plana | Vaza em inspect | ✅ | Migrado p/ Docker secrets (db/api/s3/rmq/wa) |
| C9.2 | api_key em log | LGPD | ✅ | T4 mask `***MASKED***` |
| C9.3 | Payload de msg em log | LGPD | ✅ | T1/T2 removidos |
| C9.4 | fn_resolve_alert exec por authenticated | Escalada | ✅ | REVOKE de authenticated (alerta hoje) |
| C9.5 | RLS auth_full_access permissiva | Acesso amplo | ✅ | Removida em evolution_alerts |
| C9.6 | serialize-javascript RCE | Exec remota | ❌ | Bump 7.0.5 (app web, fora do EVO) |
| C9.7 | supabase CLI tar CVE | Path traversal | ❌ | Bump 2.101.0 |
| C9.8 | xlsx prototype pollution | Poluição | ⚠️ | Sem fix; migrar p/ exceljs |
| C9.9 | Token auth em localStorage | XSS rouba token | ⚠️ | httpOnly cookies (arquitetural) |
| C9.10 | wa verify token previsível | Spoof webhook | ✅ | Secret `wa_business_verify_token_v1` |

## 10. Backup / DR (8)

| # | Cenário | Falha prevista | Estado | Ação |
|---|---------|----------------|--------|------|
| C10.1 | Backup Baileys não roda | Sem restore de sessão | ✅ | R2 6h, último hoje 12:02 (6961 campos) |
| C10.2 | INSTANCE_UUID errada no backup | Backup inútil | ✅ | Corrigido (alerta hoje) |
| C10.3 | Restore-validate falha | Backup corrompido | ⚠️ | **Bloqueador go-live E9-05 — validar** |
| C10.4 | PG backup diário falha | Perda de dados | ✅ | daily/weekly/monthly S3 rodando |
| C10.5 | Supabase backup falha | Perda | ✅ | supabase-backup up 25h |
| C10.6 | Restore PG não testado | RTO desconhecido | ⚠️ | restore-validate stack presente; exercitar |
| C10.7 | Backup sentinel dropado | Monitor cego | ⚠️ | `fn_update_backup_sentinel` re-verificar |
| C10.8 | Retenção de backup | Custo/compliance | ✅ | keep=30d configurado |

## 11. Infra / Swarm (9)

| # | Cenário | Falha | Estado | Ação |
|---|---------|-------|--------|------|
| C11.1 | Orphan task pós-update | Recurso preso | ⚠️ | E1-01; kill via Portainer |
| C11.2 | Nova task falha healthcheck | Deploy trava | ⚠️ | rollback automático configurado |
| C11.3 | Race stop-first | 2 instâncias | ✅ | `order=stop-first` no compose |
| C11.4 | Disco do host enche | Escrita para | ✅ | host-disk-guard + `check_host_disk` |
| C11.5 | Boot da VPS sem serviços | Downtime | ✅ | infra-boot-guard |
| C11.6 | Redis stale session pós-restart | Estado velho | ⚠️ | SCAN+DEL evolution:* DB8 se necessário |
| C11.7 | Traefik cert expira | TLS quebra | ✅ | letsencrypt resolver |
| C11.8 | Swarm task guardian morre | Sem watchdog | ✅ | `fn_check_guardian_alive` (search_path fixado hoje) |
| C11.9 | Watchtower auto-update quebra | Versão ruim | ⚠️ | Pin de digest sha256 no Evolution |

## 12. Observabilidade / dados (10)

| # | Cenário | Falha | Estado | Ação |
|---|---------|-------|--------|------|
| C12.1 | Pipeline silencioso (sem msg) | Não percebido | ✅ | dead-man `pipeline_dead_man` + probe |
| C12.2 | Alerta crítico não notifica | Cego | ✅ | `fn_notify_critical_alerts` |
| C12.3 | Sonda de saúde não roda | Sem sinal | ✅ | `fn_pipeline_health_probe` (13:35 ok) |
| C12.4 | Gap inbound cresce | Atraso | ✅ | gap_inbound_min=0.04 |
| C12.5 | Regressão silenciosa | Bug em prod | ✅ | `fn_regression_tests` |
| C12.6 | Métricas retêm p/ sempre | Bloat | ✅ | retention_days_metrics=90 |
| C12.7 | Glitchtip fora | Sem erros | ✅ | glitchtip up 2d |
| C12.8 | Metabase cai | Sem dashboard | ⚠️ | Flaps observados (restart) |
| C12.9 | Cooldown de alerta falha | Spam | ✅ | `evolution_alert_cooldown` |
| C12.10 | Go-live checklist desatualizado | Decisão errada | ⚠️ | 5 itens refutados a marcar (evidência) |

---

## Síntese: gaps abertos priorizados pós-simulação

| Prioridade | Cenários | Natureza | Canal |
|-----------|----------|----------|-------|
| **P0** | C3.1–C3.3, C3.9 | Durabilidade RabbitMQ + dedup cap | Operador (janela) |
| **P0** | C1.7, C10.3, C10.6 | Validação de restore | Operador (janela) |
| **P1** | C2.6, C8.1, C8.2 | Rotação de key nos consumidores | DevOps |
| **P2** | C5.4 | Drop de 5 índices redundantes | Migration revisada (este PR) |
| **P2** | C6.5 | Spot-check de objetos R2 | Operador |
| **P3** | C1.4 | Número WhatsApp de fallback | Negócio |
| **P3** | C6.10, C11.9, C12.8 | Lifecycle R2, pin watchtower, metabase | Incremental |
| **✅ Feito** | C5.2, C5.3, C11.8 | search_path + FK indexes | **Aplicado hoje** |
