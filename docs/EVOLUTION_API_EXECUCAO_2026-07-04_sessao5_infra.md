> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# ⚡ Sessão 5 (trilha INFRA/DB) — Execução das melhorias (FMEA + 11 workstreams) — 2026-07-04

> **Nota:** esta é a trilha **infraestrutura/banco** da sessão 5 (GlitchTip, retenção do
> `_analytics`, drift dos backups, secrets, registry, ghost alert). A trilha **código/edge-functions**
> (resolver nome↔UUID, health-check v2, testes) roda em paralelo e está em
> [`EVOLUTION_API_EXECUCAO_2026-07-04_sessao5.md`](./EVOLUTION_API_EXECUCAO_2026-07-04_sessao5.md).
> As duas foram executadas por sessões concorrentes e se complementam.

> **Data:** 2026-07-04 (~10:15–12:00 UTC)
> **Mandato:** executar TODAS as melhorias pendentes das auditorias, uma a uma, com excelência,
> precedidas de simulação de centenas de cenários de falha (FMEA), rumo a 10/10.
> **Método:** FMEA primeiro ([`EVOLUTION_API_FMEA_2026-07-04.md`](./EVOLUTION_API_FMEA_2026-07-04.md),
> ~90 cenários em 9 workstreams + invariantes globais), depois cada mudança executada e
> **validada ao vivo** via MCP (Portainer, Evolution API, Supabase self-hosted) e `psql`/exec
> nos containers. Snapshots dos stack files versionados em [`infra/stacks/`](../infra/stacks/).
> **Relatórios:** [`sessao5 (auditoria)`](./EVOLUTION_API_AUDIT_2026-07-04_sessao5.md) ·
> [`sessao4`](./EVOLUTION_API_AUDIT_2026-07-04_sessao4.md)

---

## 0. Scorecard final

| # | Workstream | Resultado | Validação |
|---|---|---|---|
| 1 | **GlitchTip 500 (S4-3)** | ✅ **RESOLVIDO** | Faltava Redis/Valkey (fila Celery) → toda ingestão dava HTTP 500. Adicionado `glitchtip-valkey` + `REDIS_URL`. Evento sintético → **HTTP 200** e persistido (`issue_events_issue` id 180). Órfão `glitchtip-web` (9h) removido. |
| 2 | **Quick wins Evolution** | ✅ **FEITO** | Settings de negócio aplicados na instância da linha principal (`rejectCall=true`+msgCall, `syncFullHistory=false`); `wpp_pink_test` com `syncFullHistory=false` (reduz churn de reconexão). Ambas seguem `open`. |
| 3 | **registry stale (S5-2)** | ✅ **RESOLVIDO** | `zapp.fn_sync_instance_registry_status()` espelha `status` de `public.whatsapp_connections` (fonte do reconcile) + marca não-provisionadas como `not_provisioned`; cron `2-59/5 * * * *` (jobid 96). wpp2/pink agora refletem estado real. |
| 4 | **ghost events (S5-3)** | ✅ **RESOLVIDO** | Instâncias QA (`qa`,`qa_final`,`qa_sim_claude`,`q`,`instancia_fantasma_v2_claude`) registradas como `status='test'` (5 linhas). Nova `zapp.fn_alert_ghost_message_events()` + cron 5min (jobid 97): alerta **imediato** (severidade critical em `evo.evolution_alerts`) quando `messages.upsert` de instância fora do registry é rejeitado — pega vazamento de baixa frequência que o KPI de volume (>20/h) deixava passar (foi assim que o S5-1 passou despercebido). |
| 5 | **forense S5-4** | ✅ **CONCLUÍDO** (read-only) | Persistência nativa da wpp2 no PG14 para em `2026-05-07 14:01` (última semana com dados: 04/05, 16.275 msgs). Não é bug do pipeline: o espelho Supabase seguiu recebendo (wpp2 teve 3.954 msgs no dia 03/07 no espelho). Causa provável: retenção/carga histórica no nativo; **o espelho `evo.*` é a fonte de verdade do zapp**. Registrado para reconferir após o re-pareamento correto. |
| 6 | **_analytics/Logflare 35 GB (S4-4)** | ✅ **RESOLVIDO — ~34,3 GB recuperados** | Banco `_supabase` **35 GB → 709 MB**. Rewrite-swap com janela de 14 dias nas 2 maiores tabelas (`cloudflare.logs.prod` 30 GB→350 MB; `deno-relay-logs` 5,3 GB→79 MB). Retenção permanente: `ops.fn_analytics_log_retention(14)` + cron diário 05:20 (jobid 100). Disco do host **76% → 58%**. |
| 7 | **hardcoded supabase-db-mcp (N5)** | ✅ **RESOLVIDO** | `DATABASE_URL` em texto puro → Docker secret `supabase_db_url_v1` + wrapper. Healthcheck corrigido (`127.0.0.1`, o Node escuta só IPv4). MCP `healthy`, HTTPS público 200. |
| 8 | **drift backups PG14 (112/84/85)** | ✅ **RESOLVIDO** | Os 3 stacks apontavam para MinIO no arquivo mas rodavam contra R2 no runtime (redeploy pela UI reverteria os backups). Endpoint/bucket/prefix R2 **fixados no stack file** + credenciais via Docker secrets (`r2_backup_*`, `pg14_backup_pg_password_v1`, `backup_passphrase_dw_v1`/`_monthly_v1`). **Backup real validado no R2** para daily e weekly (PID 1 com as 4 credenciais). Exporter obsoleto `source-backfill-exporter` removido. |
| 9 | **minio-offsite-mirror (89)** | ✅ **APOSENTADO** | Nunca ativado (STANDBY, `PENDING_PINK_TO_CREATE`), `network_mode` apontando para container MinIO inexistente, redundante (backups já vão direto ao R2). Stack deletado; snapshot em `infra/stacks/_RETIRED_*`. |
| 10 | **Rotação de senha (§1 sessão 4)** | 🟠 **PARCIAL — runbook pronto, ALTER deferido** | Ver §1. Uma das 2 cópias em texto puro eliminada (mcp, item 7). A 2ª (`rest`/authenticator) e a rotação do **valor** exigem janela supervisionada — ver §1. |
| 11 | **FMEA** | ✅ | ~90 cenários, invariantes globais, critérios de abort — guiou toda a execução. |

**Nenhuma indisponibilidade não-planejada.** Único blip: ~10s no PostgREST quando o stack
`supabase` foi atualizado (11:40 UTC, sábado) — o `db` reiniciou uma vez e voltou `healthy` em
~30s; todos os 13 containers do Supabase `Up`, `rest` 200. A linha WhatsApp principal e a
`wpp_pink_test` permaneceram `open` o tempo todo (invariante G1 respeitado).

---

## 1. Rotação de senha do Postgres — por que o ALTER foi deferido (e runbook completo)

**Objetivo:** invalidar a senha compartilhada `482704…` que esteve exposta em texto puro em
stack files. **Executado nesta sessão:** eliminada a cópia hardcoded do `supabase-db-mcp` (item 7).
**Deferido para janela supervisionada:** o ALTER do valor + a última cópia hardcoded (`rest`).

### Descobertas desta sessão que MUDARAM o runbook da sessão 4

1. 🔴 **A senha é compartilhada por 9 roles, não 6.** Além de `postgres`, `supabase_admin`,
   `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_functions_admin`,
   também **`metabase_user`, `supabase_read_only_user` e `supabase_replication_admin`** usam o
   mesmo valor (confirmado testando login role a role). A sessão 4 assumiu que o Metabase tinha
   senha própria — **não tem**. Só `pgbouncer` tem senha independente.
2. 🔴 **`rest` (PostgREST) não pôde migrar para secret via wrapper:** a imagem
   `postgrest/postgrest:v14.8` **não tem `/bin/sh`** → o `docker service update` com entrypoint
   `sh -c` fez **rollback automático** (produção intacta — a proteção funcionou). Precisa de
   abordagem sem shell (init sidecar que escreve um arquivo de config, ou apontar o `rest` para
   o supavisor).
3. 🔴 **Um redeploy do stack `supabase` reinicia o serviço `db`.** Observado ao vivo: atualizar
   o stack 35 bounceou `db`/`functions`/`studio` (~30s). Logo, a rotação **não é zero-downtime**
   pela via de redeploy — exige janela.

### Runbook definitivo (executar em janela supervisionada, ~20 min)

**Roles a rotacionar (9):** `postgres`, `supabase_admin`, `authenticator`, `supabase_auth_admin`,
`supabase_storage_admin`, `supabase_functions_admin`, `metabase_user`, `supabase_read_only_user`,
`supabase_replication_admin`.

**Consumidores (todos mapeados/verificados nesta sessão):**

| Consumidor | Como recebe a senha | Ação |
|---|---|---|
| Stack `supabase` (35): studio, kong(n/a), auth, realtime, storage, meta, functions, analytics, supavisor, db | secret `supabase_db_password_v1` | criar `supabase_db_password_v2`, trocar refs (montar em `target: supabase_db_password_v1` p/ os wrappers não mudarem) |
| Stack `supabase` (35): `rest` | 🔴 **hardcoded** (authenticator) | migrar p/ secret via init sem shell (a imagem não tem `/bin/sh`) **no mesmo redeploy** |
| Stack `supabase-backup` (124) | secret `_v1` | trocar ref → `_v2` |
| Stack `supabase-db-mcp` (128) | secret `supabase_db_url_v1` | criar `supabase_db_url_v2` (nova senha embutida) + trocar ref |
| Stack `zapp-health-guard` (165) | secret `_v1` | trocar ref → `_v2` |
| **Metabase** | 🔴 `metabase_user` (senha compartilhada) — datasource cifrado com `MB_ENCRYPTION_SECRET_KEY` | atualizar o datasource pela **UI/API do Metabase** (não editável direto no DB) |
| **n8n** | credencial Postgres interna (cifrada com a enc key do n8n) | atualizar via **UI/API do n8n** |

**Sequência (conexões existentes sobrevivem ao ALTER; janela ~10 min):**
1. Gerar nova senha **dentro do host** (`openssl rand -base64 24`), nunca imprimir.
2. Criar secrets `supabase_db_password_v2` e `supabase_db_url_v2`.
3. Preparar TODOS os stack files com refs `_v2` (incluindo `rest` sem shell) — sem deployar ainda.
4. `ALTER ROLE … PASSWORD '…'` nos 9 roles em sequência imediata (via `psql` **peer** no container
   `supabase_db` — imune à senha; é como esta sessão operou).
5. Deploy imediato: stack 35 → 124 → 128 → 165.
6. Atualizar Metabase (datasource) e n8n (credencial) pela UI/API de cada um.
7. Validar: 13 containers Supabase `healthy`; PostgREST 200; `pg_stat_activity` sem falhas de
   login; Edge Functions respondendo; 1 workflow n8n de teste; 1 dashboard Metabase.
8. **Rollback:** `ALTER ROLE … PASSWORD` de volta ao valor antigo (guardado em `_v1`) + redeploy
   com refs `_v1`. Totalmente reversível.

> **Por que não executei o ALTER autonomamente:** é uma operação outward-facing e não-trivialmente
> reversível para sistemas externos (Metabase e n8n guardam a senha cifrada com chaves próprias;
> um ALTER sem atualizá-los em lock-step quebra dashboards/automações silenciosamente), e o
> redeploy do stack reinicia o `db` de produção. Isso é exatamente o tipo de mudança que pede
> janela supervisionada. A descoberta de que Metabase/read_only/replication também compartilham a
> senha é material e posterior à instrução — o certo é entregar o runbook preciso, não um ALTER
> às cegas numa base de produção de um negócio ao vivo.

---

## 2. Objetos criados nesta sessão (versionados no repo)

**SQL** (`db/`):
- `2026-07-04_s5-2_sync_instance_registry_status.sql` — `zapp.fn_sync_instance_registry_status()` + cron 96
- `2026-07-04_s4-4_analytics_retention.sql` — `ops.fn_analytics_log_retention(14)` + cron 100
- (`zapp.fn_alert_ghost_message_events()` + cron 97 — incluído no relatório; SQL idempotente)

**Stack files** (`infra/stacks/`): `glitchtip.yml`, `supabase-db-mcp.yml`,
`postgres-backup-{daily,weekly,monthly}.yml`, `_RETIRED_minio-offsite-mirror.yml` + `README.md`.

**Docker secrets criados** (valores nunca impressos): `supabase_db_url_v1`,
`pg14_backup_pg_password_v1`, `backup_passphrase_dw_v1`, `backup_passphrase_monthly_v1`
(+ `r2_backup_access_key_v1`/`r2_backup_secret_key_v1` já existiam).

**pg_cron novos:** 96 (sync registry, 5min), 97 (ghost alert, 5min), 100 (analytics retention, diário 05:20).

---

## 3. Nota final — rumo ao 10/10

| Dimensão | Sessão 4 | Sessão 5 | O que falta para 10 |
|---|---|---|---|
| Versão/atualização | 10/10 | **10/10** | — (v2.3.7, última estável) |
| Instalação/config Evolution | 10/10 | **10/10** | — |
| Banco (schema/manutenção/perf) | 10/10 | **10/10** | — (+ retenção `_analytics`, registry sync, ghost alert) |
| **Backups/DR** | 9/10 | **10/10** ⬆ | — (drift dos 3 stacks PG14 eliminado + validado no R2) |
| **Observabilidade** | 8–9/10 | **10/10** ⬆ | — (GlitchTip consertado + alerta de fantasma imediato) |
| **Capacidade/disco** | — | **10/10** ⬆ | — (34 GB recuperados; host 76%→58%) |
| **Segurança de credenciais** | 7/10 | **8,5/10** ⬆ | ALTER dos 9 roles + `rest` sem shell + Metabase/n8n em janela supervisionada (§1) |
| Linha principal WhatsApp | 🔴 degradada | 🟠 **mitigada** | Re-parear na instância `wpp2` correta e apagar a fantasma (runbook S5-1) — precisa do telefone |

**10 de 11 workstreams concluídos e validados ao vivo.** Os 2 itens que restam para o 10/10 pleno
dependem de fatores fora do meu alcance autônomo e seguro: **(a)** o re-pareamento por QR da `wpp2`
(precisa do aparelho em mãos) e **(b)** o ALTER da senha + Metabase/n8n (janela supervisionada,
runbook pronto acima). Todo o resto — GlitchTip, retenção de 34 GB, drift dos backups, registry,
ghost alert, quick wins — está feito, validado e versionado.
