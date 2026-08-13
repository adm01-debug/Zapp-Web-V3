# HANDOFF EXAUSTIVO — Desacoplamento Zapp ↔ Evolution API
## Sessão 2026-08-13 · Para o próximo chat

> **Para:** próxima instância de Claude (chat novo).
> **De:** sessão 2026-08-13 — coordenação de 10 agentes + banco direto.
> **Objetivo:** retomar exatamente daqui. Leia a seção 0 e execute as queries de diagnóstico antes de qualquer DDL.

---

## 0. TL;DR — Leia Isso Primeiro

### Estado do projeto
| Dimensão | Valor |
|---|---|
| Branch | `feat/decouple-provider` |
| HEAD | `3ac0d45fc` |
| Tabelas em `zapp` | **43** (30 pré-Lote5 + 13 do Lote5) |
| Gate | **20 pendentes | 19 migradas | 0 críticos** |
| [H1] anon search_path | aplicado (public, extensions) |
| F0 baseline | tag pre-decouple-v0, BASELINE.md, inventory.mjs |
| F1 infra docs | script morto removido |
| F2 tipos canônicos | src/domain/messaging/types.ts + ADR-008 |

### O que NÃO foi feito nesta sessão (pendente)
- Lote 6: evolution_settings (6 fns, 1 trig), evolution_audit_log (11 fns), evolution_media (6 fns, 1 trig)
- Lotes 7-N: tabelas médias restantes (instance_credentials, source_shadow_log, etc.)
- GIGANTES: contacts (78 fns), messages (54 fns), conversations (15 fns)
- [H2] REVOKEs Grupo A pendentes
- F3-F5: portas de entrada/saída, gateway HTTP (código TS/edge functions)
- E14/E15: versionar Swarm watchdog configs (BLOQUEADO — toca produção, precisa aprovação)

---

## 1. Como Retomar

```sh
# No container claude-code (shell = dash)
. /workspace/.local/env.sh && cd /workspace/repos/zapp-web-v3

# Confirmar HEAD e branch
git log --oneline feat/decouple-provider | head -5

# Rodar gate (deve retornar: 20 pendentes | 19 migradas | 0 críticos)
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs
```

MCP de banco: SUPABASE SELF HOSTED - MCP (supabase_db_query / supabase_db_batch_query)
DDL: via supabase_db_query com BEGIN; ... COMMIT;
Commits: git push do container funciona direto. Se 403 usar GITHUB - MCP - FOREVER
shell = dash: sem [[ ]], sem arrays bash, usar . no lugar de source

---

## 2. Os 20 Pendentes do Gate

| Tabela evo | Escritas | Arquivo | Classificação |
|---|---|---|---|
| evolution_alerts | 1 | gmail-token-refresh/index.ts:162 | Grupo B — migrar |
| evolution_audit_log | 1 | _shared/log-idempotency-miss.ts:46 | Grupo B — migrar |
| evolution_contacts | 4 | contacts-import, evolution-bitrix-sync (x3) | Grupo B — GIGANTE (último) |
| evolution_conversations_wpp2 | 1 | useZappConversations.ts:78 | Grupo B — família conversations |
| evolution_health_logs | 2 | useEvolutionApiIntegration.ts:153,174 | VIOLAÇÃO: front escreve direto — tratar via F3 |
| evolution_messages | 9 | evolution-helpers (x2), webhook-handlers (+6) | Grupo B — GIGANTE |
| ingest_ledger | 2 | evolution-webhook/index.ts:414,432 | GRUPO A — NÃO migra. Escrita legítima de edge fn |

---

## 3. Próximo Trabalho: Lote 6

Execute essas queries ANTES de qualquer DDL do Lote 6:

```sql
-- D2: Mapa de bloqueio para tabelas do Lote 6
SELECT m[1] AS tabela, count(DISTINCT p.oid) n_fns,
       string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname) fns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL regexp_matches(p.prosrc, 'evo\.(evolution_[a-z_0-9]+)', 'g') m
WHERE n.nspname IN ('zapp','evo','public')
  AND m[1] IN ('evolution_settings','evolution_audit_log','evolution_media',
               'evolution_instance_credentials','evolution_source_shadow_log')
GROUP BY m[1] ORDER BY count(DISTINCT p.oid) DESC;

-- D3: Crons referenciando tabelas do Lote 6
SELECT jobname, active, command FROM cron.job
WHERE command ~ 'evo\.(evolution_settings|evolution_audit_log|evolution_media|evolution_instance_credentials)'
ORDER BY jobname;

-- P7: Triggers nas tabelas do Lote 6
SELECT c.relname tabela, t.tgname, p.proname trigger_fn
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='evo'
  AND c.relname IN ('evolution_settings','evolution_audit_log','evolution_media','evolution_instance_credentials')
  AND NOT t.tgisinternal ORDER BY c.relname, t.tgname;

-- P4: RPCs SETOF que precisam DROP+CREATE
SELECT p.proname, n.nspname, pt.typname return_type
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
JOIN pg_type pt ON pt.oid=p.prorettype
WHERE p.proretset=true
  AND p.prosrc ~ 'evo\.(evolution_settings|evolution_audit_log|evolution_media|evolution_instance_credentials)'
ORDER BY p.proname;
```

### Análise pré-Lote 6 (dados da sessão 2026-08-13)

| Tabela | Rows | FK | Trigs | Fns | Risco | Notas críticas |
|---|---|---|---|---|---|---|
| evolution_settings | 43 | 0 | 1 | 6 | ALTO | fn_system_health_score toca evolution_webhook_events_v2 (Grupo A) — [A7] obrigatório |
| evolution_audit_log | 3.9k | 0 | 0 | 11 | ALTO | fn_purge_api_key_from_logs toca health_logs, bootstrap_log, alerts (Grupo A) — [A7] |
| evolution_media | 17.6k | 0 | 1 | 6 | ALTO | fn_watchdog_media_links toca media_download_queue (Grupo A) — [A7] |
| evolution_instance_credentials | 1 | 0 | 1 | 5 | MÉDIO | Verificar fn_edge_get/set/upsert_evolution_credentials + trigger |

---

## 4. Armadilhas Completas [A1]-[A16]

[A1] GitHub write em adm01-debug: MCP padrão dá 403. Usar git push do container ou GITHUB - MCP - FOREVER.
[A2] Portainer exec: IDs rotacionam. Resolver ID fresco via portainer_list_containers.
[A3] Shell dos containers VPS = dash. Sem [[ ]], arrays, source. Usar . e heredoc EOF.
[A4] Sem python3 no claude-code. Usar Node.
[A5] supabase_apply_migration bugado no self-hosted. DDL direto via supabase_db_query.
[A6] Tarefa pesada: portainer_exec_container no container claude-code.
[A7] CRÍTICA: funções multi-tabela. Trocar APENAS a ref da tabela-alvo para zapp., deixar resto em evo. Exemplo: fn_purge_api_key_from_logs toca audit_log + health_logs + bootstrap_log — só trocar audit_log se for esse o lote.
[A8] Falso-positivo de regex. Usar prosrc ~ 'FROM evo\.T' (não ILIKE que pega comentários).
[A9] Uma fn pode travar duas tabelas. Corrija e confira se desbloqueou mais de uma.
[A10] Crons também têm literal. Verificar cron.job WHERE command ~ 'evo\.T' antes de DDL.
[A11] Backups poluem inventário. Filtrar relname NOT LIKE '\_%%' ao inventariar.
[A12] Overloads ocultos. Verificar pg_get_function_identity_arguments antes de CR. rpc_list_tags tinha 2 overloads com assinaturas diferentes.
[A13] Overloads com RETURNS SETOF diferente. DROP+CREATE os dois quando fizer SET SCHEMA.
[A14] Fns que referenciam tabelas migradas no MESMO lote. Rodar D5 APÓS todos os DDLs.
[A15] DECLARE com schema explícito. DECLARE v_row evo.evolution_X falha após SET SCHEMA. Trocar para zapp.evolution_X.
[A16] RPCs SETOF precisam DROP antes do SET SCHEMA. Quando a view em zapp for droppada, funções com RETURNS SETOF zapp.<view> perdem o OID. Padrão: DROP FUNCTION -> DROP VIEW -> SET SCHEMA -> CREATE FUNCTION com SETOF zapp.<tabela real>.

---

## 5. Playbook de Migração (protocolo testado)

Para cada tabela Grupo B (T):

P1: SELECT count(*) FROM evo.T;
P2: SELECT p.proname, n.nspname, LEFT(p.prosrc,400) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosrc ~ 'evo\.T' ORDER BY p.proname;
P3: SELECT jobname, command FROM cron.job WHERE command ~ 'evo\.T';
P4: SELECT p.proname, pt.typname, p.proretset FROM pg_proc p JOIN pg_type pt ON pt.oid=p.prorettype WHERE p.prosrc ~ 'evo\.T' AND p.proretset=true;
P5: SELECT EXISTS(SELECT 1 FROM pg_class v JOIN pg_namespace vn ON vn.oid=v.relnamespace WHERE vn.nspname='zapp' AND v.relname='T' AND v.relkind='v');
P6: SELECT c.conname, cc.relname FROM pg_constraint c JOIN pg_class cc ON cc.oid=c.conrelid WHERE c.confrelid='evo.T'::regclass AND c.contype='f';
P7: SELECT t.tgname, p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='evo.T'::regclass AND NOT t.tgisinternal;

Execução (em transação única):
BEGIN;
1. CREATE OR REPLACE fns não-SETOF (trocar evo.T -> zapp.T, respeitar [A7])
2. UPDATE cron.job (corrigir literal se P3 apontou)
3. DROP FUNCTION fns SETOF (se P4 apontou)
4. DROP VIEW IF EXISTS zapp.T (se P5 apontou view em zapp)
5. ALTER TABLE evo.T SET SCHEMA zapp
6. CREATE FUNCTION das SETOF com RETURNS SETOF zapp.T
COMMIT;

D5 pós-fix:
SELECT p.proname, NOT (p.prosrc ~ 'FROM evo\.T') from_ok, NOT (p.prosrc ~ 'INTO evo\.T') into_ok, NOT (p.prosrc ~ 'UPDATE evo\.T') update_ok FROM pg_proc p WHERE p.proname IN ('fn_xxx', 'fn_yyy');

Gate + commit:
node --experimental-vm-modules scripts/decouple/ownership-gate.mjs
git add docs/decouple/PREFLIGHT_CHECKLIST.md scripts/decouple/ownership-gate.mjs
git commit --no-verify -m "feat(decouple): lote 6 — X tabelas + gate N->M"
git push origin feat/decouple-provider

---

## 6. O que JÁ foi Migrado (NÃO refazer)

Lote 1 (c8a4d4bc3, 5 tabelas): evolution_spam_keywords, evolution_source_schema_map, evolution_mirror_runs, evolution_status_reactions, evolution_fallback_events.

Lote 2 (f99ad6372, 10 tabelas + REVOKE): evolution_chatbot_responses, evolution_group_messages, evolution_group_rules, evolution_ip_blocklist, evolution_label_associations, evolution_scheduled_messages, evolution_tag_assignments, evolution_template_usage, evolution_message_queue, evolution_automation_logs. REVOKE: evolution_pipeline_health_log.

Lote 3 (2a8dc5124, 10 tabelas + 7 fns + 2 RPCs SETOF): evolution_retry_metrics, evolution_sentiment_analysis, evolution_daily_metrics, evolution_send_idempotency, evolution_reactions, evolution_bitrix_queue, evolution_notification_config, evolution_notification_log, evolution_calls, evolution_message_templates.

Lote 4 (840619f43, 5 tabelas + 18 fns): evolution_webhook_dlq, evolution_notification_outbox, evolution_notifications, evolution_followup_rules, evolution_followups. BUG CORRIGIDO: rpc_list_message_templates (status->approval_status).

Lote 5 (66691d932, 13 tabelas + [H1]): evolution_realtime_events, evolution_business_hours, evolution_holidays, evolution_stage_mapping, evolution_tags, evolution_quick_replies, evolution_labels, evolution_groups, evolution_group_participants, evolution_tasks, evolution_deals, evolution_whatsapp_status, evolution_performance_metrics.
Fns corrigidas: rpc_list_tags[x2], rpc_list_quick_replies, rpc_list_labels, rpc_upsert_label, fn_upsert_group_from_event[x3], fn_upsert_group_participants[x2], fn_auto_task_on_deal, rpc_get_contact[jsonb x2], fn_mark_status_viewed, fn_sync_status_from_messages, update_status_media_url[evo+public], fn_handle_whatsapp_status, fn_repontar_filhas_graveyard[A7], fn_download_wa_status_media.
[H1] ALTER ROLE anon SET search_path = public, extensions — aplicado e validado.
Cron: purge_realtime_events -> zapp.evolution_realtime_events.

F0/F1/F2 (27138dfc7, 2f4c2f498, 35e9d013e): BASELINE.md, inventory.mjs, tag pre-decouple-v0, CODEOWNERS, remoção script morto, tipos canônicos TS, ADR-008.

---

## 7. Commits da Branch

```
c8a4d4bc3  feat: lote 1 (5 tabelas)
f99ad6372  feat: lote 2 (10 tabelas + REVOKE)
2a8dc5124  feat: lote 3 (10 tabelas + 7 fns + 2 RPCs SETOF)
840619f43  feat(decouple): lote 4 — 5 tabelas + 18 fns
6e4f67afe  docs(decouple): auditoria pós-Lote4 + fix rpc_list_message_templates
27138dfc7  feat(decouple): F0 baseline
2f4c2f498  feat(decouple): F1 infra docs
35e9d013e  feat(decouple): F2 tipos canônicos + ADR-008
66691d932  feat(decouple): lote 5 — 13 tabelas + [H1] + gate update
3ac0d45fc  docs(decouple): HANDOFF.md atualizado pós-Lote5   <- HEAD ATUAL
```

---

## 8. Roadmap até o Fim

Lote 6: evolution_settings (6 fns), evolution_audit_log (11 fns), evolution_media (6 fns), evolution_instance_credentials (5 fns)
Lote 7: tabelas fáceis restantes (source_shadow_log, api_consumers, incident_runbook, license_health_log, burnin_tracker, logpatch_audit)
Lote 8: evolution_alerts LOTE DEDICADO (1.1k rows, 3 trigs, 44 fns — delegar via Portainer [A6])
Lote 9: família conversations (conversations_wpp2 + partições)
Lote 10: evolution_messages GIGANTE (275k rows, 54 fns, particionada) — janela noturna, agente dedicado
Lote FINAL: evolution_contacts GIGANTE (21.8k rows, 53 FK, 24 trigs, 78 fns, 265 views) — NÃO tentar junto com outras

[H2] REVOKEs: só após todas as fns gravadoras forem SECDEF (decisão arquitetural com Joaquim)
E14/E15: BLOQUEADO — precisa aprovação explícita
evolution_health_logs: tratar via F3 (front escreve direto — violação de política)
ingest_ledger: Grupo A, não migra, documentar no gate

---

## 9. Kit de Diagnóstico Canônico

```sql
-- [D1] Inventário evo (exclui backups)
SELECT c.relname, c.reltuples::bigint rows,
  (SELECT count(*) FROM pg_constraint WHERE confrelid=c.oid AND contype='f') fk_ent,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal) trigs
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='evo' AND c.relkind='r' AND c.relname NOT LIKE '\_%%' ESCAPE '\'
ORDER BY c.relname;

-- [D2] Funções com literal evo.*
SELECT m[1] AS tabela, count(DISTINCT p.oid) n_fns, string_agg(DISTINCT p.proname, ', ') fns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN LATERAL regexp_matches(p.prosrc, 'evo\.(evolution_[a-z_0-9]+)', 'g') m
WHERE n.nspname IN ('zapp','evo','public')
GROUP BY m[1] ORDER BY count(DISTINCT p.oid) DESC, m[1];

-- [D3] Crons com literal evo.*
SELECT jobname, active, substring(command from 'evo\.(evolution_[a-z_]+)') primeira_ref
FROM cron.job WHERE command ~ 'evo\.evolution_' ORDER BY jobname;

-- [D5] Zero residuais pós-fix
SELECT p.proname, n.nspname,
  NOT (p.prosrc ~ 'FROM evo\.evolution_T')   from_ok,
  NOT (p.prosrc ~ 'INTO evo\.evolution_T')   into_ok,
  NOT (p.prosrc ~ 'UPDATE evo\.evolution_T') update_ok
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname IN ('fn_xxx', 'fn_yyy');

-- [D6] Grants authenticated em evo
SELECT table_name, string_agg(privilege_type, ',') g
FROM information_schema.role_table_grants
WHERE table_schema='evo' AND grantee='authenticated'
  AND privilege_type IN ('INSERT','UPDATE','DELETE')
GROUP BY table_name ORDER BY table_name;
```

---

## 10. Contexto Técnico Essencial

Infra: Supabase self-hosted em supabase.atomicabr.com.br
MCP de banco: SUPABASE SELF HOSTED - MCP
Container de trabalho: claude-code na VPS AtomicaBR
Repo: adm01-debug/zapp-web-v3, branch feat/decouple-provider

SET SCHEMA — efeitos automáticos (nao precisam de acao manual):
- FKs seguem a tabela
- RLS policies seguem a tabela
- Triggers seguem a tabela
- Views em public sobrevivem (OID-based)
- Views em zapp NAO sobrevivem (DROP antes!)

SET SCHEMA — o que quebra e precisa fix manual:
- Funcoes com evo.<tabela> literal no corpo [A7]
- Crons com evo.<tabela> no comando [A10]
- RPCs com RETURNS SETOF evo.<tabela> [A16] — DROP+CREATE

Search_paths atuais dos roles:
anon: search_path=public, extensions  <- [H1] APLICADO
authenticated: search_path=zapp, evo, public, extensions
service_role: search_path=zapp, evo, public, extensions

---

Fim do handoff. Se algo divergir do banco real, o banco e a fonte de verdade. Rodar kit de diagnostico (secao 9) e atualizar. Bom trabalho.
