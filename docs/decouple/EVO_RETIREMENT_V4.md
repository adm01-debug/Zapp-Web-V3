# EVO_RETIREMENT_V4 — Inventário read-only das tabelas/funções `evo.*` (V4-FINAL #73-74, #77)

**Data:** 2026-08-14 · **Método:** 17 queries SELECT via MCP `supabase_db_query` (banco `postgres` PG 15.8, zero DDL) · **Fonte:** onda 3, agente 6

> ⚠️ **Correções factuais ao plano V4-FINAL** medidas neste inventário:
> 1. **27** relações `evo.evolution_*` (não 29): 13 operacionais + parent `evolution_webhook_events_v2` + 13 partições (`2026_07..2027_06` + default). As tabelas centrais (`evolution_messages/conversations/contacts/instances`) **não existem em `evo`** — vivem em `zapp` (`public.*` são views).
> 2. **Risco E23 (3+ realtime subscriptions em evo) NÃO se materializa**: ZERO tabelas evo em qualquer publication. Congelamento de grants evo **não** derruba realtime.
> 3. **115 funções evo executáveis por `authenticated`** — porém TODAS com ACL explícita (`proacl NOT NULL`), **nenhuma via PUBLIC default**. A decisão de REVOKE é sobre os 115 grants explícitos, não sobre PUBLIC.

---

## (a) Tabelas `evo.evolution_*` — classificação de uso (pg_stat_user_tables, cumulativo)

| Classe | Tabelas | Evidência |
|---|---|---|
| **ATIVAS (escrita)** | `guardian_heartbeat` (154 ins), `traefik_401_stats` (526 ins), `pipeline_health_log` (39 ins), `reconcile_jobs` (25 ins/78 upd), `reconcile_health_log` (14 ins), `evolution_webhook_events_v2_2026_08` (130 ins — única partição com dados) | n_tup_ins/upd > 0 |
| **LEITURA** | `connection_history` (574 idx scans), `whatsapp_check_queue`, `evolution_webhook_events_v2_2026_07` (685 idx) | idx_scan > 0 |
| **FRIAS** | `alert_cooldown`, `backfill_audit`, `bootstrap_log`, `pipeline_history`, `rabbit_consumer_stats`, `retention_log` + 11 partições futuras (0 ins, só seq_scan de probe) | sem atividade real |

`last_vacuum` NULL em todas; autovacuum recente (14/08) apenas em `reconcile_jobs` e `_snapshot_version_state`.

## (b) Realtime — superfície evo = ZERO

- `pg_publication_tables WHERE schemaname='evo'` → **0 linhas**
- Publications existentes: `supabase_realtime` (14 tabelas **zapp**: `evolution_alerts/contacts/realtime_events` etc.), `supabase_realtime_messages_publication` (7 em realtime), `logflare_pub` (2 em extensions)
- `pg_stat_subscription` = 0; `realtime.subscription` client-side = 14 entidades, **todas `zapp.*`** (claims role=anon)

**Veredito:** o congelamento de grants em `evo.*` não afeta o realtime no estado atual. Revalidar antes de remover o risco E23 do runbook.

## (c) Funções `evo.*` — grants

- 159 funções em `evo`; **115 executáveis por `authenticated`** — todas com ACL explícita (`postgres/service_role/authenticated=X`), 0 via PUBLIC default.
- 74 das 115 tocam message/contact/conversation no `prosrc`.
- Top-20 críticas: `fn_sync_messages_to_v2`, `fn_sync_status_from_messages`, `fn_link_orphan_messages`, `fn_touch_contact_last_message`, `fn_process_api_contacts_response`, `fn_filter_canary_messages`, `fn_flag_poison_messages`, `fn_trigger_audio_transcription`, `fn_upsert_group_participants`, `fn_normalize_remote_jid`, `fn_normalize_conversation_jid`, `fn_backfill_contact_id`, `cleanup_expired_contact_ids`, `add_to_contact_id_graveyard`, `prevent_contact_id_reuse`, `is_contact_id_available`, `search_contacts_gin`, `sync_contact_intelligence`, `fn_validate_media_security`, `fn_ledger_from_insert` (+ `fn_ensure_evolution_backcompat_views`, cron 138).
- **88 crons chamam `evo.*`** — rodam como `postgres`; REVOKE de `authenticated` não os quebra.

## (d) Backcompat views — ponto de atenção (AGENTS.md: NÃO MEXA)

`evo.fn_ensure_evolution_backcompat_views` (cron 138, a cada 6h) cria views a partir de **`zapp.evolution_messages`** (não evo) e, para todo `evo.evolution_%` sem view homônima em `public`, cria a view **com GRANT SELECT/INSERT/UPDATE/DELETE a `authenticated`**.

Implicações:
1. As 27 tabelas `evolution_*` têm views public/zapp (`pg_depend`) → **ficam** (base do cron 6h).
2. Se alguma view public for dropada, o cron a recria **com grants DML a `authenticated`** (re-exposição). A solução definitiva é a allowlist da função — **fora de escopo, NÃO MEXA sem etapa dedicada**.
3. REVOKE nas tabelas-base com views `security_invoker` quebra as views para `authenticated` → revoke deve ser combinado views+tabelas se a intenção for aposentar.

## (e) Recomendação de congelamento formal (NUNCA DROP nesta rodada)

**Congeláveis já** (COMMENT `'CONGELADO 2026-08-XX'` + REVOKE `authenticated`; `service_role` e crons intocados) — sem views public/zapp e frias:

- `_secure_config`, `_snap_*` (5), `contact_id_graveyard`, `idx_usage_audit`, `media_cleanup_log`, `media_dedupe_log`, `media_loss_registry`, `media_orphan_triage`, `media_storage_config`, `vps_*` (4), `ops_runbooks`, `_watchdog_media_links_log`, `_snapshot_version_state`

**Pré-condição `[⛔]`:** APROVADO de Joaquim + janela de manutenção + verificação pós-congelamento (cron 138 verde, views public respondendo, health A+).

## Pendências abertas

1. Verificar se o MCP aponta para o ambiente canônico (tabelas `vps_*`/`ops_runbooks`/`e2e_probe_results` no schema evo sugerem possível mistura de ambientes — inconclusivo por SQL).
2. Decisão sobre os 115 grants explícitos de funções evo (REVOKE seletivo vs documentar superfície aceita) — requer lista nominal de consumidores PostgREST.
3. `zapp.dispatch_error_logs` (ver RPC_AUDIT_V4.md) — registro órfão de 2026-05-04, não é DLQ ativa; retenção via `zapp.cleanup_dispatch_error_logs` se decidirem remover.
