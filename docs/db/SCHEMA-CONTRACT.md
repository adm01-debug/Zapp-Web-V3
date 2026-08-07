# Contrato de Schemas — Documento Normativo

**Versão:** 2.1 · **Data:** 06/08/2026 · **Etapa 5 do plano DB** (atualizado na Etapa 30 do plano de integridade de referências).

> Define, por schema: **dono**, conteúdo **permitido**, conteúdo **proibido**, e direção de dependência.  
> Qualquer objeto novo precisa respeitar este contrato. Violações devem falhar no CI (etapa 50) — incluindo o **guardrail de integridade de referências** (Q-1: função→objeto; Q-2: cron→função), ativo desde 2026-08-06 via `scripts/sql/check-reference-integrity.sql` (workflow `.github/workflows/db-reference-integrity.yml`) e `ops.fn_check_reference_integrity()`.  
> Para devs humanos **e** agentes LLM — leia antes de criar qualquer objeto.

---

## Diagrama de dependência

```
  ┌──────────────────────────────────────────────────────────────────┐
  │   public  (CAMADA DE API — PostgREST /rest/v1/* )                │
  │   SÓ views security_invoker + RPC. ZERO tabela de negócio.       │
  └───────────────────────────┬──────────────────────────────────────┘
                              │  (lê via views security_invoker)
         ┌────────────────────┼────────────────────────┐
         ▼                    ▼                         ▼
   ┌──────────┐       ┌─────────────┐         ┌──────────────────┐
   │   zapp   │──────▶│     evo     │         │ bpm / vendas /   │
   │ App ZAPP │contrat│  Evolution  │         │ financeiro /     │
   │ (dados)  │curado │  (dados WA) │         │ email_app / ai / │
   └──────────┘       └─────────────┘         │ logistica/artes  │
         │                    ▲               └──────────────────┘
         │             PROIBIDO: evo
         │             nunca lê zapp
         ▼
  ┌──────────────────────────────┐
  │  ops / monitoring            │
  │  (infra, guardrails, saúde)  │
  └──────────────────────────────┘
```

**Regras de dependência:**
- `public → domínios` (lê via views) ✓
- `zapp → evo` (via contrato curado de views/RPC) ✓
> - **EXCEÇÃO FORMAL (ADR-DB-004):** 32 FKs diretas `zapp.*.contact_id → evo.evolution_contacts(id)` — integridade referencial de identidade de contato (18 CASCADE / 11 NO ACTION / 3 SET NULL).
- `evo → zapp` **PROIBIDO** — Evolution nunca depende do app
- `domínios → plataforma` (auth, storage, etc.) — somente para autenticação/storage nativo
- `evo → ops` **PROIBIDO** — ferramental de ops não deve viver no `evo`

---

## Contratos por schema

### `evo` — Domínio: Integração Evolution/WhatsApp
- **Dono:** time de integração WhatsApp
- **Schema físico em:** `supabase.atomicabr.com.br`
- **Pode conter:**
  - Tabelas `evolution_*` e suas partições mensais (23 partições por conjunto)
  - `contact_id_graveyard` (domínio Evolution)
  - Funções de pipeline/partição da Evolution: `fn_auto_create_next_partitions`, `fn_link_orphan_messages`, `fn_normalize_remote_jid`, `fn_ensure_evolution_backcompat_views`, `fn_burnin_monitor`, `fn_detect_*`, `fn_flag_poison_messages`, `fn_block_internal_media_url`, etc.
  - Views de apresentação `evo.mv_*` (matviews de KPIs Evolution)
- **NÃO pode conter:**
  - Ferramental de ops/observabilidade VPS (→ `ops`)
  - Lógica de produto do app ZAPP Web (→ `zapp`)
  - Qualquer referência a tabelas de `zapp`
- **⚠️ Fora do lugar hoje** (etapa 9 — repatriar para `ops`):
  - Tabelas: `vps_comments`, `vps_diagnostic_runs`, `vps_etapas`, `vps_performance_snapshots`, `vps_scenario_status`, `vps_scenarios`, `vps_status_history`, `ops_runbooks`, `migration_watermark`, `_secure_config`, `idx_usage_audit`, `_snapshot_version_state`
  - Funções: `fn_vps_dashboard_summary`, `fn_vps_health_score`, `fn_vps_risk_report`, `fn_vps_next_priority`, `fn_vps_go_live_check`, `fn_vps_refresh_dashboard`, `fn_vps_category_breakdown`, `pr_vps_update_status`, `trg_fn_vps_status_audit`

---

### `zapp` — Domínio: Produto (App ZAPP Web)
- **Dono:** time do app
- **Pode conter:**
  - Tabelas do app: `profiles`, `empresas`, `contatos`, `workspaces`, `workspace_members`, `webhook_*`, `app_notifications`, `audit_logs`, `user_roles`, etc.
  - RPCs expostas via API: `rpc_*` (174 funções)
  - Lógica de produto: `fn_*` (417 funções de negócio)
  - Views de contrato curado do `evo` (conjunto mínimo que o app consome)
  - Matviews do app: `mv_dashboard_*`, `mv_agent_*`
- **NÃO pode conter:**
  - Tabelas base que dupliquem dados do `evo` (só views)
  - Cópias de dados de outros schemas como tabelas base
- **⚠️ Ponto de atenção (ADR-DB-002 — etapa 12):**
  - Hoje há 254 views espelhando o `evo` e ~30 funções `zapp.fn_*` que operam o pipeline WhatsApp (ex.: `fn_reconcile_dispatch`, `fn_check_evolution_pipeline_health`). A fronteira app↔integração precisa de decisão formal.

---

### `public` — Camada de API (PostgREST)
- **Dono:** plataforma/API
- **Por que existe:** o PostgREST expõe o schema `public` por padrão; o app chama `/rest/v1/*`; as views aqui são o "corredor" que expõe os dados sem reconfigurar o PostgREST.
- **Pode conter:**
  - Views `security_invoker=on` apontando para schemas de domínio
  - Funções RPC de contrato (expostas via PostgREST)
- **NÃO pode conter:**
  - Qualquer tabela com dado de negócio
  - Extensões (→ `extensions`)
  - Lógica nova (toda lógica nova vai no schema dono)
- **⚠️ Fora do lugar hoje:**
  - 1 tabela base: `_wal_slot_guard_events` → mover para `ops` (etapa 7)
  - 9 extensões: `amcheck`, `btree_gin`, `dblink`, `hypopg`, `index_advisor`, `pg_buffercache`, `pg_trgm`, `unaccent`, `vector` → mover para `extensions` (etapa 8, ALTO RISCO)
- **Regra crítica:** ao criar/alterar uma view em `public`, use a função geradora `evo.fn_ensure_evolution_backcompat_views` para views `evolution_*`. Nunca DDL avulso — a view volta em ≤6h. Ver [`BACKCOMPAT-VIEWS.md`](./BACKCOMPAT-VIEWS.md).

---

### `bpm` — Módulo BPM
- **Dono:** time de BPM/workflows
- **Contém:** 41 tabelas de BPM, funções e triggers de workflow
- **NÃO contém:** objetos de outros módulos
- **Consumido por:** `public` via views (41 views apontam para `bpm`)

---

### `email_app` — Módulo E-mail
- **Dono:** time de integrações
- **Contém:** 33 tabelas de e-mail (`gmail_*`, `email_*`, `imap_*`)
- **Tabelas adicionadas à publicação Realtime:** `email_accounts`, `email_threads` (migration `20260724000006`)
- **Atenção:** `createZappAdminClient()` usa `db: 'zapp'` — as tabelas `gmail_*` etc. precisam de VIEW proxy em `zapp` (migration `20260724000050`).

---

### `ai` — Módulo IA/Agentes
- **Dono:** time de IA
- **Contém:** 31 tabelas (embeddings, agentes, telemetria de IA)
- **Extensão `vector`** está em `public` (deve ir para `extensions` — etapa 8)

---

### `financeiro` — Módulo Financeiro
- **Dono:** time financeiro
- **Contém:** 16 tabelas + 11 views + 45 funções
- **Tabelas adicionadas ao Realtime:** `payment_links` (migration `20260724000006`)
- **Índices duplicados:** `colaboradores` e `vendas_unificadas` têm duplicata (etapa 27)

---

### `vendas` — Módulo Vendas
- **Contém:** 14 tabelas + 5 views + 21 funções

---

### `logistica` — Módulo Logística
- **Contém:** 3 tabelas, 2 triggers

---

### `artes` — Módulo Artes/Design
- **Contém:** 2 tabelas, 1 view, 15 funções, 1 trigger

---

### `ops` — Infra e Observabilidade
- **Dono:** time de plataforma
- **Contém:** auditoria DDL (`ddl_audit`), guardrails, health checks, sentinelas de backup, crons de infra
- **NÃO contém:** dado de negócio
- **Receberá (etapas 7+9):** `_wal_slot_guard_events` (de `public`) + 12 tabelas de ops atualmente no `evo`
- **É dono do guardrail de integridade de referências (desde 2026-08-06):** `ops.fn_check_reference_integrity()` (queries Q-1/Q-2, read-only, fail-closed) e `ops._infra_check_log` (registro `score`/`issues`/`detail` dos checks). O role de auditoria `supabase_read_only_user` tem `SELECT` em `cron.job`/`cron.job_run_details` (migration `20260806124000_db05_grants_cron_observability.sql`).

---

### `monitoring` — Monitoramento
- **Contém:** 13 views de monitoramento do banco
- **Usadas por:** painel de saúde do banco

---

### `archive` — Dados frios/backups
- **Contém:** backups datados (`*_backup_YYYYMMDD`), tabelas depreciadas
- **NÃO contém:** objetos vivos em uso pelo app
- **RLS:** 10 tabelas sem policy — todas documentadas como service_role-only (backup)

---

### `_backups` e `parity_audit`
- **Decisão pendente** (etapa 15): mover para `archive`/`ops` ou documentar propósito

---

### Schemas de plataforma (NÃO TOCAR)
`auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `graphql_public`, `extensions`, `cron`, `pgmq`, `supabase_functions`, `supabase_migrations`, `_analytics`.

---


## Exceções de integridade referencial (ADR-DB-004 — 06/08/2026)

FKs diretas entre schemas são exceção formal, permitidas apenas para (a) proxys de identidade — alvo `evo.evolution_contacts(id)` ou `zapp.profiles(id)` — ou (b) entidades compartilhadas de negócio (ex.: `logistica.transportadoras`, `logistica.cotacoes`, `zapp.sales_deals`, `email_app.email_accounts`). Inventário vigente: 32× zapp→evo (todas → evolution_contacts); 12× entre módulos (email_app→evo 3, email_app→zapp 2, vendas→logistica 2, zapp→email_app 1, ai→zapp 1, financeiro→evo 1, financeiro→logistica 1, financeiro→zapp 1); 3× intra-zapp (extensions→tenants, queues→sla_policies, sla_violations→sla_policies). **`sla_policies` e `tenants` NÃO são schemas** — são tabelas em `zapp`: `tenants` = config do Realtime Server (1 linha, `realtime-dev`); `sla_policies` = dormante (0 linhas, 2 FKs apontando). Nova FK direta exige justificativa no PR; CI-06 (informativo) monitora o total de 32.

## Storage (buckets) — contrato de visibilidade

| Bucket | Visibilidade correta | Estado atual | Ação |
|---|---|---|---|
| `whatsapp-media` | 🔴 **privado** (URL assinada) | ⚠️ público | Etapa 22 — urgente (9,56 GB, PII) |
| `recibos-entrega` | 🔴 privado | ⚠️ público | Etapa 22 — avaliar PII |
| `comprovantes-financeiro` | privado | ✓ privado | OK |
| `email-attachments` | privado | ✓ privado | OK |
| `etiquetas-remessa` | privado | ✓ privado | OK |
| `fechamentos` | privado | ✓ privado | OK |
| `audio-messages` | privado | ✓ privado | OK |
| `team-chat-files` | privado | ✓ privado | OK |
| `quarantine` | privado | ✓ privado | OK |
| `avatars` | público aceitável | público | OK (sem PII) |
| `audio-memes` | público aceitável | público | OK |
| `custom-emojis` | público aceitável | público | OK |
| `stickers` | público aceitável | público | OK |

---

## Checks de CI (implementados na etapa 50)

```sql
-- CI-01: Nenhuma tabela de negócio no public
SELECT count(*) FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE '\_%'  -- exceção: tabelas internas supabase
HAVING count(*) > 0;  -- FAIL se > 0

-- CI-02: Nenhuma extensão de negócio em public
SELECT count(*) FROM pg_extension
WHERE extnamespace = 'public'::regnamespace::oid
HAVING count(*) > 0;  -- FAIL se > 0

-- CI-03: evo não referencia zapp
SELECT count(*) FROM pg_depend d
JOIN pg_class c ON c.oid = d.objid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class rc ON rc.oid = d.refobjid
JOIN pg_namespace rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'evo' AND rn.nspname = 'zapp'
HAVING count(*) > 0;  -- FAIL se > 0

-- CI-04: Toda view tem security_invoker=on
SELECT count(*) FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
WHERE NOT (c.reloptions @> ARRAY['security_invoker=on'])
  AND v.schemaname IN ('public','zapp')
HAVING count(*) > 0;  -- FAIL se > 0

-- CI-05: Toda função SECURITY DEFINER tem search_path fixo
SELECT count(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef = true
  AND NOT (p.proconfig @> ARRAY['search_path=zapp']
        OR p.proconfig @> ARRAY['search_path=evo']
        OR p.proconfig @> ARRAY['search_path=ops'])
  AND n.nspname IN ('zapp','evo','ops','public')
HAVING count(*) > 0;  -- FAIL se > 0
```
