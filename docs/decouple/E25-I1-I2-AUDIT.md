# E25 — Auditoria I1/I2: Referências Cross-Schema zapp↔evo

> **Data:** 2026-08-15 · **Branch:** `claude/evolution-zapp-separation-analysis-29lixd`
> **Escopo:** Análise estática de migrations + dados do DB de produção (baseline 2026-08-15)
> **Invariantes auditados:** I1 (zapp.* → evo.*) e I2 (evo.* → zapp.*)
> **Fonte primária (DB de prod):** `docs/decouple/baseline/20260815/{zapp_evo_refs,evo_zapp_refs}.json`
> **Fonte secundária (migrations):** varredura de 254 arquivos `supabase/migrations/*.sql`

---

## Sumário Executivo

| Invariante | Status | Funções no DB | Refs no DB | Em Migrations | Só no DB (sem migration) |
|------------|--------|:---:|:---:|:---:|:---:|
| I1: `zapp.*` → `evo.*` | 🔴 FAIL | **34** | **82+** | 9 | **25** |
| I2: `evo.*` → `zapp.*` | 🔴 FAIL | **96** | ~300 | 22 | **74** |

> **Nota sobre o ADR-014:** O ADR-014 registrou "20 funções I1" — esse número é o campo `distinct_functions: 20`
> do JSON, que parece sub-contar. A varredura direta do JSON revela **34 funções distintas** para I1.
> Para I2, o número de 96 funções está correto e confirmado.

**Risco crítico:** 74/96 funções I2 e 25/34 funções I1 existem **somente no DB de prod sem migration registrada**.
Qualquer auditoria baseada apenas em arquivos de migration cobre apenas ~22% do universo real.

---

## I1 — Funções `zapp.*` que referenciam `evo.*` (34 funções, 82+ refs)

### 1.1 Funções COM migration (9 auditáveis por código)

| Função | Migration | Tabelas/Funções evo acessadas | Categoria |
|--------|-----------|-------------------------------|-----------|
| `zapp.fn_register_instance` | `20260806122000_db03_register_instance.sql:33` | `evo.instance_registry`, `evo.evolution_webhook_events`, `evo.fn_auto_create_next_partitions` | 🔴 VIOLAÇÃO — acesso direto ao registro de instâncias evo |
| `zapp.fn_purge_api_key_from_logs` | `20260806121000_db02_purge_api_key_logs.sql:29` | `evo.evolution_bootstrap_log`, `evo.evolution_audit_log`, `evo.evolution_health_logs`, `evo.evolution_webhook_events_v2` | 🟠 OPERACIONAL — purga de logs cross-schema |
| `zapp.fn_upsert_lid_identity` | `20260812173000_zapp_fn_upsert_lid_identity.sql:5` | `evo.contact_identity`, `evo.lid_phone_map` | 🔴 VIOLAÇÃO — escreve diretamente em tabelas evo de identidade |
| `zapp.fn_health_preflight` | `20260814130000_fn_health_preflight_check9_vault_key.sql:6` | Chama `evo.fn_pipeline_health_probe`, `evo.fn_vps_health_score` | 🟡 DELEGAÇÃO — chama funções evo de health; análogo ao padrão monitoria |
| `zapp.zapp_upsert_group_from_event` | `20260811130000_grupos.sql:219` | `evo.evolution_instance_credentials`, chama `evo.fn_upsert_group_from_event` | 🔴 VIOLAÇÃO — acessa credenciais evo diretamente |
| `zapp.zapp_upsert_group_participants` | `20260811130000_grupos.sql:235` | `evo.evolution_instance_credentials`, chama `evo.fn_upsert_group_participants` | 🔴 VIOLAÇÃO — acessa credenciais evo diretamente |
| `zapp.zapp_touch_contact_presence` | `20260811140000_status_contato.sql:55` | `evo.evolution_instance_credentials`, `evo.evolution_whatsapp_check_queue`, `evo.evolution_whatsapp_status`, chama `evo.fn_touch_contact_presence` | 🔴 VIOLAÇÃO MISTA — acesso direto + delegação legítima |
| `zapp.zapp_mark_status_viewed` | `20260811140000_status_contato.sql:96` | `evo.evolution_instance_credentials`, `evo.evolution_whatsapp_check_queue`, chama `evo.fn_mark_status_viewed` | 🔴 VIOLAÇÃO MISTA — acesso direto + delegação legítima |
| `zapp.rpc_log_evolution_health` | `20260813180000_rpc_log_evolution_health.sql:4` | `evo.evolution_health_logs` | 🟠 MONITORAMENTO — log de saúde; análogo ao padrão monitoria |

### 1.2 Funções SEM migration (25 — somente no DB de prod)

> ⚠️ **RISCO:** Código não versionado. Auditoria requer `SELECT prosrc FROM pg_proc WHERE proname=?` no DB de prod.
> Os tipos de referência abaixo são inferidos dos nomes e padrões conhecidos.

| Função | Objetos evo referenciados (do JSON) | Categoria Inferida |
|--------|-------------------------------------|-------------------|
| `zapp.fn_check_evolution_jid_health` | `evo.evolution_alert_cooldown` | 🟡 MONITORIA — tabela de cooldown de alertas |
| `zapp.fn_cron_guardian` | `evo.fn_v*` (função, truncada no regex) | 🟡 MONITORIA — guardian chama função evo |
| `zapp.fn_get_evolution_health_summary` | `evo.evolution_webhook_events_v*` (view v2) | 🟡 MONITORAMENTO — leitura de view v2 |
| `zapp.fn_mirror_to_webhook_events_v2` | `evo.evolution_webhook_events_v*` (view v2) | 🟠 MIGRAÇÃO — espelhamento de dados |
| `zapp.fn_normalize_send_jid` | `evo.contact_identity`, `evo.lid_phone_map` | 🔴 VIOLAÇÃO — leitura de tabelas evo de identidade |
| `zapp.fn_reconcile_apply` | `evo.evolution_reconcile_jobs` | 🔴 VIOLAÇÃO — gerencia jobs de reconciliação evo |
| `zapp.fn_reconcile_dispatch` | `evo.evolution_reconcile_jobs` | 🔴 VIOLAÇÃO — despacha jobs de reconciliação evo |
| `zapp.fn_reprocess_pending_webhook_events` | `evo.evolution_webhook_events_v*` | 🟠 OPERACIONAL — reprocessamento de eventos |
| `zapp.fn_resolve_stale_connection_alerts` | `evo.evolution_connection_history` | 🟡 MONITORIA — histórico de conexão |
| `zapp.fn_restore_integrity_check` | `evo.evolution_webhook_events_v*` | 🟡 MONITORAMENTO — verificação de integridade |
| `zapp.fn_score_v2_pipeline` | `evo.fn_v*` (função, truncada) | 🟡 MONITORAMENTO — score do pipeline |
| `zapp.fn_sync_instance_registry_status` | `evo.evolution_connection_history` | 🔴 VIOLAÇÃO — sincroniza status de instâncias evo |
| `zapp.fn_webhook_pipeline_score` | `evo.evolution_webhook_events_v*` | 🟡 MONITORAMENTO — score de pipeline |
| `zapp.fn_zapp_web_smoke_test_v2` | `evo.evolution_webhook_events_v*` | 🟢 TESTE — função de smoke test |
| `zapp.get_platform_health` | `evo.evolution_webhook_events_v*` | 🟡 MONITORAMENTO — saúde da plataforma |
| `zapp.rpc_claim_media_download_batch` | `evo.rpc_claim_media_download_batch` (chama evo RPC) | 🟡 DELEGAÇÃO — wrapper para RPC evo de mídia |
| `zapp.rpc_complete_media_download` | `evo.rpc_complete_media_download` (chama evo RPC) | 🟡 DELEGAÇÃO — wrapper para RPC evo de mídia |
| `zapp.rpc_dr_health_check` | `evo.evolution_webhook_events_v*` | 🟡 MONITORAMENTO — DR health check |
| `zapp.rpc_fail_media_download` | `evo.rpc_fail_media_download` (chama evo RPC) | 🟡 DELEGAÇÃO — wrapper para RPC evo de mídia |
| `zapp.rpc_pipeline_dashboard` | `evo.evolution_webhook_events_v*` | 🟡 MONITORAMENTO — dashboard de pipeline |
| `zapp.rpc_platform_maintenance` | (inferido: evo tables) | 🟠 MANUTENÇÃO — operação de manutenção |
| `zapp.rpc_refresh_daily_metrics` | (inferido: evo tables) | 🟠 OPERACIONAL — refresh de métricas |
| `zapp.rpc_run_full_test_suite` | (inferido: evo tables) | 🟢 TESTE — suite de testes |
| `zapp.zapp_isonwa_mark` | (inferido: evo.evolution_whatsapp_check_queue) | 🔴 VIOLAÇÃO — marca status WA diretamente em evo |
| `zapp.zapp_isonwa_pull` | (inferido: evo.evolution_whatsapp_check_queue) | 🔴 VIOLAÇÃO — puxa fila WA diretamente de evo |

---

## I2 — Funções `evo.*` que referenciam `zapp.*` (96 funções)

### 2.1 Funções COM migration (22 auditáveis por código)

**Classificação per ADR-DB-002 + análise deste E25:**

| Função | Refs zapp | Classe ADR-DB-002 | Classe E25 | Migration |
|--------|:---:|---|---|---|
| `evo.fn_log_assignment_change` | 1 | NEGÓCIO — escrita em `zapp.conversation_events` | 🔴 VIOLAÇÃO NEGÓCIO | `20260807102155_...` |
| `evo.sync_contact_intelligence` | 2 | NEGÓCIO — DELETE em `zapp.contact_intelligence`, chama `zapp.upsert_contact_intelligence` | 🟠 PARCIAL — metade via RPC contrato | `20260807102155_...` |
| `evo.fn_detect_401_bursts` | 8 | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260814150000_...` |
| `evo.fn_detect_spurious_closes` | 2 | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260806125000_...` |
| `evo.fn_peak_hours_sla_check` | 4 (via ref) | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260806125000_...` |
| `evo.fn_wpp2_uptime_kpi` | 6 | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260807110002_...` |
| `evo.fn_update_instance_health` | 4 | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260807101000_...` |
| `evo.fn_pipeline_health_probe` | 7 | MONITORIA | 🟡 EXCEÇÃO FORMAL | `20260807270000_...` |
| `evo.fn_canonical_route_check_daily` | 3 | — | 🟠 OPERACIONAL — escreve em `zapp.warroom_alerts` | `20260808260000_...` |
| `evo.fn_canonical_route_decision` | 2 | — | 🟠 OPERACIONAL | `20260808260000_...` |
| `evo.fn_checar_inbound_zerado` | 6 | — | 🟡 MONITORIA — verifica inbound silencioso | `20260814010000_...` |
| `evo.fn_shadow_snapshot_daily` | 3 | — | 🟡 MONITORIA — snapshot de shadow mode | `20260808260000_...` |
| `evo.fn_check_401_rate` | 2 | — | 🟡 MONITORIA | `20260807...` |
| `evo.fn_check_ack_stall` | 4 | — | 🟡 MONITORIA | `20260807...` |
| `evo.fn_sync_groups_from_api` | lê `zapp.whatsapp_connections` | — | 🔴 VIOLAÇÃO — lê config do app para sincronizar grupos | `20260811130000_...` |
| `evo.fn_upsert_group_from_event` | 9 | — | 🔴 VIOLAÇÃO — operação de negócio em zapp | `20260811130000_...` |
| `evo.fn_upsert_group_participants` | 14 | — | 🔴 VIOLAÇÃO — operação de negócio em zapp | `20260811130000_...` |
| `evo.fn_mark_status_viewed` | 1 | — | 🟡 DELEGAÇÃO — chamada de UI via evo | `20260811140000_...` |
| `evo.fn_touch_contact_presence` | 1 | — | 🟡 DELEGAÇÃO | `20260811140000_...` |
| `evo.fn_resolve_contact_id_by_jid` | 1 | — | 🟡 OPERACIONAL — lookup em zapp | `20260811130000_...` |
| `evo.fn_monitor_lid_contamination` | 4 | — | 🟡 MONITORIA | `20260807...` |
| `evo.fn_delete_test_contacts` | 1 | — | 🟢 TESTE — função de teste | `20260810200300_...` |
| `evo.search_contacts_gin` | 2 | — | 🔴 VIOLAÇÃO — busca de negócio em zapp | `(migration referenciada)` |

### 2.2 Funções SEM migration (74 — RISCO CRÍTICO)

> ⚠️ **74 funções evo com refs zapp existem APENAS no DB de prod, sem migration.**
> Impossível auditar o código sem acesso direto via `SELECT prosrc FROM pg_proc` no DB.

**Distribuição por volume de refs (top 20 — maior risco de acoplamento):**

| Função | Refs zapp | Categoria Inferida |
|--------|:---:|----|
| `evo.fn_test_normalizer_deep` | 24 | 🟢 TESTE (nome sugere) |
| `evo.fn_repontar_filhas_graveyard` | 17 | 🟠 MANUTENÇÃO — reaponta schemas |
| `evo.fn_upsert_group_participants` | 14 | 🔴 VIOLAÇÃO (versão não-migrada) |
| `evo.fn_apply_lid_mappings` | 9 | 🟠 LID — mapeamento de identidade |
| `evo.fn_lid_normalizer_test_suite` | 9 | 🟢 TESTE |
| `evo.fn_upsert_group_from_event` | 9 | 🔴 VIOLAÇÃO (versão não-migrada) |
| `evo.fn_detect_401_bursts` | 8 | 🟡 MONITORIA (versão não-migrada) |
| `evo.fn_e2e_media_probe` | 7 | 🟢 TESTE E2E |
| `evo.fn_pipeline_health_probe` | 7 | 🟡 MONITORIA (versão não-migrada) |
| `evo.fn_checar_inbound_zerado` | 6 | 🟡 MONITORIA (versão não-migrada) |
| `evo.fn_lid_regression_suite` | 6 | 🟢 TESTE |
| `evo.fn_link_orphan_messages` | 6 | 🟠 MANUTENÇÃO |
| `evo.fn_trigger_audio_transcription` | 6 | 🔴 VIOLAÇÃO — negócio cross-schema |
| `evo.fn_wpp2_uptime_kpi` | 6 | 🟡 MONITORIA (versão não-migrada) |
| `evo.fn_analytics_wal_watchdog` | 5 | 🟡 MONITORIA |
| `evo.fn_cache_warmup_after_vacuum` | 5 | 🟡 MONITORIA |
| `evo.fn_check_wal_slot_health` | 5 | 🟡 MONITORIA |
| `evo.fn_cleanup_test_artifacts` | 5 | 🟢 TESTE |
| `evo.fn_post_upgrade_verify` | 5 | 🟠 MANUTENÇÃO |
| `evo.fn_update_instance_health` | 4 | 🟡 MONITORIA (versão não-migrada) |

**Demais 54 funções:** 1–4 refs cada · mistura de monitoria, testes, manutenção e possíveis violações de negócio não auditáveis sem acesso ao DB.

---

## Categorização Consolidada

### I1 — zapp.* → evo.*

| Categoria | Funções | Descrição | Ação |
|-----------|:-------:|-----------|------|
| 🔴 **VIOLAÇÃO DIRETA** | ~12 (estimativa) | Acesso direto a tabelas evo que não têm view de contrato em zapp | Refatorar: criar RPC evo ou mover lógica |
| 🟠 **OPERACIONAL** | ~8 | Operações de manutenção/log que cruzam o schema | Avaliar por função; alguns podem virar evo.* |
| 🟡 **MONITORAMENTO** | ~10 | Leitura de métricas/health de evo; análogo ao padrão de monitoria | Documentar como exceção formal ou migrar para `ops.*` |
| 🟡 **DELEGAÇÃO** | ~4 | Chama funções evo como wrappers zapp | Aceitável se contratado; documentar |
| 🟢 **TESTE** | ~0 nas migrations | Funções de teste/smoke | Mover para schema `ops` ou remover |
| ✅ **LEGÍTIMA** | 9 (confirmadas via migration) | Acessa via views de contrato `zapp.evolution_*` | Manter |

### I2 — evo.* → zapp.*

| Categoria | Funções | Descrição | Ação |
|-----------|:-------:|-----------|------|
| 🔴 **VIOLAÇÃO NEGÓCIO** | 3 (in migrations) + N (só DB) | Lógica de negócio evo escrevendo/lendo em zapp | Refatorar para RPC zapp ou mover fn para zapp |
| 🟡 **EXCEÇÃO FORMAL (MONITORIA)** | 17 (per ADR-DB-002) | Documentada — escreve alertas em tabelas ops de zapp | Manter + formalizar em ADR |
| 🟠 **OPERACIONAL NÃO-CATEGORIZADO** | ~10 | Sem classificação no ADR-DB-002 | Auditar via DB de prod |
| 🟢 **TESTE** | ~10 | Funções de test suite, normalizer tests | Mover para schema `ops` ou prefixar `_test_` |
| ❓ **NÃO AUDITÁVEL** | 74 | Só no DB, sem migration | **Ação urgente: recuperar DDL via `pg_get_functiondef`** |

---

## Violações de Alta Prioridade (Quick Wins)

### P1 — Código disponível nas migrations (ação imediata)

1. **`evo.fn_log_assignment_change`** — escrita em `zapp.conversation_events`
   - Correção: mover trigger function para `zapp.*` ou criar RPC `zapp.log_assignment_change`
   - Impacto: remove 1 função NEGÓCIO do I2

2. **`evo.sync_contact_intelligence`** — DELETE direto em `zapp.contact_intelligence`
   - Correção: criar RPC `zapp.rpc_purge_contact_intelligence(contact_id)` e chamar via PERFORM
   - A chamada a `zapp.upsert_contact_intelligence` já é o padrão correto (manter)
   - Impacto: remove 1 função NEGÓCIO do I2

3. **`zapp.fn_upsert_lid_identity`** — escreve diretamente em `evo.contact_identity` e `evo.lid_phone_map`
   - Correção: criar RPC `evo.rpc_upsert_lid_identity(lid, phone)` e delegar
   - Impacto: remove 1 violação de I1

4. **`evo.fn_upsert_group_from_event` / `evo.fn_upsert_group_participants`** — operações de negócio em zapp
   - Correção: mover para `zapp.*` ou criar RPCs de contrato
   - Impacto: remove 2 violações NEGÓCIO do I2 (alta contagem: 9 + 14 refs)

5. **`evo.fn_sync_groups_from_api`** — lê `zapp.whatsapp_connections` diretamente
   - Correção: criar view `public.whatsapp_connections` (já existe?) ou RPC de lookup
   - Impacto: remove 1 violação do I2

### P2 — Requer auditoria no DB de prod primeiro

6. Recuperar DDL das **74 funções evo sem migration** via:
   ```sql
   SELECT proname, pg_get_functiondef(oid) 
   FROM pg_proc 
   WHERE pronamespace = 'evo'::regnamespace 
     AND proname IN (
       'fn_repontar_filhas_graveyard', 'fn_apply_lid_mappings',
       'fn_trigger_audio_transcription', 'fn_link_orphan_messages'
       -- ... lista completa em evo_zapp_refs.json
     );
   ```
   Criar migrations `RESCUE_*` para versionar as funções antes de corrigir.

7. Recuperar DDL das **25 funções zapp sem migration** via:
   ```sql
   SELECT proname, pg_get_functiondef(oid)
   FROM pg_proc 
   WHERE pronamespace = 'zapp'::regnamespace
     AND proname IN ('fn_normalize_send_jid', 'fn_reconcile_apply', 'zapp_isonwa_mark', ...)
   ```

---

## Impacto no Score ao Corrigir

O score atual de `docs/decouple/SCORECARD_V4.md` não discrimina I1/I2 explicitamente. Estimativa de impacto por dimensão:

| Dimensão | Score Atual | Impacto I1/I2 | Score Projetado |
|----------|:-----------:|---------------|:-----------:|
| D2 — Migração física evo→zapp | 9/10 | Corrigir violações NEGÓCIO I2 (fn_log_assignment_change, sync_contact_intelligence) → +0,5 | **9.5** |
| D5 — Gateway edge (SQL) | 10/10 | Sem impacto direto (já cobre edge functions, não SQL interno) | **10** |
| D8 — Modelo canônico | 10/10 | Sem impacto direto | **10** |
| D10 — Governança CI | 9/10 | Adicionar gate SQL cross-schema (decouple-guard) → +0,5 | **9.5** |
| **Média** | **9.4** | Corrigir P1 + versionar DDL sem migration | **~9.6** |

---

## Risco de Drift (sem ação)

- **Risco principal:** 74 + 25 = **99 funções** existem no DB de prod sem migration correspondente.
  Se o DB for recriado a partir das migrations, essas funções desaparecem silenciosamente.
- **Risco secundário:** O CI gate `decouple-guard.yml` bloqueia nova infra evolution no repo,
  mas **não bloqueia** SQL cross-schema nas migrations — uma nova migration pode adicionar I1/I2
  sem detecção automática.
- **Recomendação de gate CI:** Adicionar ao `decouple-guard.yml` um check SQL que rejeite
  migrations contendo `evo.` dentro de blocos `CREATE FUNCTION.*zapp\.` e vice-versa.

---

## Próximos Passos Acionáveis

| # | Ação | Responsável | Esforço | Impacto |
|---|------|-------------|---------|---------|
| E25.1 | Recuperar DDL das 74 fns evo sem migration via `pg_get_functiondef` e criar migrations RESCUE | E25 agent | 2h | Auditabilidade completa |
| E25.2 | Recuperar DDL das 25 fns zapp sem migration | E25 agent | 1h | Auditabilidade |
| E25.3 | Corrigir `evo.fn_log_assignment_change` → RPC zapp | E30+ | 30min | Remove violação NEGÓCIO I2 |
| E25.4 | Corrigir `evo.sync_contact_intelligence` → RPC purge | E30+ | 30min | Remove violação NEGÓCIO I2 |
| E25.5 | Corrigir `zapp.fn_upsert_lid_identity` → RPC evo | E30+ | 45min | Remove violação I1 de dados |
| E25.6 | Mover `evo.fn_upsert_group_*` para schema zapp | E30+ | 1h | Remove 23 refs de I2 |
| E25.7 | Adicionar gate SQL ao `decouple-guard.yml` | CI | 2h | Previne regressão |
| E25.8 | Formalizar exceção MONITORIA no ADR-DB-002 (as 17 fns) | DOC | 30min | Clareza arquitetural |

---

## Referências

- `docs/db/adrs/ADR-DB-002.md` — Fronteira evo→zapp; inventário das 20 fns monitoria+negócio
- `docs/decouple/baseline/20260815/zapp_evo_refs.json` — Ground truth I1 do DB de prod (34 fns, 82+ refs)
- `docs/decouple/baseline/20260815/evo_zapp_refs.json` — Ground truth I2 do DB de prod (96 fns)
- `docs/decouple/ADR-014-PHASE2-PLAN.md` — Plano Fase 2 com I1/I2 como gates
- `docs/decouple/DECOUPLING.md` — Inventário de invariantes (I1–I9)
- `docs/decouple/CREDENTIAL_BOUNDARY.md` — Análise de fronteira de credenciais

