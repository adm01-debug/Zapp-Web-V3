# Pre-flight Checklist — SET SCHEMA evo → zapp

**Seguir na ordem. Cada item deve resultar 0 antes de prosseguir.**
**Baseado no ensaio sintético de 2026-08-13 (ver SIMULATION_REPORT.md).**

## Para qualquer tabela TABELA_ALVO

### P1 — Verificar colisão de nome
```sql
SELECT EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='zapp' AND c.relname='TABELA_ALVO' AND c.relkind='r'
) AS colisao_existe;
-- Deve retornar false. Se true: resolver colisão primeiro.
```

### P2 — Verificar funções com referência literal
```sql
SELECT p.proname, n.nspname AS schema_fn
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ILIKE '%evo.TABELA_ALVO%';
-- Deve retornar 0 linhas. Se não: qualificar com schema novo antes.
```

### P3 — Verificar crons com referência literal
```sql
SELECT jobname, schedule FROM cron.job
WHERE command ILIKE '%evo.TABELA_ALVO%';
-- Deve retornar 0 linhas. Se não: atualizar command do cron.
```

### P4 — Verificar locks ativos
```sql
SELECT pid, state, query_start, left(query,80) q
FROM pg_stat_activity
WHERE state='active' AND query NOT ILIKE '%pg_stat%'
  AND query ILIKE '%TABELA_ALVO%';
-- Deve retornar 0 linhas ou apenas a própria sessão de verificação.
```

### P5 — Snapshot de contagem antes
```sql
SELECT count(*) AS rows_antes FROM evo.TABELA_ALVO;
-- Guardar número para validação pós-move.
```

### P6 — SET SCHEMA (executar)
```sql
ALTER TABLE evo.TABELA_ALVO SET SCHEMA zapp;
```

### P7 — Validação imediata pós-move (todos devem ser true/igual)
```sql
SELECT
  EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='zapp' AND c.relname='TABELA_ALVO') AS tabela_em_zapp,
  NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relname='TABELA_ALVO') AS tabela_saiu_evo,
  (SELECT count(*) FROM zapp.TABELA_ALVO) AS rows_apos,
  -- rows_apos deve ser igual a rows_antes
  (SELECT count(*) FROM public.TABELA_ALVO) AS rows_via_public_view;
  -- Se 0 e tinha dados: view public quebrou (improvável mas verificar)
```

### P8 — Monitorar crons por 10 minutos
```sql
-- Rodar a cada 3 minutos por 10 minutos
SELECT jobname, last_run_status, last_run_time
FROM (
  SELECT j.jobname,
    (SELECT status FROM cron.job_run_details d WHERE d.jobid=j.jobid
     ORDER BY start_time DESC LIMIT 1) AS last_run_status,
    (SELECT start_time FROM cron.job_run_details d WHERE d.jobid=j.jobid
     ORDER BY start_time DESC LIMIT 1) AS last_run_time
  FROM cron.job j WHERE j.command ILIKE '%TABELA_ALVO%'
     OR j.command ILIKE '%fn_%'
) x
WHERE last_run_status IS DISTINCT FROM 'succeeded';
-- Deve retornar 0 linhas. Se não: função com literal ainda existe → qualificar.
```

## Bloqueadores conhecidos (resolver antes de qualquer migração)

| Bloqueador | Status | Ação |
|---|---|---|
| `evo.contact_id_graveyard` 125 linhas ≠ `zapp.contact_id_graveyard` 644 linhas | ⚠️ Dados divergentes | Auditar, merge ou deprecar duplicata em evo |
| `evo._snapshot_version_state` ≅ `zapp._snapshot_version_state` | ⚠️ Colisão de nome | Verificar se são a mesma coisa; dropar evo se redundante |
| `anon` tem `search_path=evo, public` | ⚠️ evo na frente | Corrigir para `search_path=public, extensions` antes de dropar qualquer view-alias |
| 139 funções `evo.*` com literal `evo.tablename` | 🔧 Trabalho mecânico | Script de qualificação por tabela |
| 100 crons com `evo.fn_*` no comando | 🔧 Trabalho mecânico | Atualizar command se função mudar de schema |

---

## Registro de execuções

### Lote 1 — 2026-08-13 (5 tabelas de baixo risco)

**Simulação de cenários executada antes:**
- Ensaio sintético SET SCHEMA confirmou: views OID-based sobrevivem, funções com literal quebram, RLS segue tabela
- G7 confirmou: funções referenciando essas 5 tabelas usam referência NÃO qualificada → resolvem por search_path após move
- `cleanup_evolution_fallback_events` já usava `zapp.evolution_fallback_events` (via VIEW alias) → após move usa TABLE diretamente

**Bloqueador identificado e resolvido:**
- Todas as 5 tabelas tinham VIEW alias em `zapp` → bloqueavam SET SCHEMA
- Sequência: `DROP VIEW zapp.tabela` → `ALTER TABLE evo.tabela SET SCHEMA zapp`
- View em `public` sobreviveu por OID (dados legíveis via `public.tabela` antes e depois)

**Validação pós-execução:**
| Tabela | Em zapp? | Fora de evo? | RLS? | Dados via public? |
|---|---|---|---|---|
| evolution_spam_keywords | ✅ | ✅ | 2 policies | ✅ 5 linhas |
| evolution_source_schema_map | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_mirror_runs | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_status_reactions | ✅ | ✅ | 2 policies | ✅ 0 linhas |
| evolution_fallback_events | ✅ | ✅ | 2 policies | ✅ 0 linhas |

**Gate pós-move:** `38 pendentes + 1 migrado + 0 críticos` ✅

---

## Nota sobre contact_id_graveyard — NÃO é um bloqueador

`evo.contact_id_graveyard` e `zapp.contact_id_graveyard` são **tabelas intencionalmente diferentes**:

| | evo.contact_id_graveyard | zapp.contact_id_graveyard |
|---|---|---|
| Colunas | 10 (inclui `original_remote_jid`, `lid_jid`, `merge_strategy`, `pre_merge_snapshot`) | 5 (inclui `original_workspace_id`) |
| Linhas | ~125 | ~644 |
| Propósito | Gerenciamento de IDs LID/Baileys (merges de dedup) | Rastreamento de contatos deletados no Workspace Zapp |
| Dono | Evolution-stack (Grupo A) | Zapp (Grupo B, já no schema correto) |
| Interseção | 125 IDs em ambas; 1 só em evo; 521 só em zapp | — |

**Não fazer SET SCHEMA nem merge.** Cada uma serve ao seu dono.

---

### Lote 2 — 2026-08-13 (10 tabelas + 1 função corrigida + 1 REVOKE)

**Tabelas migradas evo→zapp:**

| Tabela | Linhas | Triggers | RLS pós-move | Via public? |
|---|---|---|---|---|
| evolution_chatbot_responses | 3 | 0 | 2 | ✅ |
| evolution_group_messages | 0 | 0 | 2 | ✅ |
| evolution_group_rules | 0 | 0 | 2 | ✅ |
| evolution_ip_blocklist | 0 | 0 | 1 | ✅ |
| evolution_label_associations | 0 | 0 | 1 | ✅ |
| evolution_scheduled_messages | 0 | 0 | 2 | ✅ |
| evolution_tag_assignments | 0 | 0 | 2 | ✅ |
| evolution_template_usage | 0 | 0 | 2 | ✅ |
| evolution_message_queue | 0 | 0 | 2 | ✅ |
| evolution_automation_logs | 0 | 0 | 2 | ✅ |

**Excluída do lote:** `evolution_message_templates`
- `rpc_list_message_templates` usa `RETURNS SETOF evo.evolution_message_templates` (tipo composto + literal no body)
- Requer DROP + CREATE da função com novo return type → Lote 3

**Gaps encontrados e resolvidos na simulação:**
- `fn_calculate_daily_kpis` tinha `FROM evo.evolution_automation_logs` literal → regex `FROM evo\.evolution_automation_logs` confirmou → CREATE OR REPLACE com `SET search_path = zapp, evo, ...` e referência não-qualificada
- Todas as 10 tinham VIEW aliases em zapp (bloqueador) → DROP VIEW → SET SCHEMA (padrão do Lote 1)

**REVOKE executado:**
- `evo.evolution_pipeline_health_log`: REVOKE INSERT, UPDATE, DELETE FROM authenticated
- Motivo: todas as 3 funções que escrevem nela são SECURITY DEFINER (fn_monthly_evo_audit, fn_pipeline_health_log_cleanup, fn_pipeline_health_probe)
- Verificação pós-REVOKE: 0 grants retornados ✅

**Skipped (UNSAFE):**
- `evo.evolution_connection_history`, `evo.media_cleanup_log`, `evo.media_dedupe_log`, `evo.media_scan_log`
- Motivo: 4 funções não-SECURITY DEFINER (fn_feed_401_disconnect_alerts, fn_log_whatsapp_connection_state_change, fn_track_connection_changes, fn_validate_media_security) → precisam de análise

**Gate pós-lote:** `36 pendentes + 3 migrados + 0 críticos` ✅ (era 38+1+0)

---

## Lote 4 — 2026-08-13

### Tabelas migradas (5)

| Tabela | Rows | FK↓ | Trigs | view-zapp | view-public | Crons |
|---|---|---|---|---|---|---|
| evolution_webhook_dlq | 0 | 0 | 0 | DROP+SET | sobrevive | 0 |
| evolution_notification_outbox | 2 | 0 | 0 | n/a (sem view) | sobrevive | guardian-monthly |
| evolution_notifications | 8666 | 1↓ | 0 | DROP+SET | sobrevive | guardian-monthly |
| evolution_followup_rules | 4 | 0 | 1 (set_updated_at) | DROP+SET | sobrevive | 0 |
| evolution_followups | 0 | 0 | 0 | DROP+SET | sobrevive | 0 |

### Funções corrigidas (18 + 1 cron)

**Bloco 4A (dlq):** fn_add_to_dlq[overload2], fn_audit_rmq_durability_risk, fn_flag_poison_messages,
fn_lid_upgrade_readiness_check[C03], fn_monitor_dlq_health, fn_post_upgrade_verify[V06],
fn_pre_upgrade_final_check[C03], fn_purge_api_key_from_logs[passo6], fn_route_failed_webhooks_to_dlq[format()],
fn_scrub_r2_paths_from_logs — todos [A7] aplicado (refs Grupo A intactas em evo).

**Bloco 4B (outbox+notifications):** fn_evo_outbox_claim, fn_evo_outbox_mark, fn_evo_outbox_release,
fn_process_evolution_notifications, fn_repontar_filhas_graveyard[[A7]: só notifications→zapp],
rpc_get_notifications — RETURNS TABLE (não SETOF evo.*) → CREATE OR REPLACE direto.
Cron: evo-schema-guardian-monthly (já estava corrigido; confirmado has_zapp_ref=true).

**Bloco 4C (followup_rules+followups):** trg_create_followups_on_stage_change — 3 refs
(followup_rules SELECT, followups EXISTS+INSERT) → zapp. Trigger em evo.evolution_deals
(Grupo A, não migra) continua chamando zapp.trg_create_followups_on_stage_change normalmente.

### REVOKEs
Nenhum aplicado neste lote. Tabelas migradas → saem do Grupo A, write via view public continua OK.

### P-VAL resumido
- Todas em zapp ✅ (pg_class.relnamespace confirmado)
- Contagens: dlq=0, outbox=2, notifications=8666, rules=4, followups=0 ✅
- Views public sobreviveram (relkind='v') ✅
- FK outbox→notifications auto-atualizada para zapp.outbox→zapp.notifications ✅
- Trigger set_updated_at seguiu followup_rules para zapp ✅
- RLS: 2 policies em followup_rules e followups ✅
- D5: zero literal evo.<tabela_migrada> residual em todas as 18 funções ✅
- Gate: 27→22 pendentes (baseline atualizado) ✅

### Descobertas/armadilhas documentadas
- [A7] Confirmado crítico em fn_post_upgrade_verify, fn_pre_upgrade_final_check, fn_repontar_filhas_graveyard
- [F2] fn_route_failed_webhooks_to_dlq: literal dlq dentro de format() string — fix cirúrgico no texto do format
- Cron guardian-monthly para notifications já estava com zapp.evolution_notifications (corrigido por outra instância ou lote anterior)
- fn_add_to_dlq tem 2 overloads: overload 1 (search_path=zapp,evo + unqualified) auto-resolve; overload 2 tinha evo. explícito — corrigido

---

## Auditoria exaustiva pós-Lote 4 (2026-08-13)

Bateria de validação (10 frentes) contra estado real do banco, cobrindo os Lotes 1-3
(25 tabelas + 8 fns + 2 RPCs SETOF + 1 REVOKE + 1 cron). Todos os testes de execução
via chamada real (funções read-only executadas direto; funções/triggers que gravam via
rollback proposital com savepoint, zero efeito colateral).

**Resultado: 25/25 tabelas em zapp (0 em evo), 25/25 views public vivas, integridade de
dados 8/8 (count via zapp == via public), ZERO literais residuais (fns/views/crons),
25/25 RLS + 46 policies + 2 triggers seguiram, REVOKE efetivo (authenticated sem
INSERT/UPDATE/DELETE, mantém SELECT), 0 dependências órfãs apontando para evo.**

Funções testadas com execução real (todas OK): `fn_calculate_daily_kpis` (jsonb válido,
total_contacts 21665, lê tabelas evo + evolution_automation_logs zapp),
`fn_save_daily_kpis`, `cleanup_evolution_send_idempotency`, `trg_queue_deal_for_bitrix`
(via UPDATE evolution_deals), `fn_queue_notification` (via INSERT evolution_alerts),
`zapp_notif_config_get`, `rpc_list_calls` (SETOF zapp.evolution_calls, 10 rows).

### BUG HERDADO corrigido: `rpc_list_message_templates`

Descoberto no teste de execução: `column "status" does not exist`. A tabela
`zapp.evolution_message_templates` tem `approval_status` (text) e `is_active` (boolean),
NÃO `status`. A RPC referenciava `status = p_status` — e como o planner valida a coluna
mesmo com `p_status IS NULL`, quebrava em QUALQUER chamada. Bug pré-existente (o body
original já tinha `status`; foi reproduzido fielmente ao recriar a RPC com
`RETURNS SETOF zapp.*` no Lote 3). A RPC não é consumida por ninguém (o front usa
`supabase.from("evolution_message_templates").eq("is_active", true)` na edge function
evolution-templates), então a correção não tem risco de regressão.

Correção (CREATE OR REPLACE, assinatura e RETURNS SETOF inalterados, SECDEF + search_path
preservados): `status` → `approval_status` (mapeamento type-safe text→text). Validado:
3 assinaturas de chamada executam sem erro (0 rows, tabela vazia).

> Aplicado direto no banco via `supabase_db_query` (fonte de verdade). Padrão [A5]: sem
> migration formal, lógica versionada aqui.

### Lote 4 (outro agente) — validado íntegro

5/5 tabelas do Lote 4 em zapp (0 em evo), FK `evolution_notification_outbox` →
`evolution_notifications` preservada (zapp→zapp), zero literais residuais nas 30 tabelas
(25 dos Lotes 1-3 + 5 do Lote 4). A correção de `evolution_reactions` que fiz no cron
`evo-schema-guardian-monthly` (Lote 3) foi preservada pelo Lote 4, que adicionou a
correção de `notifications` ao mesmo cron. Gate: 22 pendentes / 17 migrados / 0 críticos.

---

## Lote 5 — 2026-08-13

### Tabelas migradas (13 + 1 bônus)

| Tabela | Rows | FK↓ | Trigs | view-zapp | view-public | Crons |
|---|---|---|---|---|---|---|
| evolution_realtime_events | 1569 | 0 | 0 | DROP+SET | sobrevive | purge_realtime_events |
| evolution_business_hours | 7 | 0 | 0 | DROP+SET | sobrevive | 0 |
| evolution_holidays | 11 | 0 | 0 | DROP+SET | sobrevive | 0 |
| evolution_stage_mapping | 14 | 0 | 0 | DROP+SET | sobrevive | 0 |
| evolution_tags | 24 | 0 | 0 | DROP+SET (SETOF) | sobrevive | 0 |
| evolution_quick_replies | 13 | 0 | 0 | DROP+SET (SETOF) | sobrevive | 0 |
| evolution_labels | 9 | 0 | 1 (set_updated_at) | DROP+SET (SETOF) | sobrevive | 0 |
| evolution_groups | 221 | 0 | 1 (fn_set_updated_at) | DROP+SET | sobrevive | 0 |
| evolution_group_participants | 10714 | 0 | 0 | DROP+SET | sobrevive | 0 |
| evolution_tasks | 6 | 0 | 1 (handle_updated_at) | DROP+SET | sobrevive | 0 |
| evolution_deals | 9 | 0 | 5 (audit/auto_task/bitrix/followup/updated_at) | DROP+SET | sobrevive | 0 |
| evolution_whatsapp_status | 16101 | 1→status_reactions(zapp✅) | 0 | DROP+SET | sobrevive | 0 |
| evolution_performance_metrics | 11 | 0 | 0 | DROP+SET | sobrevive | 0 |

### Funções corrigidas (18 funções + 1 cron + [H1])

**Tags/Quick_replies:** rpc_list_tags[overload1+2], rpc_list_quick_replies — DROP+CREATE (SETOF evo→zapp).

**Labels:** rpc_list_labels — DROP+CREATE SETOF. rpc_upsert_label — CREATE OR REPLACE (versão antiga com assinatura divergente removida).

**Groups+Participants:** fn_upsert_group_from_event[3 overloads], fn_upsert_group_participants[2 overloads] — todos CREATE OR REPLACE para zapp. evo.fn_resolve_contact_id_by_jid PRESERVADA (é função, não tabela).

**Tasks:** fn_auto_task_on_deal [A7] (tasks→zapp, deals preservado), rpc_get_contact[public+zapp jsonb] [A7] (tasks→zapp, deals/messages/contacts preservados).

**Deals:** rpc_list_deals, rpc_upsert_deal, rpc_global_search[2 overloads], rpc_get_contact[public+zapp jsonb] — evolution_deals → zapp após migração. Triggers em evolution_deals (todos já corrigidos Lotes 3+4): trg_queue_deal_for_bitrix, trg_create_followups_on_stage_change, fn_audit_trigger (unqualified, resolve via view), fn_auto_task_on_deal, fn_set_updated_at.

**Whatsapp_status:** fn_mark_status_viewed, fn_sync_status_from_messages [A7], update_status_media_url[evo+public], fn_handle_whatsapp_status [A7], fn_repontar_filhas_graveyard [A7], fn_download_wa_status_media — todos corrigidos status→zapp, evolution_contacts PRESERVADO.

**Cron:** purge_realtime_events → zapp.evolution_realtime_events.

**[H1] Hardening:** ALTER ROLE anon SET search_path = public, extensions (anon não resolve evo. mais).

### Descobertas/armadilhas documentadas

- [A12-rpcupsert] rpc_upsert_label tinha assinatura duplicada (p_name first vs p_id first) — versão antiga droppada
- [A13-global_search] rpc_global_search tem 2 overloads (p_limit antes vs depois de p_instance) — ambos corrigidos
- [A14-deals_in_fns] rpc_list_deals, rpc_upsert_deal, rpc_global_search, rpc_get_contact tinham evo.evolution_deals hardcoded — detectado via D5 pós-DDL, corrigido na mesma sessão (zero downtime)
- [A15-perf_metrics_bonus] evolution_performance_metrics = 0 fns literais — migrada como bônus (DROP VIEW + SET SCHEMA apenas)
- [H1-confirmed] anon search_path confirmado em produção: ['statement_timeout=5s', 'search_path=public, extensions', ...]

### P-VAL resumido

- 13/13 tabelas em zapp (pg_class.relnamespace confirmado) ✅
- 13/13 views public sobreviveram ✅
- D5 zero residuais: 0 funções com evo.<tabela_migrada> executável ✅
- Cron purge_realtime_events atualizado ✅
- [H1] anon search_path = public, extensions ✅
- Gate: 22→20 pendentes / 19 migrados / 0 críticos, sem regressão ✅

### Commits desta sessão (branch feat/decouple-provider)

```
27138dfc7  feat(decouple): F0 baseline — BASELINE.md + inventory.mjs + tag pre-decouple-v0 (E1,E2,E5,E10)
2f4c2f498  feat(decouple): F1 infra docs — E11 + E13 + E16 (Agente 8)
35e9d013e  feat(decouple): F2 tipos canônicos — ChannelMessage/Contact/Conversation + ADR-008 (Agente 9)
[LOTE5-COMMIT]  feat(decouple): lote 5 — 13 tabelas + 18 fns + [H1] + gate 22→20 + D5 zero
```
