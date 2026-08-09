# 📋 AUDITORIA MENSAL — EVO API

**Projeto:** EVO API · VPS AtomicaBR · **Fase E — etapa 100** · **Cadência:** 1×/mês (dia 1, 09:00 BRT)
**Meta:** **0 alertas no guardrail** + 0 resíduos novos + todos os SLOs da política anti-resíduos atendidos.
**Autor:** agente de governança (execução) · **Duração estimada:** 45–90 min.

---

## 0. Resumo executivo (preencher no final)

```markdown
# AUDITORIA MENSAL — <MÊS/ANO> · EVO API
- Guardrail: <N OK> / <M ALERTA> → meta 0 alertas: ✅/❌ (justificativa de cada ALERTA remanescente)
- Resíduos novos no mês: <n> · removidos ≤48h: <n> · em aberto: <n>
- Crons com falha 24h: <n> · WAL lag máximo: <MB> · Backup: <tamanho/idade>
- Disco: <% usado> · Imagens órfãs: <n/GB>
- Pendências herdadas: <etapas abertas> · Ações do mês: <lista>
```

---

## 1. Guardrail (stack 226) — meta 0 alertas

```bash
# 1) estado atual do guardrail (últimos ciclos)
docker service logs reconcile-ops_guardrail --since 24h | grep -E "RESUMO|ALERTA" | tail -40
# 2) resumo do último ciclo
docker service logs reconcile-ops_guardrail --since 30m | grep "RESUMO"
# 3) checks em ALERTA (se houver) — cada um vira ação com prazo:
#    WAL-01 → §4.3 · JWT-01 → comparar PGRST_JWT_SECRET vs auth · SCHEMA-01 → PGRST_DB_SCHEMAS
#    EDGE-01 → §4.7 · CRON-01 → §4.2 · META-01 → supabase_meta RestartCount · BACKUP-01 → §4.6
```

**Critério:** `INFO RESUMO: 8 OK, 0 ALERTA` (baseline 08/08: 6 OK, 2 ALERTA — EDGE-01/CRON-01 pendentes
das etapas B2/C5). **ALERTA remanescente só é aceitável com etapa dona registrada e prazo.**

---

## 2. Configuração e rollback do guardrail

| Item | Valor real (08/08) |
|---|---|
| Config ativa | `guardrail_script_v4` (substituiu v3) |
| WAL_THRESHOLD_MB / WAL_SAMPLES | 2000 / 2 (ALERTA exige 2 amostras ≥ teto) |
| BACKUP_SENTINEL_MB / BACKUP_MAX_AGE_HOURS | 60 / 26 |
| EDGE_MANIFEST | `/etc/guardrail/edge_functions_manifest_v2.txt` |
| Rollback | `docker service update --config-rm guardrail_script_v4 --config-add source=guardrail_script_v3,target=/guardrail.sh reconcile-ops_guardrail` |

---

## 3. Cron jobs (pg_cron) — 0 falhas em 24h

```sql
-- 1) falhas 24h (coluna é start_time — NÃO existe run_date)
SELECT jobid, status, return_message, start_time FROM cron.job_run_details
WHERE status = 'failed' AND start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC LIMIT 30;

-- 2) inventário de jobs
SELECT jobid, jobname, schedule, active, command, database FROM cron.job ORDER BY jobid;

-- 3) órfãos (job removido que ainda aparece como <deleted> no UI)
SELECT jrd.jobid, count(*) FILTER (WHERE jrd.status='failed') AS failed_count,
       count(*) AS total_runs, max(jrd.start_time) AS last_run
FROM cron.job_run_details jrd LEFT JOIN cron.job j ON j.jobid = jrd.jobid
WHERE j.jobid IS NULL GROUP BY jrd.jobid ORDER BY failed_count DESC;
```
**Regras:** falha intermitente = bug na condição/INSERT, não no schedule. Erro `invalid input value for
enum` → conferir `SELECT enum_range(NULL::<schema>.<enum>);`. **NUNCA hardcodar nome de slot `cainophile_*`**
(o sufixo é volátil — recriado a cada restart; usar `LIKE 'cainophile%'`). Pitfall clássico:
`format('%.1f', x)` é inválido no PostgreSQL — usar `round(x,1)` + `%s`.
**Meta:** 0 jobs com falha; órfãos purgados (`DELETE FROM cron.job_run_details WHERE jobid NOT IN (SELECT jobid FROM cron.job)`).

---

## 4. WAL lag e Realtime

```sql
-- 1) slots + dono (a coluna database decide o dono, NÃO o nome do slot)
SELECT slot_name, database, slot_type, active, wal_status, restart_lsn, confirmed_flush_lsn
FROM pg_replication_slots;

-- 2) walsenders (backend_start pré-restart = outro container dono)
SELECT pid, application_name, client_addr, state, sent_lsn, backend_start
FROM pg_stat_replication;

-- 3) lag atual do pior slot (3 amostras ~60s)
SELECT now() AS ts, slot_name, active,
  round(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1048576::numeric,2) AS lag_mb
FROM pg_replication_slots ORDER BY lag_mb DESC LIMIT 3;

-- 4) configuração do teto
SELECT name, setting, unit FROM pg_settings
WHERE name IN ('wal_sender_timeout','max_slot_wal_keep_size','wal_keep_size','max_wal_senders');

-- 5) realtime saudável
-- SELECT * FROM _realtime.tenants;
-- SELECT count(*) FROM realtime.messages WHERE inserted_at > now() - interval '10 minutes';
```
**Meta:** lag < 1000MB (teto guardrail 2000MB com margem); nenhum slot `wal_status='lost'`; nenhum
`active=false` sem dono conhecido. Keepalive (stack 231) com heartbeat 25s e `postgres_changes` ativo.

---

## 5. Banco Evolution (stack 20/126) — tamanho e retenção

```bash
# 1) tamanho do banco (alerta > 1.2GB configurado)
# SELECT pg_size_pretty(pg_database_size('evolution'));
# 2) top tabelas
# SELECT schemaname, relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
# FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
# 3) último ciclo do purge (stack 126) — esperado: 1×/dia, zero "syntax error", lock ok
docker service logs evolution-db-purge_purge --since 26h | grep -E "purged|VACUUM|lock|ERROR|syntax" | tail -40
# 4) runs registrados
# SELECT run_id, started_at, finished_at, rows_deleted, status FROM _purge_runs ORDER BY started_at DESC LIMIT 5;
# 5) Redis db8 (cache baileys) — TTL=-1 em todas as chaves = risco de crescimento sem limite (etapa aberta)
# redis-cli -n 8 info keyspace
```
**Meta:** banco < 1.2GB (ou crescimento < retenção do purge); purge com ciclos diários válidos;
nenhuma tabela na borda da retenção com volume anômalo.

---

## 6. Backup (stacks 124 e 220)

```bash
# 1) dump mais recente (sentinel: >= 60MB e idade < 26h)
docker exec <container-supabase-backup> ls -lh /backups/ | tail -10
# 2) logs do backup
docker service logs supabase-backup_<svc> --since 24h | tail -30
# 3) backup offsite (stack 220) — verificar execução do ciclo
docker service logs volume-backup_<svc> --since 24h | tail -30
# 4) tamanho real do banco vs dump (dump < 60MB → investigar antes de mexer no sentinel)
# SELECT pg_size_pretty(pg_database_size('postgres'));
```
**Meta:** dump diário presente, ≥ sentinel, ≤ 26h de idade; backup offsite com ciclo recente.

---

## 7. Disco e imagens (resíduos)

```bash
# 1) uso de disco
df -h / && docker system df
# 2) imagens órfãs — comparar com Spec+PreviousSpec de TODOS os serviços
docker images --digests --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Digest}}' | sort
docker service inspect $(docker service ls -q) --format \
  '{{.Spec.Name}} SPEC={{.Spec.TaskTemplate.ContainerSpec.Image}} PREV={{with .PreviousSpec}}{{.TaskTemplate.ContainerSpec.Image}}{{end}}'
# 3) configs/secrets órfãos — conferir referências em TODOS os specs (mesmo scale=0):
docker config ls && docker secret ls
#    antes de remover: grep dos nomes em compose files versionados + crontab + runbooks + monitors/*.sh
#    (ref fora do Swarm quebra o próximo deploy a partir do FILE)
# 4) colisão de short-ID conhecida: e1a210286b42 existe em evolution-api-custom (1.29GB) E zapp-web (117MB)
#    → rmi SEMPRE com ref completa repo:tag
```
**Regras (política anti-resíduos):** nunca `prune -a`; `ensure_ref_tags` antes de qualquer prune;
gates por imagem (Spec atual → aborta; PreviousSpec evolution → aborta; PreviousSpec zapp → skip);
remoção configs → secrets → imagens; pausar housekeeping periódico durante a janela.
**Meta:** 0 órfãos com > 48h; disco < 70%.

---

## 8. Pipeline de mensagens (webhooks, consumer, rate limit, 401s)

```sql
-- 1) saúde geral do webhook (24h)
SELECT status, error_message, COUNT(*) FROM public.webhook_audit_log
WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY 1,2 ORDER BY 3 DESC;

-- 2) rejeições por rate limit (deve ser < 10/hora)
SELECT COUNT(*) FROM public.webhook_audit_log
WHERE status = 'rejected' AND error_message = 'rate_limit_exceeded'
  AND created_at > NOW() - INTERVAL '1 hour';

-- 3) fontes do webhook (evolução da migração native → HMAC)
SELECT webhook_source, status, COUNT(*) FROM public.webhook_events_processed
WHERE processed_at > now() - interval '7 days' GROUP BY 1,2 ORDER BY 3 DESC;

-- 4) consumer (stack 113) — stats avançando?
SELECT * FROM evo.evolution_rabbit_consumer_stats ORDER BY collected_at DESC LIMIT 3;

-- 5) DLQ (resolvido = status='replayed'; NÃO existe coluna resolved)
SELECT status, count(*) FROM _consumer_dlq GROUP BY status;

-- 6) HMAC — slot do secret (0=primary) e rejeições:
docker service logs supabase_functions_functions --since 24h | grep -E "slot=|rejected|Invalid" | tail -30

-- 7) 401s do Traefik (host evolution) — picos anômalos?
SELECT date_trunc('hour', collected_at) AS h, count(*), sum(count)
FROM evo.evolution_traefik_401_stats WHERE collected_at > now() - interval '7 days'
GROUP BY 1 ORDER BY 1 DESC LIMIT 24;

-- 8) canary (stack 230) — http esperado 201:
# SELECT * FROM public._mcp_health_events WHERE target='evolution' ORDER BY observed_at DESC LIMIT 5;
```
**Meta:** 0 rejeições rate-limit; consumer stats avançando; DLQ estável; `slot=0 primary` estável;
401s sem picos inexplicados (> 2× mediana sem causa).

---

## 9. Edge functions (drift repo × runtime)

```bash
# 1) drift atual vs manifest guardrail_edge_functions_v2 (ALERTA se missing>0 ou stale>3)
docker service logs reconcile-ops_guardrail --since 24h | grep "EDGE-01" | tail -5
# 2) inventário runtime:
# SELECT name, version, digest FROM supabase_functions.functions ORDER BY name;   -- se schema disponível
# 3) resíduos .backup*/.bak* nas pastas de functions (etapa B2):
#   buscar no repo supabase/functions/ por *.backup* e *.bak*
```
**Meta:** missing=0, stale ≤ 3, orphan=0 (baseline 08/08: missing=14, stale=105, orphan=1 — etapa B2).

---

## 10. Segurança e conformidade (rápido)

```bash
# 1) CORS do stack 25 — preflight (apikey inválida basta; esperado 204 + ACAO refletida):
curl -s -o /dev/null -D - -X OPTIONS -H 'Origin: https://zapp.atomicabr.com.br' \
  -H 'Access-Control-Request-Method: GET' -H 'apikey: invalid-test-key' \
  https://evolution.atomicabr.com.br/instance/fetchInstances
# 2) chaves ativas (versionadas, sem exposição em webhook de erro):
docker secret ls | grep evolution_api_key
# 3) JWT consistente (rest vs auth — check JWT-01 do guardrail já cobre; verificar manual se ALERTA)
# 4) 401s de origem desconhecida — top client_hosts do collector:
# SELECT client_host, sum(count) FROM evo.evolution_traefik_401_stats
#   WHERE collected_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```
**Meta:** CORS restrito sem `*` (após etapa D) OU `*` documentado com prazo; 0 keys expostas; JWT consistente.

---

## 11. Relatório e follow-up

1. Preencher o resumo executivo (§0) no arquivo `docs/AUDITORIA_MENSAL_<YYYY-MM>.md` (novo a cada mês).
2. Cada ALERTA/achado → linha em tabela de ações com **dono, prazo, evidência** (mesmo formato do post-mortem).
3. Atualizar `docs/EXECUTION_PROGRESS.md` (etapas concluídas no mês).
4. Revisar a política anti-resíduos (`POLITICA_ANTI_RESIDUOS.md`) contra achados novos — adicionar padrão
   se um resíduo repetiu (a política aprende).
5. Se a auditoria encontrou algo que o guardrail NÃO detectou → **adicionar check ao guardrail v5** (meta: guardrail cobre tudo; auditoria só confirma).

---

## 12. Referências

| Documento | Uso |
|---|---|
| `EVOLUTION_OPS_RUNBOOK.md` | procedimentos e comandos detalhados |
| `POLITICA_ANTI_RESIDUOS.md` | SLOs de remoção e gates |
| `PLAYBOOK_INCIDENTE.md` | templates e históricos |
| `guardrail/GUARDRAIL_V4_README.md` | checks/envs/deploy do guardrail |
| `higiene/HIGIENE_README.md` | inventário de resíduos e execução com gates |
| `monitors/MONITORS_DEPLOY_ORDER.md` | validação dos monitores 195/229 |
| `docs/HMAC_ROTATION_PLAN.md` | estado da rotação de segredos |
| `docs/EVOLUTION-ANALISE-100-ETAPAS.md` | plano geral das 100 etapas |
