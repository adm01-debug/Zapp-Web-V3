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

## Fase 2 — Correções aplicadas

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

Testes de regressão adicionados: `_shared/__tests__/evolution-webhook-security.test.ts`
(cobre `scrubWebhookSecrets`, `routeToDeadLetter` scrubado, `unmarkEventProcessed` incl. fail-safe).
Rodam no CI `deno-contract-tests.yml` (step `_shared` é bloqueante).

## Deferidos conscientemente (não são bugs de código seguros de corrigir às cegas)

- **M-1 (dupla entrega):** já mitigado na config atual — webhook nativo da Evolution está
  desligado (`WEBHOOK_GLOBAL_ENABLED=false` + `evo_webhook`=null). Só RabbitMQ→consumer ativo.
  Nenhuma mudança necessária; documentado.
- **M-5 (`chats.upsert` descarta nome/pin/mute):** persistir metadados de chat é **feature**,
  não bug — exige decisão de schema/produto (a UI deriva conversas de mensagens). Criar colunas
  às cegas seria arriscado. Fica como item de produto.
- **OBS-1 (monitores de health conflitantes) / OBS-2 (401 constante filtrado do Sentry):**
  investigação/ajuste de observabilidade e rastreio da apikey obsoleta — trabalho de ops/infra
  na VPS, fora do escopo de mudança de código deste PR. Detalhado no relatório de auditoria.

## Notas de operação (envs novas/opcionais)

- `WHATSAPP_APP_SECRET` — **obrigatória** para o `whatsapp-webhook` (Meta Cloud) processar POSTs.
  Se o canal Cloud não for usado (instância ativa é Baileys), o endpoint fica fail-closed (503),
  o que é o comportamento seguro desejado.
- `QR_ALERT_WEBHOOK_URL` / `QR_ALERT_WEBHOOK_TOKEN` — opcionais; default preserva o alerta atual.
- `EVOLUTION_WEBHOOK_STRICT=false` — override de emergência para reverter A-1 ao modo fail-open
  (não recomendado em produção).
