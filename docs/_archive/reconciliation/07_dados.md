# FASE 6 — RECONCILIAÇÃO DE DADOS/ESTADO (Etapas 75–84)

> Auditoria read-only · Executada em 2026-08-04 (~18:10 UTC) via Supabase MCP (SQL SELECT) + Portainer MCP + grep no repo `C:\zapp-web-v3` (src/ e supabase/functions).
> Regras: somente SELECT; nenhuma escrita no banco; nenhum comando git.

---

## 75) Órfãos de Auth × Profiles

**SQL executado:**
```sql
SELECT
  (SELECT count(*) FROM auth.users u LEFT JOIN zapp.profiles p ON p.id=u.id WHERE p.id IS NULL) AS users_sem_profile_por_id,
  (SELECT count(*) FROM auth.users u LEFT JOIN zapp.profiles p ON p.user_id=u.id WHERE p.id IS NULL) AS users_sem_profile_por_user_id,
  (SELECT count(*) FROM zapp.profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL) AS profiles_sem_user_por_id,
  (SELECT count(*) FROM zapp.profiles p LEFT JOIN auth.users u ON u.id=p.user_id WHERE u.id IS NULL) AS profiles_sem_user_por_user_id;
-- + (SELECT count(*) FROM auth.users) AS total_users, (SELECT count(*) FROM zapp.profiles) AS total_profiles,
--   (SELECT count(*) FROM zapp.profiles WHERE id = user_id) AS profiles_id_igual_user_id,
--   (SELECT count(*) FROM zapp.profiles WHERE user_id IS NULL) AS profiles_user_id_null
```

**Resultado:**
| Métrica | Valor |
|---|---|
| total_users (auth.users) | **19** |
| total_profiles (zapp.profiles) | **19** |
| users sem profile (join por `profiles.user_id`) | **0** |
| profiles sem user (join por `profiles.user_id`) | **0** |
| users sem profile (join por `profiles.id`, como no enunciado) | 19 (falso positivo — ver nota) |
| profiles sem user (join por `profiles.id`) | 19 (falso positivo — ver nota) |
| profiles com `id = user_id` | **0** |
| profiles com `user_id` NULL | **0** |

**Análise:** `zapp.profiles.id` é PK própria (uuid gerado), NÃO espelha `auth.users.id`; a FK real é `profiles.user_id → auth.users.id` (nenhum profile com `user_id` NULL). O join do enunciado (`p.id = u.id`) produz 19 "órfãos" nos dois sentidos por convenção de schema — **não há órfãos reais**. Amostra de emails mascarados: **não se aplica (0 órfãos)** — nenhum email exibido.

**Status: ✅ OK (0 órfãos)** · Severidade: sem ação.

---

## 76) Cron — Execução Real (P1)

**SQL:**
```sql
SELECT jrd.jobid, j.jobname, jrd.status, left(jrd.return_message,120), jrd.start_time
FROM cron.job_run_details jrd LEFT JOIN cron.job j ON j.jobid=jrd.jobid
ORDER BY jrd.start_time DESC LIMIT 100;
-- + SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
-- + agregado 7d: SELECT status, count(*) ... WHERE start_time > now()-interval '7 days' GROUP BY status;
```

**Resultado:**
- **146 jobs ativos** em `cron.job` (todos `active=true`), 0 inativos.
- Últimos 7 dias: **29.940 succeeded / 28 failed** (0,09%).
- Único job com falha nas últimas 24h: **jobid 44** — 7 falhas (horárias), última `2026-08-04T01:00Z`, erro: `ERROR: relation "evo.mv_daily_kpis" does not exist`. **O jobid 44 NÃO existe mais em `cron.job`** — foi removido/substituído (o job 243 `refresh_mv_daily_kpis` roda de hora em hora com `REFRESH MATERIALIZED VIEW` OK). Falha é resíduo histórico do job antigo.
- Cluster histórico de 14 entradas com `start_time IS NULL` (status `failed`/`connecting`, msg `job startup timeout`) no topo do histórico: **nenhuma nas últimas ~3.000 execuções** (`null_start_ultimos_3000 = 0`) — associado à janela de recriação dos containers da stack em 31/07/2026. Sem impacto atual.

**Status: ✅ Operacional** · Ação recomendada: limpar `job_run_details` do jobid 44 (P3) e considerar re-apontar qualquer referência a `evo.mv_daily_kpis` para a MV real.

---

## 77) pg_cron Worker — Frescor

**SQL:** `SELECT max(start_time) FROM cron.job_run_details;` (+ jobid/jobname do topo)

**Resultado:** último run **2026-08-04T18:08:00Z** com sucessos contínuos até 18:09Z (jobs `whatsapp_reconcile_*`, `reprocess_pending_webhooks`, `guardian-heartbeat-sync`, etc.). Total histórico: 29.955 runs (29.913 ok / 39 falhas).

**Status: ✅ Worker vivo e pontual** (atraso < 1 min).

---

## 78) pg_net — Egress de Webhooks (24h)

**SQL:**
```sql
SELECT count(*) FROM net._http_response WHERE created > now() - interval '24 hours';
SELECT status_code, count(*) FROM net._http_response WHERE created > now() - interval '24 hours' GROUP BY status_code ORDER BY count(*) DESC;
SELECT status_code, timed_out, left(error_msg,100), left(content,80) FROM net._http_response
WHERE created > now() - interval '24 hours' AND status_code >= 400 ORDER BY created DESC LIMIT 8;
```

**Resultado (24h):** **161 respostas** — 200: **130 (80,7%)** · 400: **26 (16,1%)** · 404: **5 (3,1%)**. Sem timeouts registrados. Corpo típico dos 400:
`{"status":400,"error":"Bad Request","response":{"message":["[object Object]"]}}` — padrão de rejeição de payload (formato) pelo endpoint de destino.

**Obs.:** `net._http_request` não existe nesta instalação (versão do pg_net não expõe URL/method nas respostas) — não foi possível identificar o host de destino dos 400.

**Status: ⚠️ P2** — 19% de erros nos egress. Ação: correlacionar os 26×400 com os logs da Evolution API / `evo.webhook_events` para identificar o payload que está sendo rejeitado.

---

## 79) Backlog / DLQ / Filas

**SQL:** descoberta via `information_schema.tables` (filtro `fail|queue|attempt|dlq|dead|retry|pending` em schemas `zapp`/`evo`) → 47 objetos (tabelas + views); contagem nas tabelas-base:

| Tabela | qtd | Nota |
|---|---|---|
| zapp.media_download_queue | **9.580** | ⚠️ ver análise abaixo |
| evo.evolution_retry_metrics | 3.271 | tabela de métricas/retry (não DLQ) |
| zapp.qr_attempts | 5 | transiente |
| zapp.cookie_probe_pending | 2 | transiente |
| zapp.dead_letter_queue, zapp.failed_messages, zapp.message_attempts, zapp._consumer_dlq | 0 | ✓ |
| zapp.evolution_dlq / evo.evolution_dlq / zapp.evolution_webhook_dlq / evo.evolution_webhook_dlq | 0 | ✓ |
| zapp.message_queue, zapp.outbound_message_queue, zapp.webhook_reprocess_queue, evo.evolution_message_queue, zapp.evolution_message_queue | 0 | ✓ |
| zapp.dlq_audit_log, evo.evolution_mirror_media_queue, zapp.queue_items, zapp.channel_queues, zapp.whatsapp_connection_queues, zapp.voice_conversion_queue, zapp.gmail_test_fail, zapp.evolution_bitrix_queue, evo.evolution_bitrix_queue | 0 | ✓ |

**media_download_queue (9.580):**
```sql
SELECT status, count(*), min(created_at), max(created_at), max(retry_count)
FROM zapp.media_download_queue GROUP BY status;
```
- `expired`: **6.214** (03/07 → 26/07) · `done`: **3.366** (05/05 → 26/07) · **0 pendentes/processando**.
- **Última escrita em 26/07/2026** (9 dias sem inserts) → não é backlog ativo, é **acúmulo de linhas terminais**.
- O cron de purge `purge-media-queue-and-scan-log` (job 90) roda diariamente 03:45 e retorna **`DELETE 0`** (03/08, 04/08) → **não está purgando nada** (critério do DELETE não casa com os status `expired`/`done`).

**Status: ⚠️ P2** — 9.580 linhas de lixo (estado terminal) sem purge efetivo; sem risco imediato (não cresce desde 26/07), mas deve ser limpo e o job 90 corrigido. DLQs e filas de mensagens: **todas vazias ✅**.

---

## 80) Buckets de Storage — Usados × Existentes

**SQL:** `SELECT b.id, b.name, b.public, count(o.id) FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id GROUP BY 1,2,3 ORDER BY 2;`
**Código:** varredura de `from('...')` em src/ + supabase/functions (2.330 arquivos) — buckets reais referenciados: `audio-memes`, `audio-messages`, `avatars`, `quarantine`, `team-chat-files`, `whatsapp-media` (nomes com hífen; `custom_emojis`/`stickers`/`audio_memes` são **tabelas**, não buckets).

| Bucket | public | objetos | Referenciado no código? |
|---|---|---|---|
| whatsapp-media | não | **16.506** | ✅ sim |
| audio-messages | não | **2.202** | ✅ sim |
| avatars | sim | **1.411** | ✅ sim |
| etiquetas-remessa | não | 12 | ❌ não (uso externo/legado) |
| fechamentos | não | 237 | ❌ não (uso externo/legado) |
| audio-memes | sim | **0** | ✅ sim — **vazio** |
| team-chat-files | não | **0** | ✅ sim — **vazio** |
| quarantine | não | 0 | ✅ sim (scan de segurança — vazio é o esperado) |
| comprovantes-financeiro | não | 0 | ❌ não (uso externo) |
| email-attachments | não | 0 | ❌ não |
| recibos-entrega | sim | 0 | ❌ não |
| custom-emojis | sim | 0 | ⚠️ código usa tabela `custom_emojis`; bucket `custom-emojis` órfão |
| stickers | sim | 0 | ⚠️ código usa tabela `stickers`; bucket `stickers` órfão |

**Status: ⚠️ P2 (leve)** — 8 buckets sem objetos. `audio-memes` e `team-chat-files` são referenciados no código mas estão vazios (funcionalidade ociosa). Buckets `custom-emojis`, `stickers`, `comprovantes-financeiro`, `email-attachments`, `recibos-entrega` sem referência no zapp-web-v3 (podem servir a painéis externos — confirmar antes de remover). Sem risco de dados (nenhum bucket com objetos fora do esperado).

---

## 81) Realtime — Canais do Front × Publicação (P1)

**Código:** 40 canais via `channel('...')` em src/; 45 tabelas em `postgres_changes` (ex.: `channel_connections_safe→channel_connections`, `degraded-banner→whatsapp_connections`, `health-updates→connection_health_logs`, `talkx-realtime→talkx_campaigns`, `notifications:*→app_notifications`).
**Publicação:** `SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname IN ('supabase_realtime','supabase_realtime_messages_publication');` → **79 tabelas** (zapp.*, evo.*, financeiro.payment_links, email_app.*, realtime.messages_*).

**Divergência (P1):**
| Tabela subscrita pelo front | Na publicação? | Schema real |
|---|---|---|
| `messages` | ❌ **NÃO** | existe em `public.messages` e `zapp.messages` — **nenhuma publicada** |
| `messages_whatsapp` | ❌ **NÃO** (usada em `from()`) | zapp.messages_whatsapp não publicada |
| demais 43 tabelas (whatsapp_connections, channel_connections, email_accounts, failed_messages, payment_links, evolution_*, team_*, queues, etc.) | ✅ sim | zapp/evo/financeiro/email_app |

→ **O front assina `postgres_changes` na tabela `messages` e ela não está em nenhuma publicação** → eventos de novas mensagens **não chegam** via realtime (chat pode depender de polling/fallback). P1 confirmado.
**Achado transversal:** `messages`, `whatsapp_connections`, `channel_connections`, `audio_memes`, `custom_emojis`, `stickers` existem em **duplicidade `public.*` e `zapp.*`** (herança da migração Lovable→self-hosted) — risco de ambiguidade em `postgres_changes` e em queries sem schema.

**Status: 🔴 P1** — adicionar `zapp.messages` (e `zapp.messages_whatsapp`, se usada) à publicação `supabase_realtime`; auditar/desativar as tabelas `public.*` duplicadas.

---

## 82) Volumes com Dado — Persistência

**Fonte:** `portainer_list_volumes` (38 volumes) + `portainer_get_container` + stack file `supabase` (id 35).

| Serviço | Dado | Montagem | Tipo | Persistente? |
|---|---|---|---|---|
| supabase_db (postgres 15.8.1) | **todo o banco** | `/root/supabase/docker/volumes/db/data` → `/var/lib/postgresql/data` | **bind mount** (host) | ✅ sim (sobrevive a rm de container/stack) |
| supabase_storage (storage-api v1.60.4) | arquivos | `/root/supabase/docker/volumes/storage` → `/var/lib/storage` (backend `file`) | **bind mount** | ✅ sim |
| supabase functions (edge-runtime v1.74) | código deno | `/root/supabase/docker/volumes/functions` → `/home/deno/functions` | **bind mount** | ✅ sim |
| supabase_db config | postgresql.conf custom | volume named `supabase_db_config` (único named volume da stack) | volume | ✅ sim |
| pooler/api/logs (supavisor, kong, vector) | configs | `/root/supabase/docker/volumes/{pooler,api,logs}` | bind | ✅ sim |

- **Nenhum dado em tmpfs/efêmero.** Porém: os dados críticos vivem em **bind mounts em `/root/supabase/docker/volumes/`** (fora do gerenciamento de volumes Docker) — nada é volume named (exceto config). Se o diretório host for perdido, não há proteção do Docker.
- **Disco (exec `df -h` no supabase_db):** `/dev/sda1 194G — 151G usados — 43G livres (78%)` no diretório de dados do Postgres.
- **Backups:** stacks `supabase-backup` (running, Up 3 dias), `postgres-backup-daily`/`weekly`/`monthly` (running) e `restore-validate` — cobertura presente.

**Status: ⚠️ P2** — persistência OK, mas: (1) dados em bind mount fora de volume named (documentar/avaliar migração para volume + `docker volume` backup); (2) disco a 78% (43G livres) — monitorar (já há stacks `disk-*`/`host-disk-guard` ativos).

---

## 83) WAL / Replication Slots

**SQL:**
```sql
SELECT slot_name, database, active, wal_status, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag FROM pg_replication_slots;
SELECT count(*), pg_size_pretty(sum(size)) FROM pg_ls_waldir();
```

**Resultado:**
| Slot | database | active | wal_status | lag |
|---|---|---|---|---|
| supabase_realtime_slot_realtime_ | postgres | ✅ true | reserved | 6.995 kB |
| supabase_realtime_messages_replication_slot_ | postgres | ✅ true | reserved | 6.995 kB |

- **Nenhum slot inativo/órfão.** WAL dir: **64 arquivos / 1.024 MB** (≪ limite de alerta de 5 GB). Sem risco de disco por WAL.
- Guards ativos: cron `wal-slot-monitor` (a cada 15 min, succeeded) + container `wal-slot-guard` (Up 3 dias) + cron `wal-alert-state-cleanup` (DELETE 0, OK).

**Status: ✅ OK** — sem P1.

---

## 84) Matriz Consolidada — DADOS/ESTADO

| # | Item | Evidência (resumo) | Status | Severidade | Ação recomendada |
|---|---|---|---|---|---|
| 75 | Órfãos auth×profiles | 19×19 usuários/profiles; 0 órfãos via `user_id`; 19 "órfãos" só no join por `id` (convenção de schema) | ✅ OK | — | Nenhuma |
| 76 | Cron execução | 146 jobs ativos; 29.940 ok / 28 fail em 7d; única falha = jobid 44 removido (`evo.mv_daily_kpis` inexistente) | ✅ OK | P3 | Limpar histórico do job 44 |
| 77 | Worker pg_cron | último run 18:08Z (hoje), sucessos até 18:09Z; cluster antigo de "startup timeout" (14, nenhum recente) | ✅ OK | — | Nenhuma |
| 78 | pg_net egress 24h | 161 respostas: 130×200 / 26×400 / 5×404 (19% erro, corpo `Bad Request [object Object]`) | ⚠️ | P2 | Investigar origem dos 400 (Evolution webhooks?) |
| 79 | Filas/DLQ | DLQs e filas de mensagem **0**; `media_download_queue` 9.580 linhas terminais (última escrita 26/07); purge diário faz `DELETE 0` | ⚠️ | P2 | Limpar linhas `expired`/`done`; corrigir job 90 |
| 80 | Buckets | 13 buckets; 5 em uso (whatsapp-media 16.506, audio-messages 2.202, avatars 1.411, etiquetas-remessa 12, fechamentos 237); 8 vazios; `audio-memes`/`team-chat-files` vazios mas referenciados | ⚠️ | P2 | Revisar buckets vazios/órfãos (confirmar uso externo) |
| 81 | Realtime | 40 canais / 45 tabelas subscritas × publicação de 79 tabelas; **`messages` e `messages_whatsapp` subscritas NÃO publicadas**; duplicidade `public.*` vs `zapp.*` | 🔴 | **P1** | Publicar `zapp.messages`/`zapp.messages_whatsapp` em `supabase_realtime`; auditar duplicatas |
| 82 | Volumes/persistência | Dados do DB/storage/functions em **bind mounts** `/root/supabase/docker/volumes/` (persistentes); único named volume = config; disco 78% (43G livres); backups ativos | ⚠️ | P2 | Documentar bind mounts; avaliar volume named + backup dedicado; monitorar disco |
| 83 | WAL/slots | 2 slots ativos (lag ~7 MB); WAL 1.024 MB; guards operando | ✅ OK | — | Nenhuma |

### 🏆 Top problemas (prioridade)
1. **🔴 P1 — Realtime: `messages` não publicada.** Front assina `postgres_changes` em `messages` (e `messages_whatsapp` em `from()`) e a tabela não está em `supabase_realtime` nem na `supabase_realtime_messages_publication` → eventos de mensagens não são entregues. Duplicidade `public.messages` vs `zapp.messages` agrava a ambiguidade.
2. **⚠️ P2 — `zapp.media_download_queue` com 9.580 linhas terminais** (6.214 expired + 3.366 done, paradas desde 26/07) e cron de purge (job 90) retornando `DELETE 0` diariamente — purge ineficaz.
3. **⚠️ P2 — pg_net:** 26×400 + 5×404 em 24h (19% dos egress) com corpo `Bad Request [object Object]` — possível payload de webhook rejeitado pela Evolution API.
4. **⚠️ P2 — Persistência por bind mount + disco 78%:** dados do Postgres fora de volume named em `/root/supabase/docker/volumes/db/data`; 43 GB livres — monitorar crescimento.
5. **⚠️ P2 — Buckets:** 8 buckets vazios; `audio-memes` e `team-chat-files` referenciados no código mas sem objetos; `custom-emojis`/`stickers` órfãos (código usa tabelas homônimas).

### Ajustes de metodologia registrados
- `zapp.profiles.id ≠ auth.users.id` (FK real = `user_id`) → join do enunciado gera falsos órfãos.
- `cron.job_run_details` não tem `jobname` (vem de `cron.job`).
- `net._http_response` não expõe URL/method nesta versão (sem `net._http_request`).
- `custom_emojis`/`stickers`/`audio_memes` no `from()` do código são **tabelas**, não buckets.
