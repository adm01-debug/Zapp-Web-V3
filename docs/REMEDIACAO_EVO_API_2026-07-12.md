# Remediação Evolution API — execução dos achados da auditoria (2026-07-12)

Segue a execução das melhorias levantadas na auditoria (`docs/AUDITORIA_EVO_API_2026-07-12.md`),
com foco em **correções de código revisáveis via PR + CI** (forma segura de corrigir um
pipeline em produção). Precedida de simulação de cenários e validação read-only do estado
vivo via MCP.

## Fase 1 — Simulação de cenários (validação read-only via MCP)

Antes de qualquer alteração, validei as pré-condições e o comportamento real do pipeline.
Matriz de cenários de maior risco e resultado:

| # | Cenário simulado | Predição | Verificação (banco/infra vivo) | Ação |
|---|---|---|---|---|
| S1 | Burst → `messages.upsert` estoura 429 e é reentregue | evento fica deduplicado → **perda** | ordem `markEventProcessed`→`checkRateLimit` confirmada no código | **C-1** |
| S2 | Agente de baixo privilégio chama `evolution-credentials` | recebe apikey admin | endpoint só valida JWT, sem role; RPC `is_admin_or_supervisor(uuid)` existe | **C-2** |
| S3 | Deploy sem `WEBHOOK_SECRET` | webhook público (fail-open) | `validateWebhook=null` → branch `else` aceita qualquer POST | **A-1** |
| S4 | Handler lança exceção com payload contendo `apikey` | apikey em texto puro na DLQ | `evo.evolution_webhook_dlq.payload` é `jsonb`; `routeToDeadLetter` grava payload cru | **A-2** |
| S5 | POST forjado no `whatsapp-webhook` (Meta) | status poisoning | sem verificação de `X-Hub-Signature-256` | **A-3** |
| S6 | Reprovisionar stack a partir do compose do repo | perde QR/logout/labels | compose declara 13 eventos; instância viva usa 17 | **M-2** |
| S7 | ACK chega para mensagem sem `upsert` (out-of-order/perdido) | placeholder permanente bloqueia conteúdo real | upsert real usa `ignoreDuplicates:true` → placeholder vence | **M-4** |
| S8 | Webhook nativo Evolution + RabbitMQ ativos juntos | dupla entrega | `evo_webhook` (MCP) = `null` + `WEBHOOK_GLOBAL_ENABLED=false` → **não ocorre** | doc (M-1 já mitigado) |
| S9 | Retenção do dedup (`webhook_events_processed`) | crescimento infinito | cron job 152 (purga 3d) ativo | OK (M-3 já coberto) |
| S10 | RLS no schema `evo` | tabelas expostas | 191/191 com RLS | OK |

Health score interno: **A+/100** (mas lê o mirror v2; ver OBS-1 no relatório de auditoria).

## Fase 2 — Correções aplicadas (PR #296 + #301)

| ID | Severidade | Correção | Arquivo |
|----|-----------|----------|---------|
| **C-1** | CRÍTICO | 429 faz **rollback da idempotência** (`unmarkEventProcessed`) → evento volta a ser reentregável; `Retry-After: 30`. Elimina perda silenciosa em burst. | `evolution-webhook/index.ts`, `_shared/evolution-helpers.ts` |
| **C-2** | CRÍTICO | `evolution-credentials` agora exige **admin OU supervisor** (`requireAdminOrSupervisor`) antes de tocar no Vault; qualquer outro papel → 403. (Único consumidor era `evolutionClient.ts`, morto em runtime — sem impacto em agentes.) | `evolution-credentials/index.ts` |
| **A-1** | ALTO | Webhook **fail-closed**: sem secret + `STRICT_MODE` (default) → 503 em vez de aceitar POST não autenticado. | `evolution-webhook/index.ts` |
| **A-2** | ALTO | `scrubWebhookSecrets` faz deep-redaction de `apikey/api_key/authorization/token/sender` antes de gravar na DLQ. Não muta o payload vivo. | `_shared/evolution-helpers.ts` |
| **A-3** | ALTO | `whatsapp-webhook` valida **`X-Hub-Signature-256`** (HMAC-SHA256 do body cru, keyed pelo App Secret) antes de processar; sem App Secret → 503 fail-closed. | `whatsapp-webhook/index.ts` |
| **M-2** | MÉDIO | Compose reconciliado para os **17 eventos** RabbitMQ (+`LABELS_EDIT`, `LABELS_ASSOCIATION`, `QRCODE_UPDATED`, `LOGOUT_INSTANCE`). | `infra/evolution/docker-compose.evolution.yml` |
| **M-4** | MÉDIO | Removida a **fabricação do placeholder `"[Mensagem recebida]"`** a partir de ACK órfão (que bloqueava o conteúdo real via `ignoreDuplicates`). Agora apenas registra a anomalia e deixa o upsert real persistir. | `_shared/evolution-webhook-msg-handlers.ts` |
| **M-6** | MÉDIO | URL do QR-alert agora **sobrescrevível por env** (`QR_ALERT_WEBHOOK_URL`) + header de auth opcional (`QR_ALERT_WEBHOOK_TOKEN`). Default preservado para não desligar alerta vivo. | `evolution-webhook/index.ts` |

## Fase 3 — Correções de observabilidade e banco (este PR)

| ID | Severidade | Correção | Arquivo |
|----|-----------|----------|---------|
| **OBS-1** | MÉDIO/ALTO | `fn_system_health_score` corrigida: (a) seção `webhook_pipeline` passou a usar `evo.evolution_messages WHERE instance_name='wpp2'` (antes: `evolution_messages_wpp2` legada → inflava `hours_silent`); (b) `wpp2_connection` agora penaliza `last_connected_at > 2h` → 12/20 com `status=connected_stale` em vez de 20/20 (DB pode manter `connected` sem reconexão real); (c) `partition_indexes` e `dead_tuples` atualizados para tabelas ativas. Score saiu de **100→95** (reflexo real do estado stale). | `supabase/migrations/20260712000001_obs1_fix_fn_system_health_score.sql` |
| **OBS-4** | MÉDIO | Dois alertas críticos stale (`consumer_halt` + `pipeline_dead_man`) gerados às 11:00 UTC com gap=859min (falso positivo — gap real no momento era ~45min). Nunca foram auto-resolvidos, causando spam no `ops-notify-critical-alerts` (job 84, cadência 5min). Resolvidos via `UPDATE evo.evolution_alerts SET resolved_at=NOW()`. | DB direto |
| **M-3** | BAIXO | `fn_purge_processed_webhook_events` tinha `schemaname='public'` mas todas as tabelas `evolution_webhook_events*` estão em schema `evo` → job 54 era **no-op completo** (nunca deletava nada). Corrigido schema + retenção default 30d→7d + guard de coluna. | `supabase/migrations/20260712000002_m3_fix_fn_purge_processed_webhook_events.sql` |

Testes de regressão adicionados: `_shared/__tests__/evolution-webhook-security.test.ts`
(cobre `scrubWebhookSecrets`, `routeToDeadLetter` scrubado, `unmarkEventProcessed` incl. fail-safe).
Rodam no CI `deno-contract-tests.yml` (step `_shared` é bloqueante).

## Fase 4 — Investigação OBS-2 (401 constante / credential_mismatch)

**OBS-2 já estava resolvido operacionalmente em 2026-07-10** antes de qualquer mudança de código
neste ciclo de auditoria. A investigação via MCP confirmou:

| Campo | Valor |
|---|---|
| Tipo de alerta | `credential_mismatch` |
| Título | "ETAPA 3: 401 Unauthorized — n8n credential desatualizado" |
| Criado em | 2026-07-09 17:23:54 UTC |
| Resolvido em | **2026-07-10 14:39:11 UTC** |
| Causa raiz | Credential n8n `tyLhN1fGwJveaDCg` ("Evolution API - Promo Brindes") ficou com apikey stale após rotação de 2026-07-04; n8n continuou emitindo requisições com a chave antiga → burst de 401s detectado pelo `evo-401-glitchtip-feed` (job 161) |
| Correção aplicada | Atualização manual do campo `api_key` no n8n UI em 2026-07-10 |
| Evidências | `evo.evolution_alerts` (SELECT): alerta `credential_mismatch` com `resolved_at='2026-07-10T14:39:11'`; `evo.evolution_ip_watch`: **0 linhas** (sem eventos 401 ativos) |

Nenhuma mudança de código ou banco necessária. Item encerrado como ops/infra.

## Deferidos conscientemente (não são bugs de código seguros de corrigir às cegas)

- **M-1 (dupla entrega):** já mitigado na config atual — webhook nativo da Evolution está
  desligado (`WEBHOOK_GLOBAL_ENABLED=false` + `evo_webhook`=null). Só RabbitMQ→consumer ativo.
  Nenhuma mudança necessária; documentado.
- **M-5 (`chats.upsert` descarta nome/pin/mute):** persistir metadados de chat é **feature**,
  não bug — exige decisão de schema/produto (a UI deriva conversas de mensagens). Criar colunas
  às cegas seria arriscado. Fica como item de produto.

## Notas de operação (envs novas/opcionais)

- `WHATSAPP_APP_SECRET` — **obrigatória** para o `whatsapp-webhook` (Meta Cloud) processar POSTs.
  Se o canal Cloud não for usado (instância ativa é Baileys), o endpoint fica fail-closed (503),
  o que é o comportamento seguro desejado.
- `QR_ALERT_WEBHOOK_URL` / `QR_ALERT_WEBHOOK_TOKEN` — opcionais; default preserva o alerta atual.
- `EVOLUTION_WEBHOOK_STRICT=false` — override de emergência para reverter A-1 ao modo fail-open
  (não recomendado em produção).
