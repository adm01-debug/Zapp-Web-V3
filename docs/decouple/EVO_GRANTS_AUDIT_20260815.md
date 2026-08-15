# E80 — Auditoria de grants SELECT em `evo` para `authenticated` (EVO_GRANTS_AUDIT)

**Arquivo:** `docs/decouple/EVO_GRANTS_AUDIT_20260815.md`
**Data da medição:** 2026-08-15
**Onda:** Fase 3 — Dono único do schema `evo` · worker E80
**Fonte dos dados:** `information_schema.role_table_grants` (medição 2026-08-15, leitura read-only) + espelho em `.hermes/fase3/grants.json` — 38 grants `SELECT` para `authenticated`
**Escopo:** schema `evo`, grantee `authenticated` (e `anon`), privilégio `SELECT`
**Status:** ✅ medido — **nada foi executado/alterado** (documento 100% read-only; zero DDL; **nenhum REVOKE aplicado**)

---

## 1. Objetivo

Medir e classificar os **38 grants `SELECT`** concedidos a `authenticated` sobre relations do
schema `evo`, separando:

- **(a) views de contrato/monitoria** (`v_*`) — monitoria legítima do pipeline Evolution;
- **(b) tabelas operacionais** (`evolution_*`, `media_*`, `idx_*`, `vps_*`) — dado Evolution
  exposto indevidamente à role autenticada do app;
- **(c) config/misc sensível** (`_secure_config`, `migration_watermark`, `ops_runbooks`,
  `media_security_config`, `media_storage_config`) — metadados internos/segredos de operação.

A meta E80 do plano de independência (`PLANO_INDEPENDENCIA_100_ETAPAS_20260815.md`):
**manter somente as views de contrato/monitoria** e **revogar** o acesso direto a toda tabela
operacional e de configuração do schema `evo`.

---

## 2. Metodologia

1. **Fonte:** `.hermes/fase3/grants.json` — espelho de `information_schema.role_table_grants`
   (medição 2026-08-15 via `pg_catalog`); nenhuma escrita, nenhum DDL, nenhum grant alterado.
2. **Filtro da medição original:** `table_schema = 'evo'`, `grantee IN ('authenticated','anon')`,
   `privilege_type = 'SELECT'` → 38 relations.
3. **Classificação por convenção de nome e função da relation** (seção 4):
   - prefixo `v_` → view de contrato/monitoria (categoria a);
   - sufixo `_config` ou grupo de controle interno (`_secure_config`, `migration_watermark`,
     `ops_runbooks`) → config/misc sensível (categoria c);
   - demais (`evolution_*`, `media_*`, `idx_usage_audit`, `vps_*`) → tabela operacional (categoria b).
4. **Risco:** `ALTO` (config/sensível e payloads PII), `MÉDIO` (operacional), `BAIXO` (views).
5. **Recomendação:** `MANTER` (views de contrato), `REVOGAR` (demais 27).
6. **Nada foi executado** — o plano de revogação da seção 6 é propositivo e requer revisão sênior + PR.

---

## 3. Query reproduzível (medição E80)

```sql
-- E80 — grants SELECT em evo para authenticated/anon
-- Uso: psql / MCP read-only / qualquer role com SELECT em information_schema
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'evo'
  AND grantee IN ('authenticated','anon')
ORDER BY table_name;
```

Executada em 2026-08-15, retorna **38 linhas** (todas `SELECT` para `authenticated`;
nenhuma para `anon`). Espelho salvo em `.hermes/fase3/grants.json`.

---

## 4. Resultado — 38 grants classificados

| # | relation | tipo | risco | recomendação |
|---:|---|---|---|---|
| 1 | `_secure_config` | config/misc (sensível) | **ALTO** | **REVOGAR** |
| 2 | `evolution_alert_cooldown` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 3 | `evolution_backfill_audit` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 4 | `evolution_bootstrap_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 5 | `evolution_connection_history` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 6 | `evolution_guardian_heartbeat` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 7 | `evolution_pipeline_health_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 8 | `evolution_pipeline_history` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 9 | `evolution_reconcile_jobs` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 10 | `evolution_retention_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 11 | `evolution_webhook_events_v2` | tabela operacional (payload PII) | **ALTO** | **REVOGAR** |
| 12 | `idx_usage_audit` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 13 | `media_cache` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 14 | `media_cleanup_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 15 | `media_dedupe_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 16 | `media_download_queue` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 17 | `media_quarantine` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 18 | `media_scan_log` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 19 | `media_security_alerts` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 20 | `media_security_config` | config/misc (sensível) | **ALTO** | **REVOGAR** |
| 21 | `media_storage_config` | config/misc (sensível) | **ALTO** | **REVOGAR** |
| 22 | `migration_watermark` | config/misc (sensível) | **ALTO** | **REVOGAR** |
| 23 | `ops_runbooks` | config/misc (sensível) | **ALTO** | **REVOGAR** |
| 24 | `v_ack_loss_candidates` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 25 | `v_bootstrap_history` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 26 | `v_dedup_failures` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 27 | `v_evolution_pipeline_health` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 28 | `v_incident_metrics_48h` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 29 | `v_pipeline_health` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 30 | `v_security_audit` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 31 | `v_spurious_close_events` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 32 | `v_unused_index_candidates` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 33 | `v_vps_go_live_checklist` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 34 | `v_vps_live_status` | view de contrato/monitoria | **BAIXO** | **MANTER** |
| 35 | `vps_comments` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 36 | `vps_diagnostic_runs` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 37 | `vps_etapas` | tabela operacional | **MÉDIO** | **REVOGAR** |
| 38 | `vps_scenario_status` | tabela operacional | **MÉDIO** | **REVOGAR** |

**Legenda de tipo:** (a) view de contrato/monitoria · (b) tabela operacional · (c) config/misc sensível

---

## 5. Verificação — contagens por classificação

| Classificação | Qtd | Recomendação |
|---|---:|---|
| (a) views de contrato/monitoria (`v_*`) | **11** | MANTER |
| (b) tabelas operacionais | **22** | REVOGAR |
| (c) config/misc sensível | **5** | REVOGAR |
| **Total** | **38** | — |

| Risco | Qtd |
|---|---:|
| ALTO | **6** |
| MÉDIO | **21** |
| BAIXO | **11** |

| Recomendação | Qtd |
|---|---:|
| REVOGAR | **27** |
| MANTER | **11** |
| REVISAR | **0** |

**Resumo executivo:** 27 relations (71%) expõem dado Evolution ou configuração interna
diretamente a `authenticated` e devem ter o `SELECT` revogado; 11 views de monitoria (29%)
são o contrato legítimo e permanecem.

---

## 6. Plano de revogação proposto (E80) — ⚠️ NÃO EXECUTADO

> Documento propositivo. Qualquer execução exige: revisão sênior → migration versionada
> (`YYYYMMDDHHMMSS`) → staging → PR. **Nenhum REVOKE foi aplicado nesta medição.**

**Princípio E80:** acesso a dado Evolution pelo app acontece **somente via views de contrato**
(`v_*`); tabela operacional/config não é exposta diretamente. Se algum consumidor legítimo
precisar de dado hoje exposto por tabela, o caminho é uma **view `security_invoker` curada na
camada `public`** (convenção `AGENTS.md`), não grant direto.

### 6.1 Fase 1 — config/misc sensível (ALTO, 5 relations)

```sql
-- E80 · Fase 1 — REVOGAR (NÃO EXECUTADO — aguarda PR/migration versionada)
BEGIN;
REVOKE SELECT ON evo._secure_config FROM authenticated;
REVOKE SELECT ON evo.media_security_config FROM authenticated;
REVOKE SELECT ON evo.media_storage_config FROM authenticated;
REVOKE SELECT ON evo.migration_watermark FROM authenticated;
REVOKE SELECT ON evo.ops_runbooks FROM authenticated;
COMMIT;
```

### 6.2 Fase 2 — tabelas operacionais (21 relations MÉDIO + 1 payload PII ALTO)

```sql
-- E80 · Fase 2 — REVOGAR (NÃO EXECUTADO — aguarda PR/migration versionada)
BEGIN;
-- ALTO: payload de webhook (PII de mensagens)
REVOKE SELECT ON evo.evolution_webhook_events_v2 FROM authenticated;
REVOKE SELECT ON evo.evolution_alert_cooldown FROM authenticated;
REVOKE SELECT ON evo.evolution_backfill_audit FROM authenticated;
REVOKE SELECT ON evo.evolution_bootstrap_log FROM authenticated;
REVOKE SELECT ON evo.evolution_connection_history FROM authenticated;
REVOKE SELECT ON evo.evolution_guardian_heartbeat FROM authenticated;
REVOKE SELECT ON evo.evolution_pipeline_health_log FROM authenticated;
REVOKE SELECT ON evo.evolution_pipeline_history FROM authenticated;
REVOKE SELECT ON evo.evolution_reconcile_jobs FROM authenticated;
REVOKE SELECT ON evo.evolution_retention_log FROM authenticated;
REVOKE SELECT ON evo.idx_usage_audit FROM authenticated;
REVOKE SELECT ON evo.media_cache FROM authenticated;
REVOKE SELECT ON evo.media_cleanup_log FROM authenticated;
REVOKE SELECT ON evo.media_dedupe_log FROM authenticated;
REVOKE SELECT ON evo.media_download_queue FROM authenticated;
REVOKE SELECT ON evo.media_quarantine FROM authenticated;
REVOKE SELECT ON evo.media_scan_log FROM authenticated;
REVOKE SELECT ON evo.media_security_alerts FROM authenticated;
REVOKE SELECT ON evo.vps_comments FROM authenticated;
REVOKE SELECT ON evo.vps_diagnostic_runs FROM authenticated;
REVOKE SELECT ON evo.vps_etapas FROM authenticated;
REVOKE SELECT ON evo.vps_scenario_status FROM authenticated;
COMMIT;
```

### 6.3 Fase 3 — manter (11 views de contrato/monitoria)

Sem ação — o grant `SELECT` a `authenticated` sobre as views `v_*` abaixo é o contrato
legítimo de monitoria e **permanece**:

```sql
-- E80 · Fase 3 — MANTER (sem ação; contrato de monitoria)
v_ack_loss_candidates, v_bootstrap_history, v_dedup_failures, v_evolution_pipeline_health, v_incident_metrics_48h, v_pipeline_health, v_security_audit, v_spurious_close_events, v_unused_index_candidates, v_vps_go_live_checklist, v_vps_live_status
```

### 6.4 Critérios de aceite (após execução futura)

1. Query da seção 3 retorna exatamente **11 linhas** (somente views `v_*`, grantee `authenticated`).
2. Nenhuma tabela `evolution_*`/`media_*`/`idx_*`/`vps_*`/config aparece no resultado.
3. Zero violação nos gates de conformidade existentes; smoke do app ZAPP Web sem regressão
   (nenhum endpoint consome as tabelas revogadas diretamente).

---

## 7. Suposições e notas

- **`media_security_config` e `media_storage_config`** foram classificadas como **config/misc
  sensível** (categoria c), não operacional, por serem tabelas de *configuração* (segurança e
  armazenamento de mídia) — mesma natureza de `_secure_config`.
- **`evolution_webhook_events_v2`** recebeu risco **ALTO** dentro da categoria (b) por carregar
  payloads crus de webhook (conteúdo de mensagens = PII).
- Nenhum grant para `anon` foi encontrado na medição (filtro da query inclui `anon` — 0 linhas).
- Este documento **não executa nada** (regra worker: onda CI + docs + análise).

---

## Anexo A — Achado W-V8 (validação exaustiva 2026-08-15): security_invoker × REVOKE

**Contexto:** o event trigger `trg_auto_security_invoker_on_ddl` (migration 20260728000001, em produção) auto-aplica `security_invoker=true` a TODA view do schema evo.

**Medição real (pg_views + reloptions, 2026-08-15):**

| Fato | Valor |
|---|---|
| Views `v_*` em evo | 29 |
| Com `security_invoker=true` | **29/29 (100%)** |
| Views que dependem de tabelas da Fase 2 (revogação proposta) | **8**: `v_bootstrap_history`, `v_incident_metrics_48h`, `v_kpi_overview`, `v_pipeline_health`, `v_production_scorecard`, `v_spurious_close_events`, `v_wpp2_uptime_24h`, `v_conversations_wpp2_enriched`* |

\* `v_conversations_wpp2_enriched` depende de tabelas de mensagens (cobertura parcial — revisar).

**Implicação crítica:** com `security_invoker=true`, a view executa com privilégios do **chamador** (authenticated). Se a Fase 2 revogar SELECT das 22 tabelas operacionais, **toda view mantida que dependa delas quebra em runtime** (`permission denied for table evo.xxx`) — o "contrato de monitoria" prometido na Fase 3 falharia e os critérios de aceite do §6 (contagens apenas) **não detectariam** a quebra.

**Plano revisado (Fase 2 com pré-requisito):**

1. **Antes de qualquer REVOKE** — teste funcional de contrato: para cada uma das 11 views mantidas, `SET ROLE authenticated; SELECT count(*) FROM evo.<view> LIMIT 1;` → deve passar.
2. Para as 8 views dependentes de tabelas da Fase 2, **escolher deliberadamente** (decisão do dono):
   - (a) manter GRANT SELECT nas tabelas base para `authenticated` (aceitar exposição das base) **OU**
   - (b) converter as views para owner-run (`ALTER VIEW evo.<view> SET (security_invoker = false)` + `GRANT SELECT ON evo.<view> TO authenticated`) — acesso só via view, base fechada. ⚠️ o event trigger reaplica `security_invoker=true` em DDL futuro sobre views evo — revisar o trigger ou recriar a view com reloption após DDL.
   - (c) não revogar as tabelas base das quais as 8 views dependem (Fase 2 parcial).
3. Critério de aceite da Fase 2 passa a incluir o teste funcional do item 1 (não só contagem).
