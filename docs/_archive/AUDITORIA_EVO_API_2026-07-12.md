# Auditoria Exaustiva — Evolution API / Pipeline WhatsApp (VPS)

**Data:** 2026-07-12
**Instância:** `wpp2` (Promo Brindes · 551146375517 · WHATSAPP-BAILEYS)
**Evolution:** v2.3.7 · worker consumer v18 · Supabase self-hosted (PostgreSQL 15.8)
**Método:** cruzamento de 4 fontes vivas — código do repo (`zapp-web-v3`), Evolution MCP, Portainer MCP (Swarm, 47 stacks / 58 containers), Supabase self-hosted MCP (schema `evo` = 191 tabelas, 111 crons ativos).
**Objetivo:** validar se o sistema está "10/10" para produção.

---

## Veredito

**Não está 10/10 — está ~8.5/10.** A arquitetura de resiliência é excelente e acima da média (health score interno **A+/100**, RLS 191/191 no `evo`, DLQ vazia, HMAC no consumer, watchdog canary half-duplex, 111 crons de auto-cura, backups horários frescos). Mas restam **2 achados CRÍTICOS de segurança/perda de dados**, **3 ALTOS** e um conjunto de MÉDIOS/observabilidade que precisam ser fechados antes de considerar o pipeline "production-grade sem ressalvas".

O score interno **A+ = 100** é enganoso: ele lê o *mirror v2* (`v2_fresh`), enquanto o probe cru (`fn_pipeline_health_probe`) reportava simultaneamente `warning` com gap de **321 min** sem inbound. Dois monitores discordam sobre o mesmo pipeline (ver OBS-1).

---

## Estado operacional observado (12/07 ~02:00 BRT)

| Sinal | Valor | Leitura |
|---|---|---|
| Conexão wpp2 | `open` / healthy | OK |
| Mensagens totais / 24h | 31.023 / **34** | Volume baixo (sáb. madrugada, fora do horário) |
| Contatos | 20.440 | OK |
| Consumer RabbitMQ | `ok=900 err=0 drop=0 filas=17/17` | Saudável |
| DLQ (`wpp2.dlq`) | vazia | OK |
| `evolution_webhook_dlq` (banco) | 0 linhas | OK |
| Dedup (`webhook_events_processed`) | 29.196 linhas | Ver OBS-2 (retenção) |
| Partições `evolution_messages` | 23, 0 `message_id` duplicado | OK |
| RLS schema `evo` | **191/191** habilitado | OK |
| SECURITY DEFINER sem `search_path` | só `dblink_connect_u` (built-in) | OK |
| Backups | 705 tabelas, 5.6h atrás | OK |

---

## CRÍTICO

### C-1 · Evento com rate-limit (429) é marcado como processado e perdido
`supabase/functions/evolution-webhook/index.ts:189-228`

`markEventProcessed` roda **antes** de `checkRateLimit`. Quando o rate-limit estoura (429), o evento já ficou registrado como idempotente e não é roteado para DLQ. Na reentrega pelo consumer, `markEventProcessed` retorna `false` → short-circuit 200 "duplicate" **sem gravar a mensagem**. Em um burst (sync de grupo, importação, tempestade de ACK) há **perda silenciosa de mensagens** — exatamente a classe de incidente que o resto do pipeline foi construído para evitar.

**Correção:** inverter a ordem (rate-limit → idempotência), OU no caminho 429 remover o registro recém-inserido de `webhook_events_processed`, OU rotear o 429 para a reprocess-queue. 429 só é seguro se o evento continuar reentregável.

### C-2 · Chave-mestra da Evolution exposta ao browser sob demanda
`supabase/functions/evolution-credentials/index.ts:83-133`

O endpoint devolve a `AUTHENTICATION_API_KEY` real (chave global admin — cria/deleta instâncias, lê todas as conversas, envia para qualquer número) no header `X-Evolution-Key` para **qualquer JWT autenticado**, sem checar role admin/dev. Um operador de baixo privilégio lê a chave no DevTools → controle administrativo total da Evolution.
*Atenuante:* o cliente browser-direto (`evolutionClient.ts`) está morto em runtime e o envio real passa pela edge `evolution-api` (key server-side). Mas o endpoint continua publicado e funcional.

**Correção:** restringir a role admin/dev; idealmente remover o endpoint e o `evolutionClient` direto do bundle.

---

## ALTO

### A-1 · Webhook fica aberto (fail-open) se os secrets não forem provisionados
`evolution-webhook/index.ts:38-41, 119-122` — se `EVOLUTION_WEBHOOK_SECRET(S)`/`WEBHOOK_SECRET` faltarem, `validateWebhook` é `null` e o handler **aceita qualquer POST sem auth** (só um `console.warn`). Como a função é `verify_jwt=false`, é um webhook público. **Correção:** em produção, `WEBHOOK_SECRETS.length===0` → 503 (fail-closed).

### A-2 · `apikey` da Evolution persistida em texto puro na DLQ/reprocess-queue
`_shared/evolution-helpers.ts:369-387` + `webhook-schemas.ts:20` — o schema mantém `apikey` (`.nullish()`) e `routeToDeadLetter` grava o `payload` inteiro. Qualquer handler que lance exceção deposita a apikey da instância em tabela do Postgres (visível em dashboards admin, exports, backups). **Correção:** `redactDeep`/remover `apikey`+`sender` antes de gravar.

### A-3 · `whatsapp-webhook` (Meta Cloud) sem validação de assinatura
`supabase/functions/whatsapp-webhook/index.ts:72-121` — aceita POST sem verificar `X-Hub-Signature-256` e faz `UPDATE messages SET status` com dados não autenticados → envenenamento de status. *Atenuante:* instância ativa é Baileys, não Cloud. **Correção:** validar HMAC com App Secret (já existe `verifyHmacSignature` em `_shared/hmac-validation.ts`) ou desativar o legado.

---

## MÉDIO

- **M-1 · Dupla entrega (webhook nativo + RabbitMQ):** ambos os caminhos ainda ativos (`db/remediation/consumer-hmac-patch.md`). O consumer reserializa com `json.dumps(separators=(",",":"))`, gerando hash de dedup diferente do webhook nativo → cada evento pode ser processado 2×. **Correção:** desativar `Webhook` nativo no Postgres da Evolution (`UPDATE "Webhook" SET enabled=false`).
- **M-2 · Drift infra ↔ repo (13 vs 17 eventos RabbitMQ):** o compose versionado (`infra/evolution/docker-compose.evolution.yml` e stack Portainer #25) declara **13** eventos globais; a config *por instância* (via API) e o consumer v18 usam **17** (faltam `LABELS_EDIT`, `LABELS_ASSOCIATION`, `QRCODE_UPDATED`, `LOGOUT_INSTANCE`). Reprovisionar do compose quebraria alertas de QR/logout e sync de labels. **Correção:** promover `docs/infra/evolution-stack.reconciled.yml` a canônico com os 17 eventos.
- **M-3 · Idempotência fail-open sem TTL no código:** `markEventProcessed` retorna `true` em qualquer erro ≠ `23505`; a retenção depende de cron externo. Há 29.196 linhas em `webhook_events_processed`. **Correção:** confirmar cron de purga (existe jobid 152, retenção 3 dias) e dedup adicional por `key.id`.
- **M-4 · `handleMessagesUpdate` insere placeholder `"[Mensagem recebida]"`** quando o ACK chega sem o `upsert` correspondente (`_shared/evolution-webhook-msg-handlers.ts:110-129`) — mascara perda real (agravado por C-1) com placeholder permanente.
- **M-5 · `chats.upsert`/`chats.update` descartam dados** (nome, pin, mute, timestamp) — `handleChatsUpdate` só zera `is_read`. Tolerável (UI deriva conversas de mensagens), mas perde-se ordenação/rotulagem do device. *Nota:* explica o contador **Chats=0** — é intencional (`DATABASE_SAVE_DATA_CHATS=false` no compose), não é bug.
- **M-6 · URLs n8n hardcoded e sem auth em alertas** (`evolution-webhook/index.ts:245-251`, `qr-alert-wpp2`) — acopladas a `wpp2`, fire-and-forget, spammáveis por quem conhecer a URL.

---

## OBSERVABILIDADE / OPERAÇÃO (achados de infra via Portainer + logs)

- **OBS-1 · Monitores de pipeline conflitantes:** `fn_system_health_score` = **A+/100** (`webhook_pipeline: v2_fresh`) enquanto `fn_pipeline_health_probe` (jobid 182) = `warning` gap **321 min** lendo `evolution_messages` cru, no mesmo instante. O score que "conta" para dashboards lê o mirror v2 e pode mascarar um gap real de inbound. Unificar a fonte da verdade.
- **OBS-2 · 401 Unauthorized constante (~a cada 5 min) no container Evolution:** log `[SERVER] error Unauthorized ... server_url: https://evolution.atomicabr.com.br`, alinhado a crons de 5 min. O `logpatch` (T3 `beforeSend`) **filtra 401 do Sentry** — ou seja, o ruído está sendo escondido do error tracking em vez de corrigido. Indica um consumidor com **apikey rotacionada/obsoleta** batendo na API (a chave atual é `evolution_api_key_v4_20260704`; watchdog/canary usam a v4 e retornam 201). Rastrear o cliente com key velha e corrigir/rotacionar. `fn_get_401_glitchtip_payload(60)` retornou 0 eventos — a detecção não está capturando esses 401 (lacuna de cobertura).
- **OBS-3 · Container `evolution` anterior `Exited (143)` e `supabase_functions` `Exited (137)`:** consistente com rolling-update `stop-first` (SIGTERM/SIGKILL), esperado. `metabase` em crash-loop (`Exited 1` + `Created`) — fora do escopo Evolution, mas sinalizar ao time.
- **OBS-4 · Superfície de manutenção alta:** 111 crons ativos e ~10 stacks de guarda (watchdog, canary, dlq-inspector, health-guard, drift-guard, boot-guard, disk-guard...). Excelente para resiliência, mas é complexidade operacional que precisa de runbook único — hoje a lógica está espalhada em blobs base64 embutidos em compose (ex.: `zapp-health-guard`), difíceis de auditar/versionar.

---

## Pontos fortes confirmados (não são problemas)

HMAC timing-safe + rotação multi-secret no consumer · rate-limit atômico via RPC · anti path-traversal em nome de instância · guarda anti-instância-fantasma (incidente wpp2) · per-entry try/catch + DLQ em `messages.upsert` · validação de magic bytes + allowlist de CDN na mídia (anti-SSRF) · `redactSecrets`/`redactDeep` de PII nos logs · secrets via Docker secrets + least-privilege runtime DSN (`evolution_app`) · RLS 191/191 · 23 partições sem duplicatas · backup horário fresco · watchdog canary detecta half-duplex (raiz do incidente 10/07).

---

## Plano de correção priorizado (para atingir 10/10)

1. **C-1** — inverter idempotência/rate-limit no `evolution-webhook` (perda de dados).
2. **C-2** — restringir/eliminar `evolution-credentials` (apikey no browser).
3. **A-1 / A-2** — fail-closed sem secret + scrub de `apikey` na DLQ.
4. **A-3** — assinatura Meta (se/ quando o canal Cloud for ativado).
5. **M-1 / M-2** — desativar webhook nativo (dupla entrega) + reconciliar compose para 17 eventos.
6. **OBS-1 / OBS-2** — unificar fonte do health score e caçar a apikey obsoleta dos 401 (parar de filtrá-los do Sentry).
7. **M-3…M-6, OBS-4** — limpeza incremental + runbook único dos guardas.
