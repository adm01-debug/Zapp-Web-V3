# Auditoria de Segurança do Banco — zapp/evo/public

**Data:** 2026-08-03
**Ferramenta:** MCP Supabase (pg_catalog + information_schema, leitura direta no banco de produção)
**Escopo:** Schemas `zapp`, `evo`, `public` — SECURITY DEFINER/INVOKER, search_path, RLS policies, grants

---

## 1. Sumário Executivo

| Verificação | Resultado | Status |
|---|---|---|
| SECURITY DEFINER sem `SET search_path` | **0 de 774** | ✅ 100% conforme |
| Tabelas sem RLS habilitado | **0 de 494** | ✅ 100% coberto |
| Policies com role `PUBLIC` (polroles vazio) | **0** | ✅ |
| GRANT para role `anon` (tabelas/funções) | **0** | ✅ anon sem acesso |
| Funções com EXECUTE para `anon` | **0** | ✅ |
| Policies `true`/NULL abertas a `authenticated` | **78** (70 tabelas) | ⚠️ revisar 11 críticas |
| Policies `true`/NULL com roles `NULL` (semântica PUBLIC) | **6** (só INSERT) | ⚠️ verificar |
| Funções executáveis por `authenticated` | **609** (133 SECURITY DEFINER) | 🟡 auditoria de autorização interna |

**Veredito geral: postura forte.** Hardening de anon já aplicado (0 acesso anônimo), RLS habilitado em 100% das tabelas e todas as funções SECURITY DEFINER com search_path fixo. Pontos de atenção concentram-se em **políticas `true`/`true` concedidas a `authenticated`** (algumas com nome sugerindo `service_role`) e em **6 policies INSERT com roles NULL**.

---

## 2. Inventário de Funções — SECURITY DEFINER vs INVOKER

### 2.1 Totais por schema

| Schema | SECURITY DEFINER | SECURITY INVOKER (default) | Total |
|---|---|---|---|
| `zapp` | 692 | 363 | 1055 |
| `evo` | 58 (+1 procedure `pr_vps_update_status`) | 9 | 68 |
| `public` | 24 | 120 | 144 |
| **Total** | **774** | **492** | **1267** |

### 2.2 SECURITY DEFINER — análise de `search_path`

**Todas as 774 funções + 1 procedure SECURITY DEFINER possuem `SET search_path` explícito (proconfig). Nenhuma função SECURITY DEFINER ficou sem search_path fixo.** ✅

Valores de `search_path` observados (todos pinados a schemas próprios, sem `pg_temp` à frente do schema do objeto — 4 funções incluem `pg_temp` **depois** do schema próprio, o que é seguro):

- `search_path=zapp, evo, monitoring` (mais comum em zapp)
- `search_path=evo` / `search_path=evo, zapp`
- `search_path=zapp` / `search_path=zapp, pg_catalog`
- `search_path=zapp, auth` / `zapp, auth, extensions` (RPCs que usam `auth.uid()`)
- `search_path=zapp, net` / `zapp, cron, pg_catalog` (extensões)
- `search_path=public, zapp, evo, pg_catalog` (24 funções em public)
- 1 função com `search_path=""` (vazio — efetivamente só objetos qualificados; equivalente a sem busca implícita)

### 2.3 Exposição via EXECUTE (superfície REST/RPC)

| Role | Funções com EXECUTE em zapp/evo/public | SECURITY DEFINER entre elas |
|---|---|---|
| `anon` | **0** | 0 |
| `authenticated` | **609** (zapp 469, public 133, evo 7) | **133** |
| `service_role` / `postgres` | total (herdado) | — |

- **0 funções expostas a anônimos** (resultado do hardening anon de 2026-06-30 — `db/security/2026-06-30_anon_*`).
- As 133 SECDEF expostas a `authenticated` incluem RPCs de uso do frontend (`rpc_list_*`, `rpc_upsert_*`, `rpc_insert_message`, `rpc_delete_contact`, `rpc_run_full_test_suite`, `rpc_migrate_whatsapp_integration`, `admin_*`, `export_user_data`, `import_user_data`, `merge_contacts`, `pause_instance`, `update_large_batch_safe`, etc.). Todas com search_path ✅; **a autorização dentro do corpo da função (auth.uid()/role checks) não é verificável via catálogo** — ver §5.1.
- 476 funções expostas são SECURITY INVOKER (RLS do chamador se aplica — padrão seguro).

---

## 3. RLS Policies

### 3.1 Cobertura

- **494 tabelas/partições** nos 3 schemas: **RLS habilitado em 100%** (`relrowsecurity=true`).
- 2 tabelas com RLS on e **0 policies** (`evo._backup_evolution_alerts_20260802`, `evo._backup_evolution_contacts_20260802`) → **bloqueadas por padrão** (deny-all) ✅.
- **991 policies** no total (zapp 728, evo 262, public 1).
- **0 policies para role PUBLIC** (polroles = `{}`).

### 3.2 Policies com qualificador literal `true` ou `NULL`

Total: **425** → classificação:

| Destino | Quantidade | Avaliação |
|---|---|---|
| `service_role` / `postgres` (true/true) | **341** | ✅ por design (acesso interno) |
| `authenticated` | **78** (70 tabelas) | ⚠️ revisar (abaixo) |
| roles `NULL` (polroles nulo — semântica pré-PG15 ≈ PUBLIC) | **6** (só INSERT) | ⚠️ verificar |

### 3.3 🔴 CRÍTICO — Policies `cmd=*` com `USING=true` E `CHECK=true` para `authenticated` (CRUD total)

Qualquer usuário autenticado (não só admin) pode **ler, inserir, atualizar e deletar** sem restrição:

| Schema.Tabela | Policy | Obs |
|---|---|---|
| zapp.agents | `service_role_all` | **Nome diz service_role, mas role = authenticated** ⚠️ |
| zapp.alert_dispatch_state | `auth_full_access` | |
| zapp.alerts | `auth_access` | |
| zapp.audio_meme_categories | `amc_service_all` | **Nome diz service, role = authenticated** ⚠️ |
| zapp.cookie_probe_log | `rls_cookie_probe_log_service_only` | **Nome diz service_only, role = authenticated** ⚠️ |
| zapp.cookie_probe_pending | `rls_cookie_probe_pending_service_only` | **Nome diz service_only, role = authenticated** ⚠️ |
| zapp.integration_registry | `auth_full_access` | |
| zapp.processed_webhook_events | `auth_full_access` | |
| zapp.restore_test_log | `auth_full_access` | |
| zapp.rpc_rate_limits | `auth_full_access` | tabela de rate-limit — escrita livre pode afetar limites |
| evo.evolution_messages_wpp2 | `authenticated_insert_messages` (cmd=a, CHECK=true) | INSERT irrestrito de mensagens |

### 3.4 🟠 MÉDIO — Policies `authenticated` com USING=`true` e CHECK com guarda

`cmd=*` ou `cmd=w` com leitura livre mas escrita condicionada (`is_admin_or_supervisor()`, `uploaded_by = auth.uid()`, etc.) — 25 policies em tabelas como `app_settings`, `alerts` (ver acima), `automations`, `auto_close_config`, `business_hours`, `queues`, `role_permissions`, `route_permissions`, `sales_pipeline_stages`, `media_cache`, `away_messages`, `allowed_countries`, `audio_memes`, `custom_emojis`, `automation_rules`, `campaigns` (insert), `channel_connections` (insert), `contact_notes` (insert), `contatos`/`empresas` (insert admin), `crisis_room_alerts`, `csat_responses`, `forwarded_messages`, `instance_processing_pauses`, `media_download_queue`, `saved_filters`, `password_reset_requests`, `pii_access_log`, `outbound_*`, `reconnection_logs`, `entity_versions`, `favorite_contacts`, `profiles`, `conversation_snoozes`, `queues` (leitura livre via 3 policies). Padrão aceitável se o frontend depende de RPCs para escrita; leitura livre pode vazar dados se a tabela contiver PII.

### 3.5 🟠 MÉDIO — Policies com roles `NULL` (≈ PUBLIC) e sem WITH CHECK (só INSERT)

`polroles = NULL` (não é `{}`) — semântica de "todos" em versões antigas; mitigado pela ausência de grants anon, mas **aplicável a qualquer role com INSERT grant** (authenticated tem):

| Tabela | Policy | Impacto potencial |
|---|---|---|
| evo.evolution_health_logs | `evo_health_insert` | inserção de logs falsos |
| evo.evolution_media | `media_insert_auth` | inserção de mídia arbitrária |
| zapp._pagination_state | `pagination_insert` | estado de paginação |
| zapp.contact_phones | `cphones_insert` | **injeção de telefones em contatos** |
| zapp.conversation_audit_logs | `conv_audit_insert` | falsificação de auditoria |
| zapp.perfis_usuarios | `allow_admin_insert` | **nome diz admin, sem check** ⚠️ |

### 3.6 🟡 BAIXO — Reads abertos a authenticated (`USING=true`, cmd=r)

~40 policies de leitura livre em tabelas operacionais (`vps_*`, `evolution_labels`, `evolution_reconcile_jobs`, `idx_usage_audit`, `migration_watermark`, `_authoritative_time`, `agent_presence`, `allowed_countries`, `api_circuit_breaker`, `cookies_config`, `fn_health_score_history`, `inbox_custom_scopes`, `lux_system_alerts`, `media_quarantine`, `media_security_alerts`, `permissions`, `channel_provider_routes`, `forwarded_messages`, `audio_meme_categories`, `queues`, `app_error_logs`, etc.). Baixo risco, mas revisar se alguma contém dados sensíveis (ex.: `media_quarantine`, `media_security_alerts`).

---

## 4. Grants (informação_schema.role_table_grants)

| Schema | anon | authenticated | service_role | postgres | authenticator | supabase_admin | pg_monitor |
|---|---|---|---|---|---|---|---|
| zapp (~701 tabelas) | **0** | SELECT/INSERT/UPDATE/DELETE em ~700 | full em 701 | full em 700 | 1 tabela (INSERT/SELECT/UPDATE) | 165 | — |
| evo (188) | **0** | SELECT 116, INSERT 84, UPDATE 84, DELETE 82 | full em 188 | full em 188 | 1-2 tabelas | 5 | — |
| public (514) | **0** | full em ~514 | full em 514 | full em 513 | 1 | 1 | 1 |

- **Nenhum grant `anon`** em nenhuma tabela dos 3 schemas ✅ (o default de Supabase foi revogado — consistente com `db/security/2026-06-30_anon_hardening_*`).
- `authenticated` tem CRUD amplo nas tabelas; a contenção real é feita por RLS (que está ativa).
- `authenticator` restrito a 1–2 tabelas (provável uso por trigger/edge function) ✅.

---

## 5. Recomendações (por prioridade)

### 5.1 🔴 Alta
1. **Corrigir as 6 policies `service_role_all` / `*_service_only` / `*_service_all` que estão com role `authenticated`** (zapp.agents, zapp.audio_meme_categories, zapp.cookie_probe_log, zapp.cookie_probe_pending) — trocar para `service_role` ou adicionar guarda `auth.uid()`/role check. Nome ≠ role = erro de criação ou cópia.
2. **Revisar `zapp.alerts`, `zapp.alert_dispatch_state`, `zapp.processed_webhook_events`, `zapp.restore_test_log`, `zapp.rpc_rate_limits`, `zapp.integration_registry`** (true/true p/ authenticated): restringir a `service_role` ou adicionar WITH CHECK de admin. Atenção especial a `rpc_rate_limits` (escrita livre viabiliza contornar rate-limit) e `processed_webhook_events` (dados de webhook).
3. **`evo.evolution_messages_wpp2 [authenticated_insert_messages]`**: adicionar WITH CHECK (ex.: `current_user_is_privileged()` como na policy de `evolution_messages`).
4. **Auditar autorização interna das 133 SECDEF expostas a authenticated** (corpo das funções: `auth.uid()`, `is_admin_or_supervisor()`, `has_role()`, `user_has_permission()`). Catálogo não prova autorização — priorizar: `admin_criar_usuario_painel`, `admin_atualizar_usuario_painel`, `export_user_data`, `import_user_data`, `rpc_run_full_test_suite`, `rpc_migrate_whatsapp_integration`, `update_large_batch_safe` (recebe SQL), `merge_contacts`, `pause_instance`, `send_message_v2`, `rpc_delete_contact`, `delete_contact_completely`.

### 5.2 🟠 Média
5. **Resolver as 6 policies INSERT com polroles NULL** (verificar se são PUBLIC de fato; se sim, definir `TO authenticated` + WITH CHECK explícito): `contact_phones`, `perfis_usuarios`, `conversation_audit_logs`, `_pagination_state`, `evo.evolution_media`, `evo.evolution_health_logs`.
6. **Revisar leituras `USING=true`** em tabelas com PII/telemetria (`media_quarantine`, `media_security_alerts`, `forwarded_messages`, `inbox_custom_scopes`, `app_error_logs`) — considerar `is_admin_or_supervisor()`.
7. **Rotina de verificação contínua**: reexecutar as queries desta auditoria (Seção 6) num cron mensal; gate de CI falhando se aparecer SECDEF sem search_path ou policy true/true p/ authenticated.

### 5.3 🟢 Baixa
8. `search_path=""` em 1 função — padronizar para schema explícito.
9. Backup tables com 0 policies estão deny-all ✅ — manter assim e adicionar comentário.

---

## 6. Queries da Auditoria (reutilizáveis)

```sql
-- SECDEF sem search_path (deve retornar 0)
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosecdef AND n.nspname IN ('zapp','evo','public')
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%');

-- Policies true/true para authenticated (deve retornar 0)
SELECT n.nspname, c.relname, pol.polname, pol.polcmd
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('zapp','evo','public')
  AND (SELECT string_agg(rolname,',') FROM pg_roles WHERE oid = ANY(pol.polroles)) LIKE '%authenticated%'
  AND (lower(pg_get_expr(pol.polqual, pol.polrelid)) IN ('true','(true)')
       OR lower(pg_get_expr(pol.polwithcheck, pol.polrelid)) IN ('true','(true)'));

-- Funções expostas a anon (deve retornar 0)
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('zapp','evo','public') AND p.prokind='f'
  AND has_function_privilege('anon', p.oid, 'EXECUTE');

-- Tabelas sem RLS (deve retornar 0)
SELECT n.nspname, c.relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('zapp','evo','public') AND c.relkind IN ('r','p')
  AND NOT c.relrowsecurity;
```

---

## 7. Notas de Método / Limitações

- A auditoria é **nível catálogo** (pg_catalog/pg_policy/information_schema) — não inspeciona o corpo das funções nem o código do frontend.
- `PGRST_DB_SCHEMAS` não é visível via `pg_settings` neste ambiente (config do container PostgREST) — a exposição REST foi inferida por EXECUTE grants (anon/authenticated).
- Dados coletados via MCP Supabase em produção em 2026-08-03.
