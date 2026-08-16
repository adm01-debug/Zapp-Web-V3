# FASE 4 (parte 2) — MIGRAÇÃO 3-WAY, EXTENSÕES, TYPES.TS, SECURITY DEFINER, TRIGGERS

**Arquivo:** `docs/reconciliation/05_migracao.md`
**Data:** 2026-08-04 | **Tipo:** Auditoria READ-ONLY (somente SELECT / leitura de arquivos)
**Escopo:** Etapas 57–61 da Fase 4
**Ferramentas:** MCP Supabase (`supabase_db_query` / pg_catalog) + repo local `C:\zapp-web-v3`

---

## 1. Etapa 57 — MIGRAÇÃO 3-WAY (P1): arquivos × `schema_migrations` × objetos no DB

### 1.1 Inventário

| Fonte | Quantidade |
|---|---|
| Arquivos em `supabase/migrations/` (repo) | **8** |
| Linhas registradas em `supabase_migrations.schema_migrations` (DB) | **92** |
| Migrations com arquivo E registro | **4** (as 4 mais recentes) |
| Aplicado-sem-arquivo (no DB, sem arquivo no repo) | **88** |
| Arquivo-sem-aplicar (no repo, sem registro no DB) | **4** |

### 1.2 Mapa arquivo × registro (8 arquivos do repo)

| Arquivo | Registro no DB | Status |
|---|---|---|
| `20260804000000_canonical_schema.sql` | `20260804000000 canonical_schema_squash_133_migrations` | ✅ aplicado |
| `20260804120000_enable_rls_missing_tables.sql` | `20260804120000 enable_rls_missing_tables (aplicada de facto; delta efetivo em 20260804140000)` | ✅ aplicado |
| `20260804130000_fix_rls_critical_gaps.sql` | `20260804130000 fix_rls_critical_gaps (C-1 corrigido; delta efetivo em 20260804140000)` | ✅ aplicado |
| `20260804140000_fix_rls_critical_follow_up.sql` | `20260804140000 fix_rls_delta_corrigido` | ✅ aplicado |
| `20260804150000_fix_secdef_revoke_extended_schemas.sql` | — | ⚠️ **arquivo-sem-aplicar** |
| `20260804150000_integration_schema_zapp_fixes.sql` | — | ⚠️ **arquivo-sem-aplicar** |
| `20260804160000_fix_rls_policy_gaps_agent2.sql` | — | ⚠️ **arquivo-sem-aplicar** |
| `20260804170000_fix_rls_systematic_coverage.sql` | — | ⚠️ **arquivo-sem-aplicar** |

**⚠️ COLISÃO DE VERSÃO (P1):** `20260804150000_fix_secdef_revoke_extended_schemas.sql` e `20260804150000_integration_schema_zapp_fixes.sql` compartilham o mesmo version `20260804150000`. `version` é PK de `schema_migrations` — aplicar os dois via CLI faria o segundo falhar (duplicata) ou ser pulado. **Impossível registrar os dois como aplicados** sem renomear um deles (ex.: `20260804150001`).

**Nota drift de nomenclatura:** 88 migrations do DB têm versões não-ISO (ex.: `20260716`, `20260722.2`, `20260730185927`) que nunca casariam com o padrão de arquivo `<timestamp>_<nome>.sql` — mais um indício de que o DB é a fonte primária.

### 1.3 Verificação de objetos — migrations SEM registro no DB (caso crítico)

Para os 4 arquivos não aplicados, extraímos os objetos que criam e verificamos existência via `pg_catalog`:

| Objeto (arquivo 150000_integration) | Existe no DB? | Evidência |
|---|---|---|
| `zapp.rpc_app_bootstrap()` | ✅ | `to_regprocedure` OK; `proacl = {postgres=X, authenticated=X, service_role=X}`; anon **revogado** |
| `zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)` | ✅ | idem |
| `zapp.fn_safe_audit_log(...)` | ✅ | `proacl` inclui `authenticated=X` |
| `zapp.rpc_schema_columns(text)` / `zapp.rpc_schema_tables(text)` | ✅ | ambos OK |
| `zapp.fn_edge_upsert_evolution_credentials(...)` / `fn_edge_delete_evolution_credentials(uuid)` | ✅ | service_role apenas (edge fn `evolution-credentials` chama via `admin.rpc`) |
| REVOKEs de `public.rpc_app_bootstrap` / `public.rpc_dashboard_init` | ✅ | anon/auth executam = **false** (só postgres/service_role) |
| REVOKE `vendas.fn_listar_bling_tokens` / `zapp.purge_webhook_logs` / `vendas.resetar_envios_pedido` de authenticated | ✅ | `auth_exec=false` |
| REVOKE `financeiro.apagar_nota_fiscal` de authenticated | ❌ | `auth_exec=**true**` — REVOKE **não** efetivado no DB (gap residual) |

| Objeto (arquivo 160000_policy_gaps) | Existe no DB? | Evidência |
|---|---|---|
| Policies `feature_flags_authenticated_select`, `team_messages_insert_v2`, `voice_conversion_queue_delete`, `ai_hf_config_admin_dml`, `ai_mcp_servers_admin_dml`, `ai_tool_integrations_admin_dml` | ❌ NENHUMA | `pg_policies` = 0 hits nos 6 nomes |
| Cobertura alternativa real | Parcial | `zapp.feature_flags`: "Admins can manage flags" (ALL, authenticated) + anon SELECT ✓ · `zapp.team_messages`: `auth_secure_118` (ALL) + insert/select/update/delete ✓ · `ai.*`: `auth_secure_146/147/148` (SELECT authenticated) + `service_full_access` (ALL) — **sem DML admin autenticado** (frontend não grava nessas tabelas — só referências em types.ts) · `public.voice_conversion_queue`: **sem policy própria** (view proxy; leitura no frontend via `safeClient.from('voice_conversion_queue')`) |

| Objeto (arquivo 170000_systematic) | Existe no DB? | Evidência |
|---|---|---|
| Constraint `health_status_check_v2` em `zapp.whatsapp_connections` | ❌ | só existe `whatsapp_connections_health_status_check` — **porém ela JÁ inclui `'down'`** (r28 `20260801184500` já aplicou o fix; o v2 seria redundante) |
| `email_app.meta_capi_events` RLS enabled | ✅ | `relrowsecurity=true` (aplicado via MCP) |

**Conclusão do 3-way:** todos os objetos das 4 migrations não registradas **já existem no DB** (DDL aplicado via MCP — drift esperado conforme contexto da auditoria), com 2 resíduos: (a) `financeiro.apagar_nota_fiscal` ainda executável por `authenticated`; (b) policies do 160000 nunca materializadas (cobertura parcial equivalente).

### 1.4 O canonical é PARCIAL — DB é a única fonte completa

O arquivo `20260804000000_canonical_schema.sql` (16.375 linhas, "squash de 133 migrations") contém apenas uma fração do schema real:

| Objeto | No canonical (CREATE) | No DB (pg_catalog) | Cobertura |
|---|---|---|---|
| TABLES | 12 | zapp 321 + public 4 | **3,7%** |
| VIEWS | 33 | zapp 380 + public 511 | **3,7%** |
| FUNCTIONS | 103 | zapp 1.066 + public 148 | **8,5%** |
| TRIGGERS | 8 | zapp 217 + public 9 | **3,5%** |
| POLICIES | 183 | — (presentes) | parcial |

O próprio canonical documenta isso: *"CREATE TABLE migration was never committed (likely lost during the…"* (comentário no arquivo). **Objetos críticos usados pelo código e AUSENTES do canonical** (→ env fresco quebraria sem baseline):

| Objeto | Uso no código | No canonical? |
|---|---|---|
| VIEW `zapp.contacts` (50 cols) | `src/hooks/useContactData.ts`, `useDashboardData.ts`, `useCampaignEditor.ts`, `useBridgeStatus.ts`, `useAIAutoTags.ts`, `useSLAScopeOptions.ts` | ❌ 0 |
| VIEW `zapp.messages` (52 cols) | `src/features/inbox/...` (`.from('messages')`) | ❌ (só `zapp.messages_whatsapp`/`gmail_messages`) |
| VIEW `zapp.conversations` (19 cols) | módulo de conversas | ❌ 0 |
| VIEW `app_notifications` + triggers INSTEAD OF | `src/hooks/useNotificationManagement.ts` | ❌ 0 |
| 15 triggers **INSTEAD OF** (zapp.contacts/messages, public.contacts/messages, app_notifications) | escrita via PostgREST nas views (ver etapa 61) | ❌ (só as funções handler; 1 menção a "INSTEAD OF" é comentário) |
| `zapp.fn_safe_audit_log` | `src/features/connections/hooks/useConnectionsManager.ts` | ❌ 0 |
| `zapp.rpc_schema_tables/columns` | `src/lib/schemaDrift.ts` | ❌ 0 |
| `zapp.fn_edge_upsert/delete_evolution_credentials` | `supabase/functions/evolution-credentials/index.ts` | ❌ 0 |
| TABLE `zapp.profiles` (26 cols) | tabela central de auth | ❌ 0 (só 74 referências) |

### 1.5 Mecanismo oficial de ambiente novo (JÁ EXISTE)

`supabase/ci/README.md` + `download-baseline.sh`: **baseline = `pg_dump --schema-only --no-owner --no-acl` da produção** (`baseline-schema-2026-08-04.sql.gz`, 704 CREATE TABLEs, 3,5 MB, checksum SHA-256, salvo em backups do VPS + R2, retenção 14 dias). `pg-bootstrap.sql` é só bootstrap de CI (extensões + schemas stub).

**RECOMENDAÇÃO (etapa 57): DOCUMENTAR DB-AS-SOURCE** — o DB de produção é a única fonte completa de verdade; migrations são log de mudanças parcial. Baseline dump + canonical + 4 arquivos MCP é o caminho de reconstrução correto.

---

## 2. Etapa 58 — EXTENSÕES × requisitos (P1)

`SELECT extname, extversion FROM pg_extension` → 21 extensões instaladas. Cruzamento com requisito e uso no repo:

| Extensão | Versão | Status | Uso no repo |
|---|---|---|---|
| `pg_cron` | 1.6 | ✅ presente | 6 edge fns (`gmail-token-refresh`, `migrate-media-storage`, `reprocess-failed-messages`, `sicoob-outbox-consumer`, `talkx-scheduler`, `_shared/contract-schemas-infra`) + trigger `cron.job_cache_invalidate` |
| `pg_net` | 0.14.0 | ✅ presente | `src/__tests__/sprint1-security-hardening.test.ts` **exige** `net.http_post` e **proíbe** `extensions.http_post` (design consciente) |
| `pgcrypto` | 1.3 | ✅ presente | padrão Supabase |
| `uuid-ossp` | 1.1 | ✅ presente | padrão |
| `pg_graphql` | 1.5.11 | ✅ presente | citado em `evolution-credentials/index.ts` (PGRST_DB_SCHEMAS) |
| `vector` | 0.8.0 | ✅ presente | `ai-router`, `bitrix-api` (referências; sem coluna `vector` verificada em uso ativo) |
| `pgjwt` | 0.2.0 | ✅ presente | `ai-router`, `connection-test`, `gmail-oauth` (`sign()`) |
| **`http`** | — | ❌ **AUSENTE** | **P0 descartado:** ausência é intencional (teste exige `pg_net`, não `extensions.http`) — sem RPC/edge usando `http` |

**Extras instaladas:** `dblink` 1.2 (⚠️ habilitada via migration `20260802135945_enable_dblink`; sem uso ativo em código — apenas definições de tipo em types.ts; manter sob observação), `pgmq` 1.4.4, `pgsodium` 3.1.8, `supabase_vault` 0.3.1, `wrappers` 0.4.6, `unaccent`, `pg_trgm`, `btree_gin`, `hypopg`, `index_advisor`, `pg_buffercache`, `pg_stat_statements`, `amcheck`, `plpgsql`.

**Conclusão:** nenhuma extensão requisitada está faltando. `http` ausente = decisão deliberada (P2: manter teste de regressão para evitar reintrodução).

---

## 3. Etapa 59 — TYPES.TS × DB (P1): amostra de 5 tabelas-chave

Fonte: `src/integrations/supabase/types.ts` (2,5 MB, gerado — inclui schemas `public` e `zapp`; **NÃO inclui schema `storage`**) × `information_schema.columns`.

| Tabela/view | Colunas no types.ts | Colunas no DB | Divergência |
|---|---|---|---|
| `zapp.profiles` (tabela) | 26 | 26 | ✅ **zero** (so-DB=∅, so-types=∅) |
| `zapp.contacts` (view) | 50 | 50 | ✅ **zero** |
| `zapp.messages` (view) | 52 | 52 | ✅ **zero** (inclui `media_mime_type`+`media_mimetype` e `reply_to_id`+`reply_to_message_id` duplicadas em AMBOS) |
| `zapp.conversations` (view) | 19 | 19 | ✅ **zero** |
| `storage.objects` (tabela) | — (sem schema storage no types.ts) | 12 (id,bucket_id,name,owner,created_at,updated_at,last_accessed_at,metadata,path_tokens,version,owner_id,user_metadata) | ⚠️ **informacional:** clientes usam `FileObject` do `@supabase/storage-js` (name,id,updated_at,created_at,last_accessed_at,metadata,bucket_id?,owner?,buckets?) — `path_tokens`, `version`, `owner_id`, `user_metadata` não expostos pela API client (comportamento esperado do SDK, não drift) |

**Conclusão:** sem drift de colunas nas 4 tabelas/views zapp amostradas. Tipos gerados refletem o DB (geração apontando para a VPS, conforme `types-manual.ts`).

---

## 4. Etapa 60 — SECURITY DEFINER: higiene de search_path e owner (RISK alto)

```sql
SELECT nspname, count(*) FROM pg_proc WHERE prosecdef AND nspname IN ('zapp','public') GROUP BY 1;
-- zapp: 703 | public: 24 | TOTAL: 727
```

### 4.1 search_path (config nível função)

| Schema | Total secdef | Sem `search_path` em `proconfig` | % |
|---|---|---|---|
| zapp | 703 | **0** | 100% fixado |
| public | 24 | **0** | 100% fixado |

### 4.2 Amostra de corpos (pg_get_functiondef) — 20 RPCs mais chamados no frontend + wrappers

Proxy de "mais usadas": `pg_stat_user_functions` **vazio** (`track_functions=off`); usado frequência de `supabase.rpc('...')` em `src/` como proxy. Amostra de **32 funções** (top-20 RPCs + handlers/wrappers):

`rpc_upsert_contact, rpc_record_automation_error, rpc_get_contact, log_security_event, log_audit_event, user_has_permission, rpc_email_token_status, rpc_email_mark_thread_read, search_knowledge_base, rpc_set_whatsapp_mode, rpc_migrate_whatsapp_integration, rpc_list_transfers_paginated, rpc_list_failed_messages, rpc_instance_auth_event_trend, rpc_insert_message, rpc_email_star_thread, rpc_email_search_threads, rpc_email_assign_thread, rpc_email_archive_thread, rpc_dlq_retry_now, fn_contacts_view_insert_handler, fn_messages_view_insert_handler, handle_new_user, check_user_permission, rpc_app_bootstrap`

→ **32/32 com `search_path` presente no corpo/def** (`pg_get_functiondef ILIKE '%search_path%'` = true). Nenhum definer sem search_path fixo → **RISK alto = 0**. Migrations de hardening (`20260724000014 fix_secdef_search_path_bulk`, `20260727200008 harden_secdef_search_paths`, `20260729190003/05/06 harden_secdef_*`) surtiram efeito.

### 4.3 Owners

| Owner | Qtd | Avaliação |
|---|---|---|
| `postgres` | 484 | esperado (DDL aplicado por postgres/superuser) |
| `supabase_admin` | 243 | esperado no self-hosted (inclui `handle_new_user`, `rpc_record_automation_error`, `search_knowledge_base`, `user_has_permission`, `rpc_set_whatsapp_mode`, `rpc_migrate_whatsapp_integration`, `rpc_instance_auth_event_trend`) |

⚠️ **P2 (higiene):** owner dividido entre `postgres` e `supabase_admin` — ambos privilegiados (sem risco funcional), mas dificulta auditoria de "quem criou o quê". Sugere-se padronizar owner para um role único de DDL nas próximas migrations.

### 4.4 Padrão wrapper public/zapp (postura de segurança OK)

`public.rpc_app_bootstrap`, `public.rpc_dashboard_init`, `public.rpc_get_contact`, `public.check_user_permission` etc. têm `proacl` **sem anon/authenticated** (só postgres/service_role) — o frontend chama os wrappers `zapp.*` (com grant authenticated). O REVOKE da migration 150000_integration está efetivado no DB.

---

## 5. Etapa 61 — TRIGGERS INSTEAD OF (views graváveis)

Correção de bitmask: em `pg_trigger`, INSTEAD OF = bit **64** (não 4). Query: `WHERE tgtype & 64 = 64 AND NOT tgisinternal` → **15 triggers, todos `tgenabled='O'`**, conjuntos completos INSERT/UPDATE/DELETE:

| View | INSERT | UPDATE | DELETE | Funções handler |
|---|---|---|---|---|
| `zapp.contacts` (view) | `trg_contacts_view_insert` | `trg_contacts_view_update` | `trg_contacts_view_delete` | `fn_contacts_view_{insert,update,delete}_handler` (SECURITY DEFINER, search_path fixo) |
| `zapp.messages` (view) | `trg_messages_instead_of_insert` | `messages_instead_of_update` | `messages_instead_of_delete_tg` | `fn_messages_view_insert_handler`, `messages_update_trigger`, `messages_instead_of_delete` |
| `public.contacts` (view proxy) | `tr_contacts_proxy_insert` | `tr_contacts_proxy_update` | `tr_contacts_proxy_delete` | `fn_contacts_proxy_{insert,update,delete}` |
| `public.messages` (view proxy) | `trg_public_messages_insert` | `trg_public_messages_update` | `trg_public_messages_delete` | `fn_messages_bridge_{insert,update,delete}` |
| `app_notifications` (view) | `trg_app_notif_insert` | `trg_app_notif_update` | `trg_app_notif_delete` | `fn_app_notifications_{insert,update,delete}` |

**Cruzamento com código:**
- ✅ Frontend escreve em `zapp.messages` (`NextBestActionEngine.tsx` `.from('messages')`), `zapp.contacts` (hooks de contatos) e `app_notifications` (`useNotificationManagement.ts`) — os triggers INSTEAD OF são **load-bearing** para toda escrita via PostgREST nessas views.
- ✅ Handlers são SECURITY DEFINER **com search_path fixado** (etapa 60 confirmou para os de contacts/messages).
- ⚠️ **P1 (reconstrução):** o canonical **não cria nenhum dos 15 triggers** (só as funções handler; a única ocorrência de "INSTEAD OF" é comentário na linha 310). Origem real: migrations `20260731124746 consolidate_zapp_messages_instead_of_triggers` e `20260801180000 infra01_consolidate_messages_view_triggers` (registradas no DB, sem arquivo no repo) + DDL via MCP. Em ambiente novo, sem o baseline, as views seriam read-only → envio de mensagem/contatos quebraria.

---

## 6. RECOMENDAÇÕES PRIORIZADAS

| # | Prioridade | Ação | Evidência |
|---|---|---|---|
| R1 | **P0** | **Formalizar DB-as-source**: baseline `pg_dump --schema-only` (já existente em `supabase/ci/`) como documento canônico de schema; migrations passam a ser "change log" (nunca fonte de reconstrução isolada) | canonical cobre 3–8% dos objetos; 88/92 migrations sem arquivo |
| R2 | **P1** | Resolver **colisão de versão** `20260804150000` (2 arquivos): renomear um para `20260804150001` e **registrar os 4 arquivos não aplicados em `schema_migrations`** (INSERT manual, como já feito para 120000/130000 com anotação) — fecha o gap arquivo-sem-aplicar sem reaplicar DDL | §1.2 |
| R3 | **P1** | REVOKE pendente: `financeiro.apagar_nota_fiscal(uuid)` ainda executável por `authenticated` (migration 150000_secdef não efetivou) | §1.3 |
| R4 | **P1** | Decidir destino das policies do 160000 (`ai_hf_config_admin_dml` etc.): ou aplicar (DML admin autenticado em `ai.*`), ou arquivar o arquivo com nota de cobertura alternativa — nunca deixar "órfã" sem registro | §1.3 |
| R5 | **P2** | Adicionar ao canonical (ou a migration de follow-up) os objetos usados por código: views `zapp.contacts/messages/conversations`, `app_notifications` + 15 triggers INSTEAD OF, `fn_safe_audit_log`, `rpc_schema_tables/columns`, `fn_edge_*_evolution_credentials` — para que baseline+canonical reconstruam 100% do caminho crítico | §1.4 |
| R6 | **P2** | Reavaliar necessidade de `dblink` (habilitada por migration; sem uso ativo; superfície de ataque desnecessária) | §2 |
| R7 | **P2** | Padronizar owner de DDL (postgres vs supabase_admin) para auditoria; manter teste de regressão que proíbe `extensions.http_post` | §4.3, §2 |
| R8 | **P3** | Ativar `track_functions` (ou amostrar via pg_stat_statements) para ranking real de uso de funções em futuras auditorias | §4.2 |

---

## 7. Resumo executivo

- **Migração 3-way:** DB é a fonte de verdade (88/92 aplicadas sem arquivo; 4 arquivos não registrados mas com DDL já materializado via MCP). Canonical cobre <9% dos objetos. Mecanismo de reconstrução real = baseline pg_dump de produção. **Recomendação: documentar DB-as-source** + registrar os 4 arquivos pendentes (após resolver colisão de versão).
- **Extensões:** 21 instaladas; todas as 8 requisitadas presentes; `http` ausente por design (pg_net no lugar). Sem P0.
- **Types.ts:** zero drift nas 4 tabelas/views zapp amostradas (26/50/52/19 colunas idênticas); `storage.objects` não tipado no types.ts (SDK FileObject — esperado).
- **SECURITY DEFINER:** 727 funções, 100% com search_path fixado (config + corpo amostrado 32/32); owners postgres/supabase_admin (esperado); nenhum RISK alto.
- **Triggers INSTEAD OF:** 15 triggers completos (I/U/D) em 5 views graváveis, todos ativos e com handlers seguros; **ausentes do canonical** (crítico p/ reconstrução de ambiente).
