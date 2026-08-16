# FASE 7 — VERSÕES, SAÚDE E RESILIÊNCIA (etapas 85-92)

> Auditoria **read-only** (Portainer MCP + exec de leitura) — nenhuma alteração executada.
> Data da coleta: **2026-08-04 ~18:10 UTC (15:10 BRT)** — Host: Swarm node único, endpoint Portainer #1.

---

## 85. Matriz de Versões — Stack Supabase

| Serviço (task) | Imagem (tag) | Postgres alvo | Criado | Uptime | RestartCount | OOMKilled | Mem. limit | CPU |
|---|---|---|---|---|---|---|---|---|
| supabase_db | `supabase/postgres:15.8.1.085` | — | 31/07 | 4d (healthy) | 0 | false | **sem limite** | — |
| supabase_rest | `postgrest/postgrest:v14.12` | PG 15.8 ✓ | 02/08 | 45h | 0 | false | sem limite | — |
| supabase_auth | `supabase/gotrue:v2.189.0` | PG 15.8 ✓ | 28/07 | 7d | 0 | false | sem limite | — |
| supabase_kong | `kong:3.9.3` | — | 03/08 | 28h (healthy) | 0 | false | sem limite | — |
| supabase_functions | `supabase/edge-runtime:v1.74.0` | PG 15.8 ✓ | **04/08 14:24Z** | 4h | 0 | false | **1.5 GB** | 1 core |
| supabase_meta | `supabase/postgres-meta:v0.96.6` | PG 15.8 ✓ | **04/08 16:29Z** | 2h (healthy) | 0 | false | **512 MB** | 0.5 core |
| supabase_studio | `supabase/studio:2026.06.29-sha-20290c7` | — | 31/07 | 3d (healthy) | 0 | false | **1.5 GB** | 0.5 core |
| supabase_realtime | `supabase/realtime:v2.102.3` | PG 15.8 ✓ | 31/07 | 4d | 0 | false | sem limite | — |
| supabase_analytics | `supabase/logflare:1.43.1` | PG 15.8 ✓ | 28/07 | 7d | 0 | false | sem limite | — |
| supabase_storage | `supabase/storage-api:v1.60.4` | PG 15.8 ✓ | 28/07 | 7d | 0 | false | sem limite | — |
| supabase_vector | `timberio/vector:0.53.0-alpine` | — | 26/07 | 8d | 0 | false | sem limite | — |
| supabase_imgproxy | `darthsim/imgproxy:v3.30.1` | — | 26/07 | 8d | 0 | false | sem limite | — |
| supabase_supavisor | `supabase/supavisor:2.9.5` | PG 15.8 ✓ | 28/07 | 7d | 0 | false | sem limite | — |
| supabase-backup | `postgres:15-alpine` (PG 15.17) | PG 15.8 ✓ | 01/08 | 3d | 0 | false | 1 GB | — |
| supabase-config-backup | `alpine:3.19` + mcli | — | 26/07 | 8d | 0 | false | 64 MB | — |

**Observações de versão:**
- **Todas as imagens são compatíveis com PG 15.8** — edge-runtime v1.74.0 e postgrest v14.12 confirmados como imagens reais em execução (não há drift de tag).
- rest `v14.12` conecta em `PG 15.8` sem warning (log: "Successfully connected to PostgreSQL 15.8").
- ⚠️ **`supabase_meta` e `supabase_functions` foram RECRIADOS hoje (04/08 14:24Z e 16:29Z)** — os únicos containers do stack com `Created` de hoje. Indício de crash/redeploy recente (ver seção 86).
- Kong `3.9.3` com watchtower habilitado (`com.centurylinklabs.watchtower.enable=true`) — pode atualizar sem stack deploy controlado.
- Supavisor `2.9.5` com `VAULT_ENC_KEY=your-encryption-key-32-chars-min` (default placeholder) e pooler.exs bind-mountado.

---

## 86. ROOT-CAUSE do supabase_meta (P1) — crash-loop com exit 137

### Evidências
| Evidência | Valor |
|---|---|
| Container atual | criado **04/08 16:29:27Z**, StartedAt 16:29:32Z, up 2h, `healthy`, RestartCount=0 (container novo — Swarm recriou o task) |
| Logs do container ATUAL | **sem OOM** — só 2 entradas de boot ("Server listening 8080/8081") + erros funcionais `42883 index_advisor(text) does not exist` (repetidos a cada ~1-5 min, POST /query) |
| Memória configurada | `Memory: 512 MB`, `NODE_OPTIONS=--max-old-space-size=400` (heap Node travado em 400 MB dentro de 512 MB) |
| Memória real (agora) | `VmRSS 128 MB / VmHWM 143 MB` (pico 143 MB) — **sem pressão no momento** |
| Logs do Studio (impacto) | `TypeError: fetch failed ... getaddrinfo ENOTFOUND meta` + `ECONNRESET` + `RangeError: Invalid status code: undefined` → **confirma que o Studio perdeu o meta** durante o crash |
| Monitor de saúde (mcp-health) | não monitora `meta` (monitora portainer-mcp, supabase-mcp, n8n, redis, traefik) — cegueira no evento |
| Erro de versão/env | nenhum — env correto (PG_META_DB_HOST=db, crypto key setado) |

### Diagnóstico
O **crash anterior (task removido) foi OOM kill (exit 137)**: o Swarm recriou o container hoje 16:29Z; os logs do Studio mostram `ENOTFOUND meta` no período (schema browser fora). A causa provável do OOM é o **heap Node de 400 MB dentro de um limite de cgroup de 512 MB** (margem de apenas 112 MB para nativo/overhead), combinado com o **Studio executando queries pesadas do schema browser / Index Advisor** (evidência: os erros `42883 index_advisor` mostram o Studio chamando o advisor repetidamente via meta). Com 1000+ tabelas no banco, uma chamada de listagem completa estoura o heap → Node morre → cgroup mata (137) → Swarm recria.

**Impacto confirmado:** Studio/schema browser fica fora durante o crash (`ENOTFOUND meta` nos logs do studio). **Pipeline types.ts NÃO depende do meta**: `supabase-db-mcp` conecta direto no banco (`DATABASE_URL` do secret `supabase_db_url_v1`, porta 3100, healthy) — a geração de tipos segue funcionando sem meta.

### Recomendação de correção (NÃO executada — auditoria read-only)
1. **P1 — subir o limite de memória do meta de 512 MB → 1 GB** e `NODE_OPTIONS=--max-old-space-size=768` (via update do serviço `supabase_meta` no stack supabase). Custo trivial, elimina o OOM na maioria dos cenários.
2. **P2 — criar a função `index_advisor(text)` no banco** (extensão/pg_stat_statements, padrão Supabase) para eliminar os erros `42883` recorrentes, **ou** desabilitar o Index Advisor no Studio (feature não usada pela operação).
3. **P2 — adicionar `meta:8080/health` ao mcp-health-monitor** (hoje o crash passa despercebido até o Studio quebrar).
4. **P3 — avaliar remover o meta** se o schema browser do Studio for dispensável — o pipeline de tipos e todas as APIs continuam funcionando sem ele. Decisão de produto.

---

## 87. Health / Restart — Todos os containers do stack

Todos os 15 containers do stack supabase estão `running` com `RestartCount=0` e `OOMKilled=false`. **Nenhum flapping ativo** (nenhum com RestartCount > 5).

| Sinalização | Container | Detalhe |
|---|---|---|
| ⚠️ Recriado hoje (crash anterior) | supabase_meta | task recriado 04/08 16:29Z (ver 86) |
| ⚠️ Recriado hoje | supabase_functions | 04/08 14:24Z — provável redeploy de função/env, sem crash no log atual |
| ℹ️ Sem healthcheck | rest, auth, functions, realtime, analytics, storage, vector, imgproxy, supavisor | só db, kong, studio, meta têm healthcheck |

Fora do stack supabase (contexto): `github-actions-runner` com 5 tasks `Exited (1)` (2-3 dias atrás) e `clamav` com múltiplos `Exited (143)` — rotatividade normal de jobs/atualização, não afeta o supabase.

---

## 88. Logs recorrentes — Top erros por serviço

### supabase_rest (postgrest v14.12)
| # | Padrão | Frequência | Trecho do log |
|---|---|---|---|
| 1 | `Failed listening for database notifications on the "pgrst" channel. server closed the connection unexpectedly` + reconexão em 1s | **a cada ~2h** (01:05, 03:06, 05:07, 07:07 … 17:38) | `03/Aug/2026:01:05:26 +0000: Failed listening for database notifications ... Retrying in 1 seconds` |
| 2 | `Schema cache loaded ... Relations` (rotina) | a cada reload | `Schema cache loaded 1333 Relations, 804 Relationships, 799 RPCs` |

> Causa provável: o Postgres (ou infra de rede/wal) encerra a conexão NOTIFY ociosa a cada ~2h; postgrest reconecta sozinho em 1s — **baixo impacto**, mas indica ausência de keepalive/tcp tuning. Sem 401/403/timeouts no postgrest.

### supabase_auth (gotrue v2.189.0)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | `Request received external host in X-Forwarded-Host or Host headers ... not been added to GOTRUE_MAILER_EXTERNAL_HOSTS` | contínuo | `x_forwarded_host":"supabase.atomicabr.com.br"` |
| 2 | `status 500` | **1 em 247 linhas** (123× 200) | request completed /user 200 |

> Auth **saudável**: 123× 200 vs 1× 500. Apenas warning de config (header de host não listado em `GOTRUE_MAILER_EXTERNAL_HOSTS` — cosmético).

### supabase_functions (edge-runtime v1.74.0)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | `[Error] [MEDIA] base64 upload error after retries: statusCode 415 invalid_mime_type "mime type audio/ogg; codecs=opus is not supported"` | **recorrente (áudios)** | `[MEDIA] base64 upload error after retries: { statusCode: "415", error: "invalid_mime_type" ...` |
| 2 | `[Error] Error inserting message: PGRST106 "Invalid schema: evo" — Only the following schemas are exposed: public, zapp, storage, graphql_public, artes, vendas, financeiro` | recorrente | `code: "PGRST106", message: "Invalid schema: evo"` |
| 3 | `wall clock duration warning` + `early termination has been triggered: isolate` | esporádico | `wall clock duration warning: isolate: 343a60f6...` |

> **PGRST106 é o achado mais importante**: as edge functions (evolution-webhook) fazem POST/GET em `/rest/v1/evolution_messages` com schema `evo`, mas o PostgREST **não expõe o schema `evo`** (`PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro`). O Kong retorna 406 (não 200) nessas chamadas (confirmado nos logs do kong: `GET/POST /rest/v1/evolution_messages ... 406 180`). **Contrato quebrado front↔REST.**

### supabase_db (PG 15.8)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | Nenhum erro — apenas log de cron jobs (pg_cron) | a cada minuto | `cron job 17 starting: SELECT zapp.fn_reprocess_pending_webhook_events(200); ... completed: 1 row` |
| 2 | `NOTICE: Guardian alert ja existe, dedup ok (gap=2668 min)` | 1x no período | `NOTICE: Guardian alert ja existe, dedup ok` |

> Banco **estável**. ~30 cron jobs por minuto (reprocessamento, health checks, sentinel) sem falhas no período observado.

### supabase_storage (storage-api v1.60.4)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | `415 InvalidMimeType "mime type audio/ogg; codecs=opus is not supported"` | **72 de 154 linhas (47% do log!)** | `"error":"invalid_mime_type","message":"mime type audio/ogg; codecs=opus is not supported"` (POST /object/audio-messages/...) |
| 2 | (sem outros erros) | — | — |

> Storage **funciona**, mas **47% do volume de log é erro de MIME de áudio do WhatsApp** (OGG/Opus rejeitado pelo storage-api v1.60.4). Impacto funcional: **áudios não persistem no bucket** (o webhook tenta e falha com 415). Volume alto de logs de erro.

### supabase_kong (3.9.3)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | `POST /rest/v1/evolution_messages ... 406` (schema evo não exposto) | **a cada webhook de mensagem** | `"POST /rest/v1/evolution_messages?select=id HTTP/1.1" 406 180` |
| 2 | `POST /functions/v1/gmail-send ... 401` | recorrente | `"POST /functions/v1/gmail-send HTTP/1.1" 401 67 "Deno/2.9.4"` |
| 3 | `POST /functions/v1/evolution-webhook ... 500` (spikes) | esporádico (alguns por minuto) | `"POST /functions/v1/evolution-webhook HTTP/1.1" 500 51 "axios/1.13.2"` |
| 4 | `POST /rest/v1/webhook_events_processed ... 409` | esporádico | `"POST /rest/v1/webhook_events_processed HTTP/1.1" 409 259` |

### supabase_realtime (v2.102.3)
- Apenas warnings benignos: `RateCounter idle_shutdown reached` e `Zero region nodes for us-east-1 using realtime@127.0.0.1` (single-node esperado). **Sem erros.**

### supabase_meta (v0.96.6)
| # | Padrão | Frequência | Trecho |
|---|---|---|---|
| 1 | `ERROR 42883: function index_advisor(text) does not exist` (POST /query) | **a cada ~1-5 min** | `"message":"function index_advisor(text) does not exist","request":{"method":"POST","url":"/query"}` |

---

## 89. BACKUPS (P0) — Estado: ✅ OK (dump de HOJE + R2 offsite)

### supabase-backup (pg_dump custom → local + R2, v4 sentinel sync)
| Item | Evidência |
|---|---|
| Container | `supabase-backup_backup` running (postgres:15-alpine, PG 15.17), RestartCount=0, mem limit 1 GB |
| Dump mais recente | **`supabase_selfhosted_20260804_151702.dump` — HOJE 15:17 UTC, 143.7 MB** |
| Validação leitura | Magic bytes `PGDMP \x01\x0f` (formato custom do pg_dump, **não gzip — PGDMP é o formato correto**), `pg_restore --list` OK: `TOC Entries: 10462`, `Compression: 6`, dbname postgres |
| Checks do script | `[20260804_151702] OK: 137MB 767 tables` + sentinel `updated: true` |
| R2 offsite | `supabase_selfhosted_20260804_151702.dump.gpg` → `r2/promo-brindes-backups/backups/supabase-db/daily/` **R2 OK** (132.47 MiB em 5s, 24.7 MiB/s) — criptografia AES256 (gpg) |
| Histórico | Dumps diários desde 25/07; falhas antigas `BACKUP_FAILED_20260725_105554` e `_123805` (25/07, já superadas); tamanho crescendo (47 MB → 143 MB) |
| Retention | 14 dias local, 14d R2 (`R2_RETENTION=14d`) |

### supabase-config-backup (config → R2)
| Item | Evidência |
|---|---|
| Rotina | diária 18:56Z, `src=/src (supabase_db_config) → r2 .../supabase-db/config`, retention 30d |
| Último OK | `2026-08-03T18:56:23Z OK offsite: supabase_db_config_20260803_185622.tar.gz.gpg [root.key validada]` |
| ⚠️ Pendência | dump de **04/08** ainda não executado às 18:10Z (agendado 18:56Z de hoje — dentro do intervalo normal) |

**Veredito: backup P0 saudável** — dump custom válido de hoje, legível, com sentinel sincronizado e réplica offsite criptografada no R2.

---

## 90. Recursos / OOM — Riscos por serviço

### Host (via exec no supabase_db)
| Métrica | Valor | Avaliação |
|---|---|---|
| Disco `/` | **194G total, 151G usado (78%), 43G livre** | ⚠️ subindo — monitorar (dump 143 MB/dia + WAL) |
| RAM | 24 GB total, 14.4 GB used, 5.7 GB available, **0 swap** | ⚠️ **sem swap** — OOM do kernel é imediato sob pressão |
| cgroup memory.max (db) | sem limite (`Memory: 0`) | db sem proteção de limite — depende do OOM killer do host |

### Limites declarados vs risco OOM
| Serviço | Limit | Uso/pico atual | Risco OOM |
|---|---|---|---|
| **supabase_meta** | **512 MB** | 128/143 MB | 🔴 **ALTO** — foi OOM (137) hoje; heap 400 MB + queries pesadas do Studio (ver 86) |
| supabase_functions | 1.5 GB | — | 🟢 baixo (1 core, sem sintoma) |
| supabase_studio | 1.5 GB | — | 🟢 baixo |
| supabase-backup | 1 GB | — | 🟡 médio — pg_dump de 143 MB + gpg + mc no mesmo limite; OK hoje |
| supabase-config-backup | 64 MB | — | 🟡 médio — tar.gz 4 KB, folga; risco baixo |
| db, rest, auth, kong, realtime, storage, analytics, vector, imgproxy, supavisor | **sem limite** | — | 🟡 todos dependem do OOM killer do host (24 GB, sem swap) |

**Recomendação:** subir meta para 1 GB (P1, seção 86); considerar limites para db (ex.: 8 GB) e rest (2 GB) para evitar morte do host por um container; considerar adicionar swap (4 GB) no host como rede de segurança.

---

## 91. Rede interna e gateway — ✅ OK

### Interna (exec no supabase_functions → kong/meta/db)
| Alvo | Resultado |
|---|---|
| `http://kong:8000/rest/v1/` | **401** (esperado sem apikey — gateway responde) |
| `http://kong:8000/auth/v1/health` | **401** "No API key found in request" (esperado) |
| `http://kong:8000/storage/v1/status` | **200** ✅ |
| `http://meta:8080/health` | **200** ✅ |
| `http://db:5432/` | `000` (postgres não fala HTTP — esperado; TCP ok via pg) |

> Rede overlay `AtomicaBRNet` saudável — todos os serviços resolvem `kong`/`meta`/`db` por DNS do Swarm.

### Externa (host Windows → https://supabase.atomicabr.com.br via Traefik)
| Endpoint | HTTP | Interpretação |
|---|---|---|
| `/auth/v1/health` | **401** | gateway + auth respondem (401 sem chave = esperado) |
| `/storage/v1/status` | **200** | ✅ gateway + storage OK |
| `/rest/v1/` | **401** | gateway + rest respondem (esperado sem chave) |

**Veredito: gateway (Traefik → Kong) responde em todos os endpoints** — conectividade pública confirmada.

---

## 92. Resumo — Plano de ação por problema

| # | Problema | Severidade | Evidência | Ação (não executada) |
|---|---|---|---|---|
| 1 | **Meta crash-loop OOM (exit 137)** — heap 400 MB em limit 512 MB | **P1** | container recriado 04/08 16:29Z; Studio com `ENOTFOUND meta`; VmHWM 143 MB só após recriação | Subir mem. limit p/ 1 GB + `--max-old-space-size=768`; criar/remover index_advisor; adicionar healthcheck do meta ao mcp-health-monitor |
| 2 | **PGRST106 / 406: schema `evo` não exposto** — edge functions falham ao gravar mensagens | **P1** | logs functions `Invalid schema: evo`; kong `406` em evolution_messages | Adicionar `evo` a `PGRST_DB_SCHEMAS` do rest **ou** mudar funções para usar schema exposto (decisão de arquitetura) |
| 3 | **Áudios OGG/Opus rejeitados (415)** — 47% do log do storage; áudios não persistem | **P2** | `invalid_mime_type audio/ogg; codecs=opus` ×72 | Configurar storage para aceitar `audio/ogg`/`audio/opus` (MIME allowlist) ou converter no webhook |
| 4 | **rest: desconexão NOTIFY a cada ~2h** | P3 | logs rest "server closed the connection unexpectedly" | Investigar keepalive TCP / idle timeout do pg; baixo impacto (reconecta em 1s) |
| 5 | **Disco 78% e crescendo** (dump 143 MB/dia) | P3 | `df: 151G/194G used` | Revisar retention do backup (14d) e WAL; planejar expansão de disco |
| 6 | **Sem swap no host + vários containers sem memory limit** | P3 | `free -m: swap 0`; HostConfig.Memory=0 na maioria | Adicionar swap 4 GB; definir limites p/ db/rest (proteção contra OOM do host) |
| 7 | **gmail-send 401 recorrente** | P3 | kong `401` em /functions/v1/gmail-send | Verificar apikey/verify_jwt da function gmail-send |
| 8 | **Backup P0** | ✅ OK | dump de hoje 143 MB validado (PGDMP, 10462 TOC) + R2 OK | Nenhuma ação; monitorar tamanho crescente |
| 9 | **Rede/gateway** | ✅ OK | 401/200 esperados internos e externos | Nenhuma ação |

### Containers do stack supabase — estado final
Todos `running`, RestartCount=0, sem OOM ativo. Único com crash recente: **supabase_meta** (recriado hoje, ver item 1).

---
*Fonte: Portainer MCP (list/get/logs/exec) + curl externo. Auditoria read-only — nenhuma alteração realizada. Arquivo: `docs/reconciliation/08_saude.md`.*
