# 🔬 Auditoria Exaustiva — Evolution API + Banco de Dados (Sessão 5 — manhã, pós-repareamento)

> **Data:** 2026-07-04 (~10:15–10:50 UTC / 07:15–07:50 BRT)
> **Escopo:** Evolution API na VPS (Docker Swarm/Portainer), PostgreSQL 14 nativo (db `evolution`),
> PostgreSQL 15.8 do Supabase self-hosted (schemas `evo` e `zapp`), RabbitMQ, Redis,
> mídia no Cloudflare R2, pipeline RabbitMQ → consumer → Edge Function → espelho, versão upstream.
> **Método:** Recon independente via MCP (Portainer, Evolution API, Supabase self-hosted),
> `psql` dentro dos containers PG14 e PG15, `rabbitmqctl`, logs de produção ao vivo,
> GitHub releases do upstream. Cruzamento item a item com as sessões 1–4.
> **Relatórios anteriores:**
> [`sessao3`](./EVOLUTION_API_AUDIT_2026-07-04_sessao3.md) ·
> [`sessao4`](./EVOLUTION_API_AUDIT_2026-07-04_sessao4.md) ·
> [`execução sessão 4`](./EVOLUTION_API_EXECUCAO_2026-07-04_sessao4.md) ·
> [`scorecard`](./EVOLUTION_API_AUDIT_2026-07-04_scorecard.md)

---

## 0. TL;DR — veredito das 4 perguntas + 1 incidente novo

| Pergunta | Veredito | Evidência (re-verificada nesta sessão) |
|---|---|---|
| **Evolution API instalada corretamente?** | ✅ **SIM** | Imagem oficial pinada por digest, secrets Swarm (DB URI, API key v4, R2, RabbitMQ), Traefik+TLS, healthcheck (container `healthy`), `init:true`, limites 2 CPU/3 GB, telemetria off. Logpatch LGPD v5.1 **agora persistido no stack file** (S4-1 resolvido). |
| **Banco configurado corretamente?** | ✅ **SIM** | PG14.22: **57/57 migrações Prisma aplicadas, 0 pendentes** ("No pending migrations to apply" no boot de 01:41). Índices Prisma do `Message` presentes; autovacuum em dia; purge v2 com retenção 90/30/7d + VACUUM ANALYZE. PG15.8 (Supabase): cache hit 98,6%, 33/150 conexões, `random_page_cost=1.1`, work_mem 32 MB, 49 jobs pg_cron de retenção/reconciliação ativos, RLS em **148/148** tabelas do `zapp`. |
| **Versão atualizada?** | ✅ **SIM** | Instalada **v2.3.7** (confirmada no log do boot: `evolution-api@2.3.7 db:deploy`) = **última release estável** do upstream `evolution-foundation/evolution-api` (05/12/2025). A 2.4.0 segue em RC (rc2 de 17/05/2026) e **passa a exigir ativação de licença** → não migrar. Nota: `evo_status` do MCP mostra `4.2.0` = versão do worker MCP, não da API. |
| **Melhor performance/integração?** | 🟡 **QUASE** | Infra saudável de ponta a ponta (RabbitMQ 30 filas backlog 0, consumer v14 30/30 filas + HMAC + evento `call`, Redis OK, R2 restaurado). **Porém o re-pareamento da linha principal foi feito na instância errada** — ver incidente S5-1 abaixo. |

### 🔴 S5-1 — INCIDENTE NOVO E CRÍTICO: linha principal re-pareada na instância ERRADA

**O que aconteceu:** às **10:29:42 UTC de hoje** o número principal **5511••••5517** foi
re-pareado via QR — mas numa **instância nova** criada com o nome
`d8e07e44-1aac-45a2-a1d9-bebe1deeb355` (que é exatamente o **UUID interno da instância `wpp2`**,
provavelmente colado por engano no campo "nome" ao criar a instância no Manager).

**Estado atual (verificado ao vivo):**

| Instância | Status | Número | Problema |
|---|---|---|---|
| `wpp2` (a oficial) | `connecting`, loop 401 desde 03/07 16:40 UTC | 5511••••5517 | Sessão morta — o pareamento agora pertence à instância nova |
| `d8e07e44-1aac-…` (fantasma) | **`open`** — sincronizando histórico | 5511••••5517 | **Fora de TODO o pipeline** (ver abaixo) |
| `wpp_pink_test` | `open`, saudável | 5564••••0900 | — |

**Por que é crítico — a instância fantasma está invisível para o sistema:**

1. **Sem RabbitMQ** (`Rabbitmq: null`) → nenhum evento publicado → **mensagens da linha
   principal NÃO chegam ao zapp-web** (consumer escuta só `INSTANCE_PREFIX="wpp2 wpp_pink_test"`).
2. **Sem Settings de negócio**: `rejectCall=false` (chamadas não são rejeitadas com a mensagem
   padrão), `readMessages=false`, `readStatus=false`.
3. **Fora do `zapp.instance_registry`** (23 instâncias registradas; esta não) → eventos dela
   seriam classificados como *ghost events* pelo KPI do `zapp-health-guard`.
4. **Espelho `evo.*` não tem tabelas** para esse nome de instância — mesmo ligando RabbitMQ,
   a Edge Function não saberia onde gravar.
5. A `wpp2` continua em loop de reconexão 401 (ruído + eventos `connection.update` inúteis:
   4.461 eventos "wpp2" nas últimas 24h são quase todos esse loop).

**Evidências:** `fetchInstances` (3 instâncias, fantasma `open` criada 10:29:42Z);
logs do serviço às 10:31 (`[d8e07e44-…] recv 310 chats … progress 4%` — sync de histórico ativo);
PG14 `Instance` (3 linhas); consumer stats `ok=1977 err=0` mas nenhuma fila para o fantasma;
`zapp.instance_registry` sem a instância.

### ✅ Runbook de correção — SEM downtime (fazer com o telefone da linha em mãos)

O WhatsApp multi-device permite **até 4 aparelhos/sessões pareados simultaneamente**, então dá
para conectar a `wpp2` correta **antes** de remover o fantasma:

1. **Conectar a `wpp2`** (Manager em `https://evolution.atomicabr.com.br/manager` → instância
   `wpp2` → Connect, ou `GET /instance/connect/wpp2`) → QR gerado.
2. **Escanear o QR com o aparelho** da linha 5511••••5517
   (WhatsApp → Aparelhos conectados → Conectar aparelho). Isso cria um **segundo** pareamento,
   sem derrubar o atual.
3. **Validar** (2–3 min): `wpp2` com `connectionStatus=open`; watchdog logando `state=open`;
   eventos novos em `zapp.webhook_events_processed` com `instance='wpp2'`; fila
   `wpp2.messages.upsert` consumindo; mandar 1 mensagem de teste.
4. **Só então remover o fantasma**: `DELETE /instance/logout/d8e07e44-1aac-45a2-a1d9-bebe1deeb355`
   seguido de `DELETE /instance/delete/…` (ou Logout + Delete no Manager).
5. A reconciliação já roda sozinha (`fn_reconcile_dispatch` a cada 5 min + jobs
   `evolution_reconcile_jobs`); conferir `evo.evolution_alerts` depois.

> ⚠️ **Não** inverta a ordem (deletar o fantasma primeiro) — isso derruba a linha de novo até
> alguém escanear outro QR. E **não aproveite o fantasma** ligando RabbitMQ nele: todo o
> ecossistema (consumer, Edge Function, espelho `evo`, registry, watchdog `INSTANCE=wpp2`)
> é chaveado pelo nome `wpp2`.

---

## 1. O que esta sessão re-verificou de ponta a ponta (tudo ✅)

| Camada | Estado | Detalhes |
|---|---|---|
| Serviço `evolution_evolution` | ✅ healthy | Task de 01:41 UTC, digest `6b1956…` (v2.3.7), entrypoint com secrets + logpatch v5.1 (main.js LGPD + libsignal 4/4) **no stack file** — drift S4-1 fechado |
| Migrações Prisma (PG14) | ✅ 57/57 | Última: `20251122003044_add_chat_instance_remotejid_unique`; deploy automático em cada boot |
| Banco `evolution` (PG14.22) | ✅ 760 MB | `Message` 698 MB/179k (wpp2 158.139 + pink 20.815, crescendo); autovacuum ok; 28/100 conexões; tuning: shared_buffers 1 GB, effective_cache 6 GB, work_mem 16 MB |
| Retenção nativa | ✅ purge v2 | Message 90d, MessageUpdate 30d, webhook 30d, baileys_errors 7d + VACUUM ANALYZE diário (stack 126) — inclui as tabelas custom `_baileys_error_events`/`_swarm_guardian_events` (recomendação da sessão 4 já coberta) |
| RabbitMQ | ✅ | vhost `evolution`, 30 filas `wpp2.*`/`wpp_pink_test.*` + `wpp2.dlq`: **backlog 0 em todas**, 1 consumer por fila, DLQ vazia |
| Consumer v14 | ✅ | 30/30 filas, `ok=1977 err=0 drop=0` em ~9h, HMAC sha256, evento `call` ativo, Sentry configurado |
| Mídia S3→R2 | ✅ **restaurada** | S4-2 fechado: após o redeploy de 01:34 (secrets R2 v1), **164 registros `Media` criados hoje**; erro `makeBucket Access Denied` era da config anterior (ruído de boot residual pode ocorrer — token R2 sem permissão de criar bucket, inofensivo pois o bucket existe) |
| Supabase PG15.8 | ✅ | uptime 10h, cache hit 98,6%, 33/150 conexões, dead tuples desprezíveis, `pg_stat_statements` sem query patológica (top = realtime interno + COPY de backup) |
| Schema `zapp` (148 tabelas) | ✅ | RLS em 100% das tabelas; nenhuma FK sem índice; único "candidato" do analisador (`zapp.contatos`, 1 seq scan) é irrelevante |
| Schema `evo` (176 objetos) | ✅ | Particionamento por instância ativo (`evolution_messages` com 24 partições, `comercial_01..15`, `artes`, etc. pré-criadas para o rollout), views de backcompat mantidas por cron a cada 15 min |
| pg_cron | ✅ 49 jobs | Retenção (webhook 30d, alerts 7d, realtime 7d, cron history 7d), reconcile (3–5 min), outbound dispatch (1 min), partições mensais, health-scores, deadman switch |
| Watchdog v8 | ✅ | Supressão de restart no 401 funcionando (`NOT CONNECTION` a cada 5 min, sem restart) |
| Backups | ✅ | daily/weekly/monthly PG14 + supabase-backup + baileys-backup + R2 offsite (conforme sessão 4 §4) — não re-testados nesta sessão |

## 2. Status das pendências das sessões anteriores

| Item | Status | Nota |
|---|---|---|
| 🔴 Re-parear `wpp2` via QR | 🟠 **FEITO ERRADO → virou S5-1** | Pareamento existe, mas na instância fantasma. Runbook acima corrige sem downtime. |
| S4-1 Drift do logpatch no stack file | ✅ **RESOLVIDO** | Stack file id 25 (01:34 UTC) contém entrypoint com logpatch v5.1 + label `audit=logpatch-v5.1-libsignal-2026-07-04` |
| S4-2 S3/R2 Access Denied | ✅ **RESOLVIDO** | Secrets R2 restaurados; 164 mídias hoje; monitorar `Media`/`media_download_queue` |
| S4-3 GlitchTip engolindo alertas (HTTP 500) | ⚪ não re-verificado | Continua no topo da lista — o alerta do S5-1 pode não ter chegado por esse canal |
| S4-4 `_supabase`/analytics 35 GB | 🔴 **ABERTO** | Re-medido nesta sessão: `_supabase` = **35 GB** (inalterado). Configurar retenção Logflare |
| S4-5 OOM-pattern no `supabase_db` | ⚪ não re-verificado | PG15 com uptime 10h nesta sessão (sem novo incidente na janela) |
| S4-6 Ubuntu 20.04 / PG14 EOL 11-2026 | ⚪ planejamento | Sem mudança |
| Rotação senha compartilhada (exec §1 sessão 4) | 🔴 pendente supervisionado | Runbook pronto; inclui hardcoded no `rest` (stack 35) e `supabase-db-mcp` (128) |
| Drift dos 3 stacks de backup PG14 (112/84/85) | 🔴 pendente supervisionado | **Não redeployar pela UI** até converter para secrets |
| Aposentar `minio-offsite-mirror` (89) | 🟡 pendente | 1 clique no Portainer |

## 3. Observações novas (menores) desta sessão

| # | Severidade | Observação | Recomendação |
|---|---|---|---|
| S5-2 | 🟡 BAIXO | **`zapp.instance_registry` com status stale** — todas as 23 instâncias com `status='inactive'` (updated 13/06), incluindo `wpp2`/`wpp_pink_test` que têm `is_active=true`. O campo não reflete o estado real. | Fazer o job de reconcile (ou a Edge Function de `connection.update`) atualizar `status` — evita decisões erradas de automação em cima de dado morto. |
| S5-3 | 🟡 BAIXO | **Ghost events de QA** em `zapp.webhook_events_processed`: instâncias `qa_final`, `qa_sim_claude`, `q`, `qa` (94 eventos, últimos ontem ~21:45). | Esperado (testes), mas se recorrente, filtrar prefixo `qa_` no KPI de ghost events para não mascarar fantasma real (como o S5-1!). |
| S5-4 | 🟡 INFO | **Persistência nativa de `Message` da wpp2 parou em 07/05** (max `messageTimestamp` = 2026-05-07 14:01 UTC) apesar de eventos fluírem até a queda de 03/07. Espelho Supabase seguiu recebendo (mensagens do negócio preservadas via pipeline). Já notado na sessão 4 sem causa-raiz. | Investigar após o re-pareamento correto: se a wpp2 nova não gravar `Message` no PG14, abrir issue (pode ser efeito do purge/carga histórica; o espelho é a fonte de verdade do zapp, mas o nativo alimenta `get_last_event_age` do watchdog → gap falso de 60 min dispararia restart se o estado não fosse `open`). |
| S5-5 | 🟡 INFO | **Token de instância visível no `fetchInstances`** mesmo com `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false` (campo `token` retornado para as 3 instâncias). Mitigado: endpoint exige a API key global (rotacionada hoje, v4) e TLS. | Confirmar comportamento no upstream 2.3.7 (a flag historicamente controla o campo `hash`); tratar tokens de instância como sensíveis em qualquer log/integração. |
| S5-6 | 🟢 INFO | `CACHE_LOCAL_ENABLED=true` junto com Redis. Com 1 réplica é seguro; a doc oficial recomenda desligar o local quando Redis está ativo (consistência em multi-réplica). | Se um dia escalar para >1 réplica, definir `CACHE_LOCAL_ENABLED=false`. |

## 4. Nota final (escala da sessão 4, atualizada)

| Dimensão | Nota | Movimento |
|---|---|---|
| Versão/atualização | 10/10 | = |
| Instalação/configuração Evolution | 10/10 | ⬆ (S4-1 e S4-2 fechados) |
| Banco de dados (schema/manutenção/performance) | 10/10 | = |
| Backups/DR | 9/10 | = (drift dos 3 stacks PG14 pendente) |
| Segurança de credenciais | 7/10 | = (rotação §1 pendente) |
| Operação/observabilidade | 8/10 | ⬇ (GlitchTip 500 não verificado + registry stale + ghost events sem alarme audível → o S5-1 passou despercebido por ~20 min até esta auditoria) |
| **Linha principal WhatsApp** | 🔴 **degradada** | Conectada, porém **fora do pipeline** — executar o runbook S5-1 (~10 min, sem downtime) |

**Resumo executivo:** instalação, versão e bancos estão exemplares (nada a corrigir).
A única ação urgente é **refazer o pareamento na instância `wpp2` correta e apagar a fantasma**
— 10 minutos com o telefone em mãos, sem derrubar a linha, seguindo o runbook da seção 0.
Depois disso, as pendências estruturais continuam as mesmas da sessão 4: rotação de senha,
retenção do `_analytics` (35 GB), GlitchTip e drift dos stacks de backup.
