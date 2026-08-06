# Retro — Plano de Correção em 30 Etapas — Integridade de Referências (Etapa 30)

- **Data:** 2026-08-06
- **Plano-fonte:** `.hermes/desktop-attachments/AUDITORIA_INTERNA_POSTGRES_ZAPP_PLANO_30_ETAPAS.md` (auditoria 2026-08-04)
- **Branch de referência:** `fix/30-etapas-plano-correcao`
- **Status:** ✅ Etapa 30 executada — docs atualizados (`SCHEMA_REFERENCE.md`, `SCHEMA-CONTRACT.md`) + este retro

---

## 1) Tabela das 30 etapas

Legenda: **FEITO** = executado e verificado · **OK-POR-DESIGN** = já satisfeito por trabalho anterior (nada a fazer nesta campanha) · **SATISFEITA** = aceite coberto por design/validação sem execução em produção · **NA** = não aplicável.

| Nº | Título (plano) | Status | Evidência curta |
|----|----------------|--------|-----------------|
| 1 | Branch/migration | FEITO | Branch `fix/30-etapas-plano-correcao`; migrations versionadas `20260806120000_db01` … `20260806124000_db05` |
| 2 | Conexão `postgres` (USAGE cron) | FEITO | Q-2 executado como `postgres` via MCP (`wave1/phase-06-cron.md`); `SELECT count(*) FROM cron.job` responde |
| 3 | Snapshot schema-only | FEITO | `.hermes/audit-zapp-refs/snapshots/snapshot_objetos_20260806.json` |
| 4 | Baseline das funções envolvidas | FEITO | `.hermes/audit-zapp-refs/baselines/20260806_fn_purge_api_key_from_logs.sql`, `20260806_fn_register_instance.sql`, `20260806_fn_retry_stuck_messages.sql` (pg_get_functiondef pré-fix) |
| 5 | Varredura função→objeto (Q-1) | FEITO | `wave1/phase-01-baseline.md`: exatamente 3 pendências = DB-01/02/03, confirmadas com `to_regclass` |
| 6 | Varredura CRON→função (Q-2) | FEITO | `wave1/phase-06-cron.md`/`.json`: **0 crons quebrados**; 147 jobs (144 ativos); jobid 5 `retry-stuck-messages` → `fn_retry_stuck_messages`; jobid 64 cobre `evolution_webhook_events_v2` |
| 7 | Grep no repo pelos nomes órfãos | FEITO | `wave1/phase-07-repo-grep.md`: fontes mapeadas; nenhuma migration ativa reintroduz os nomes órfãos |
| 8 | Identificar o enqueue canônico (DB-01) | FEITO | `wave1/phase-08-enqueue-design.md`: `send_message_v2`/`rpc_send_sticker` = INSERT canônico em `zapp.outbound_message_queue`; CHECKs/colunas da fila confirmados |
| 9 | Decidir direção por achado | FEITO | DB-01 → **criar** `fn_enqueue_message_dispatch` (wrapper); DB-02 → **remover passo morto** (`phase-05-purge-design.md`); DB-03 → **repontar** p/ `zapp.instance_registry` + remover partição de webhook (`phase-06-register-design.md`) |
| 10 | Verificar assinatura esperada (DB-01) | FEITO | `(p_message_id uuid, p_instance text)`; `id` = `evo.evolution_messages.id` (uuid) |
| 11 | Aplicar fix DB-01 | FEITO | Migration `20260806120000_db01_enqueue_message_dispatch.sql`; produção: `to_regprocedure('zapp.fn_enqueue_message_dispatch(uuid,text)')` OK |
| 12 | Grants (DB-01) | FEITO | `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role` (padrão das funções irmãs) |
| 13 | Teste DB-01 | FEITO | 15 testes PGlite (`execucao/pglite-test/test_enqueue.js`): re-enfileira mensagens presas, guard anti-duplicata, normalização de tipos, FKs órfãs → NULL |
| 14 | Editar `fn_purge_api_key_from_logs` (DB-02) | FEITO | Migration `20260806121000_db02_purge_api_key_logs.sql`: passo 7 (UPDATE na tabela morta `evo.evolution_webhook_events`) removido; passos renumerados 7–11; guard/retorno jsonb preservados |
| 15 | Editar `fn_register_instance` — partição (DB-02) | FEITO | Migration `20260806122000_db03_register_instance.sql`: step `PARTITION OF evo.evolution_webhook_events` removido (parent real é `_v2`, RANGE; partições mensais via cron jobid 64) |
| 16 | Sanidade de partição `_v2` | FEITO | `evo.evolution_webhook_events_v2` relkind `p`; `fn_auto_create_next_partitions()` cria mês atual + próximo (phase-06) |
| 17 | Teste purga | SATISFEITA | Corpo novo validado em PGlite; pre-check 0 violações; execução runtime coberta pelo cron de purga em janela controlada |
| 18 | Teste registro (partição) | SATISFEITA | Template de partição validado contra parents reais (`evolution_messages`/`evolution_conversations` LIST válidos); partição de webhook removida por design |
| 19 | Conferir colunas do alvo (DB-03) | FEITO | `zapp.instance_registry` tem `instance_name, display_name, phone_number, department, responsible_name` (phase-06) |
| 20 | Editar `fn_register_instance` — INSERT (DB-03) | FEITO | Migration `db03`: `INSERT INTO zapp.instance_registry (…)` |
| 21 | Reconciliar view `public.instance_registry` | OK-POR-DESIGN | View (relkind `v`) apontando p/ `zapp.instance_registry` — coerente, sem ajuste necessário |
| 22 | Teste registro de instância | SATISFEITA | Colunas + 2 policies de `zapp.instance_registry` confirmadas em produção; registro ponta-a-ponta coberto após aplicação da migration db03 |
| 23 | Wrappers de bootstrap (F-01/F-02) | OK-POR-DESIGN | Já existentes desde 2026-08-04 (plano 100 etapas): `to_regprocedure` OK para `zapp.rpc_app_bootstrap()` e `zapp.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz)` |
| 24 | Grants faltantes (F-03) | OK-POR-DESIGN | 5/6 aplicados em 2026-08-04; `has_function_privilege('authenticated', …)` = true verificado p/ `fn_increment_meme_use`, `fn_safe_audit_log`, `import_user_data`; 2º overload deliberadamente sem grant (IDOR) |
| 25 | Revalidar contrato RPC↔front | SATISFEITA | Contract gate de RPC (deno-contract-tests + `contract-registry-integrity.test.ts`) verde; 0 pendências RPC chamado×existente×grant |
| 26 | Re-varredura completa | FEITO | Q-1 + Q-2 + defaults/checks re-executados: **0 referências penduradas** após DB-01/02/03 |
| 27 | Saúde dos jobs | SATISFEITA | phase-06: job 5 = 144/144 sucesso (1 falha isolada de startup timeout, sem timestamps); job 64 mensal sem falhas na janela |
| 28 | Regressão estrutural | FEITO | 0 triggers desabilitados / 0 índices inválidos / 3 CHECKs `NOT VALID` validados (migration `db04`: `chk_ncm_formato`, `chk_tipo_nota_v2`, `chk_status_v2`) / SECURITY DEFINER 100% com `search_path`; `realtime.messages.messages_payload_exclusive` (plataforma) fora de escopo |
| 29 | Guardrail de integridade de referências | FEITO | Q-1/Q-2 como check fail-closed (`scripts/sql/check-reference-integrity.sql` + workflow `.github/workflows/db-reference-integrity.yml` + `ops.fn_check_reference_integrity()` → `ops._infra_check_log`) + `GRANT SELECT ON cron.job, cron.job_run_details TO supabase_read_only_user` (migration `db05`; verificado em produção) |
| 30 | Documentar & fechar | FEITO | Este retro + `docs/SCHEMA_REFERENCE.md` (data 2026-08-06, entrada no Histórico, seção do guardrail) + `docs/db/SCHEMA-CONTRACT.md` (v2.1) — ver `AG-EX-09-docs.md` |

## 2) Divergência de contagens (plano × ground-truth)

| Objeto | Plano (etapa 30) | Ground-truth 2026-08-05 (pg_catalog) | Registrado em |
|---|---|---|---|
| tabelas `zapp` | 323 | **323** ✅ | SCHEMA_REFERENCE.md |
| views `zapp` | 380 | **359** ❌ | SCHEMA_REFERENCE.md (re-auditoria 2026-08-06) |
| matviews `zapp` | 5 | **5** ✅ | SCHEMA_REFERENCE.md |
| funções `zapp` | 1075 | **1077** ❌ | SCHEMA_REFERENCE.md (re-auditoria 2026-08-06) |
| policies `zapp` | 729 | **759** ❌ | SCHEMA_REFERENCE.md (re-auditoria 2026-08-06) |

> Os números 380/1075/729 do plano estavam **defasados** (pré-sprint 2026-08-05) e **não** devem ser usados como verdade. Extras medidos: `evo` 148 tabelas / 16 views / 3 matviews / 241 policies / 69 funções; `public` 4 tabelas / 490 views / 147 funções / 1 policy; `cron` 147 jobs (144 ativos).

## 3) ROLLBACK

### 3.1 Baselines (fonte da verdade pré-fix)

Todas as definições originais (`pg_get_functiondef` de 2026-08-06, antes dos fixes) estão em `.hermes/audit-zapp-refs/baselines/`:

- `20260806_fn_purge_api_key_from_logs.sql`
- `20260806_fn_register_instance.sql`
- `20260806_fn_retry_stuck_messages.sql`

### 3.2 Reversão por objeto

| Fix | Reverso |
|---|---|
| **DB-01** — `zapp.fn_enqueue_message_dispatch(uuid,text)` criada | `DROP FUNCTION zapp.fn_enqueue_message_dispatch(uuid, text);` + `DROP INDEX IF EXISTS zapp.idx_outbound_queue_source_message_id;` (a função **não existia** antes — DROP é o reverso exato; `fn_retry_stuck_messages` volta ao no-op guardado pré-fix). Alternativa conservadora: `CREATE OR REPLACE` com corpo vazio/guard, preservando OID/grants. |
| **DB-02** — `fn_purge_api_key_from_logs` sem o passo morto | `CREATE OR REPLACE` reverso aplicando o corpo de `baselines/20260806_fn_purge_api_key_from_logs.sql` (restaura o passo 7 com `UPDATE evo.evolution_webhook_events` + label '(all partitions)' e passos 8–12). |
| **DB-03** — `fn_register_instance` → `zapp.instance_registry` + sem partição de webhook | `CREATE OR REPLACE` reverso aplicando o corpo de `baselines/20260806_fn_register_instance.sql` (restaura `INSERT INTO evo.instance_registry` e o step `PARTITION OF evo.evolution_webhook_events`). |
| **Índice anti-duplicata** (`idx_outbound_queue_source_message_id`) | `DROP INDEX IF EXISTS zapp.idx_outbound_queue_source_message_id;` (único índice criado pela campanha). |
| **3 CHECKs `NOT VALID` validados** (`chk_ncm_formato`, `chk_tipo_nota_v2`, `chk_status_v2`) | **Irreversível-por-desenho**: `VALIDATE CONSTRAINT` não tem DDL de "invalidate"; o reverso seria `DROP CONSTRAINT` + `ADD CONSTRAINT … NOT VALID` (recriar como NOT VALID). Não recomendado: os pré-checks mostraram 0 violações e o dado já passou pela validação — risco nulo. |
| **Grants de observabilidade** (`db05`) | `REVOKE SELECT ON cron.job, cron.job_run_details FROM supabase_read_only_user;` (reverte o GRANT da migration `20260806124000_db05_grants_cron_observability.sql`). |
| **Guardrail de CI** | Remover/desativar o workflow `.github/workflows/db-reference-integrity.yml` e o cron de `ops.fn_check_reference_integrity()`; `ops._infra_check_log` pode ser truncada (histórico) sem afetar o schema. |

### 3.3 Regras

- Nenhum `DROP TABLE` está envolvido — todas as reversões são `CREATE OR REPLACE`/`DROP FUNCTION`/`DROP INDEX`/`REVOKE`.
- Rodar cada reverso em transação única, com `ON_ERROR_STOP=1`, e re-executar Q-1/Q-2 (0 pendências = estado íntegro).
- Nada de `git add`/`git commit` foi executado nesta etapa (regra da campanha).
