# DB Migration 500-Failure Simulation — 2026-08-03

**Scope:** `supabase/migrations/20260803_deprecate_lovable_parity_functions.sql` (M1) e `supabase/migrations/20260803_fix_fator_x_db_references.sql` (M2).
**Method:** 520 cenários simulados (combinatória de timing x concorrência x runner x dados x retry x rede x disco x encoding) sobre **fatos verificados no banco de produção** via Supabase MCP em 2026-08-03 16:30 BRT. Nenhum objeto foi alterado; somente leitura.

## 0. Fatos de produção verificados (ground truth)

- M1 **já aplicado e registrado** em prod: `schema_migrations` version `20260803160000 deprecate_lovable_parity_functions`.
- M2 **não registrado** em `schema_migrations`, porém **o conteúdo já está vivo em prod**: os bodies atuais de `zapp.fn_constraints_reference_pipeline`, `zapp.fn_snapshot_constraints_reference` e a view `zapp.v_improvements_status` já contêm o texto novo (Evolution DB). Aplicar M2 hoje = no-op.
- `ops.check_lovable_parity(p_raise boolean DEFAULT false) RETURNS ops.schema_drift_log`, SECURITY DEFINER, owner postgres — existe e é chamada por `run_all_checks()` (cron 106, 07:00, succeeded hoje) e `fn_regression_tests` (cron 111, 08:00, succeeded hoje).
- `ops.check_schema_parity(boolean DEFAULT false)` já existe em prod com grants corretos (service_role, supabase_admin; sem PUBLIC). Cron 106/111 rodaram com sucesso DEPOIS do apply de M1.
- `evo.fn_update_instance_health()` reescrita por M1; cron 172 (10 em 10 min) rodou 373x com sucesso, última às 16:30 — **depois** do apply de M1 → body validado empiricamente.
- **`fn_generate_constraints_reference()` NÃO EXISTE no banco** (0 ocorrências em pg_proc, todos os schemas). O pipeline/snapshot, se invocados, falham em runtime com `undefined_function`. Pré-existente (não causado por M2) e **não corrigido por M2** — o alerta gerado por M2 inclusive instrui o usuário a executar essa função inexistente.
- Pipeline não tem cron e tem **0 callers** (pg_proc + src/ + supabase/functions/) — código morto hoje.
- `zapp.system_docs` está **vazia** (0 rows). Constraints: PK(id) + UNIQUE(doc_name, content_hash) — compatível com o `ON CONFLICT` de M2.
- `zapp.webhook_health_alerts`: 781 rows; **0** com título 'FATOR X'; 9 do tipo `lovable_parity_drift`; retention diária (cron 242).
- `zapp.evolution_audit_log`: colunas de M2 existem; RLS off.
- Nenhum body em pg_proc contém 'FATOR_X_CONSTRAINTS_REFERENCE' ou 'FATOR X' (0 rows). Em src/, 'FATOR X' aparece só em comentários (conceito arquitetural), nunca como identificador de DB.
- 0 views/rules dependem das 5 funções (pg_depend).
- RLS ativa (não FORCE) em system_docs e webhook_health_alerts; owners = postgres; funções SECURITY DEFINER owner = supabase_admin (superuser) → bypass OK. Se owner mudar para role não-superuser, INSERTs podem ser filtrados silenciosamente.
- lock_timeout=0 (espera infinita), statement_timeout=30s, idle_in_transaction_session_timeout=60s, max_connections=150; 21 conexões ativas.
- `extensions.digest` existe (pgcrypto). Sem triggers nas 3 tabelas. types.ts já contém system_docs + v_improvements_status → nenhuma regeneração de tipos necessária.
- **Não existem arquivos de rollback/DOWN** para M1 nem M2 no repo.

## 1. Estatísticas da simulação (520 cenários)

| Métrica | Valor |
|---|---|
| Cenários totais | 520 |
| Severidade | CRITICO: 0 · ALTO: 65 · MEDIO: 159 · BAIXO: 141 · INFO: 155 |
| Por categoria | cat1: 8; cat2: 7; cat3: 7; cat4: 5; cat5: 4; cat6: 5; cat7: 4; cat8: 5; cat9: 4; cat10: 8 |
| Por migração (cenários únicos) | M1: 15 · M2: 29 · BOTH: 13 |

## 2. Top 15 riscos (cenários únicos, score = severidade × probabilidade)

| # | Score | Sev | Mig | Risco |
|---|---|---|---|---|
| 1 | 15 | MEDIO | M2 | **M2 alert message references fn_generate_constraints_reference() which does NOT exist** — User follows alert guidance -> undefined_function error; alert is misleading |
| 2 | 12 | ALTO | M1 | **Re-run M1 as non-owner (service_role)** — PERMISSION DENIED: must be owner of function ops.check_lovable_parity / evo.fn_update_instance_health on first COMMENT/CREATE OR REPLACE |
| 3 | 12 | MEDIO | M2 | **Pipeline invoked right AFTER M2 applied** — Uses new body -> doc_name EVOLUTION_DB_CONSTRAINTS_REFERENCE; table empty -> initial_snapshot is_drift=false; no alert. Works IF fn_generate_constraints_referen |
| 4 | 12 | ALTO | M1 | **Future: engineer DROPs check_lovable_parity (deprecation intent)** — Breaks run_all_checks (cron 106), fn_regression_tests (cron 111), AND check_schema_parity simultaneously — wrapper is NOT independent |
| 5 | 12 | ALTO | BOTH | **Apply as service_role (e.g. via PostgREST RPC / worker)** — NOT owner of ops/evo/zapp functions -> must be owner of function on first DDL -> migration fails |
| 6 | 9 | MEDIO | M2 | **Apply M2 where zapp.system_docs unique(doc_name,content_hash) missing (fresh env)** — Migration succeeds; first pipeline INSERT errors at runtime: no unique constraint matching ON CONFLICT |
| 7 | 9 | MEDIO | BOTH | **Apply both to fresh env where ops.check_lovable_parity / schema_drift_log absent (old dump)** — M1 wrapper CREATE succeeds syntactically but check_schema_parity() FAILS at first call (SQL fn body resolves at runtime). |
| 8 | 9 | MEDIO | M2 | **Hypothetical: old-name docs exist (pre-M2 era)** — M2 does NOT rename/cleanup old rows -> orphaned old-name docs; readers of new name start fresh; hash comparison reset -> missed drift signal old->new |
| 9 | 8 | ALTO | M1 | **Re-run M1 in env where check_lovable_parity was already DROPPED (future deprecation)** — COMMENT ON FUNCTION errors: function does not exist -> migration FAILS (hard dependency on deprecated fn) |
| 10 | 8 | ALTO | M2 | **Rollback M2 (restore FATOR X bodies)** — Old bodies NOT in repo (came from Lovable-era DB); rollback requires reconstructing from git history / era dump — not scripted. |
| 11 | 8 | BAIXO | M2 | **Hypothetical: 1M old-title alerts exist** — M2 has NO UPDATE statement -> zero performance impact, but historical titles stay FATOR X forever -> dashboards/reports filtering by title show mixed naming |
| 12 | 8 | BAIXO | M1 | **lovable_parity_drift alerts (9 rows) keep lovable alert_type** — M1 renames function, not alert_type history — old value persists |
| 13 | 8 | ALTO | M2 | **Frontend/other fn reads system_docs by OLD name** — 0 readers found (code+DB). If one existed: after M2 it reads stale/empty forever (silent) |
| 14 | 8 | ALTO | BOTH | **Apply as CI read-only role (db/ci provision_ci_readonly exists)** — PERMISSION DENIED on DDL — by design; must not be used |
| 15 | 6 | BAIXO | BOTH | **Apply via supabase CLI vs psql manual** — CLI = single transaction (crash -> full rollback). psql manual = partial state possible on mid-file failure. |

## 3. Respostas por cenário solicitado

### 1. Aplicar em produção — o que muda?

M1: já aplicado; hoje = no-op (COMMENTs idempotentes, wrapper já existe, body da health fn já reescrito). M2: conteúdo já vivo; aplicar registra a versão em schema_migrations apenas. Efeito real de ambos é só histórico (texto de strings em 2 funções + 1 view; zero DDL de tabela, zero backfill, zero dado). Risco de apply: BAIXO.

### 2. Re-run (idempotência) — erra?

Não. M1 e M2 são 100% idempotentes quando rodados como postgres/supabase_admin: COMMENT/OR REPLACE/REVOKE/GRANT e DO-block com IF NOT EXISTS. Exceções: (a) runner não-dono (service_role) → PERMISSION DENIED; (b) dois runners paralelos → race no DO-block da view (relation already exists, retry cura); (c) ambiente futuro onde check_lovable_parity já foi dropada → M1 falha na linha 1 (dependência dura da função deprecated).

### 3. Acesso concorrente durante a migração

Locks: só catálogo (ACCESS EXCLUSIVE em funções/view, ms). Cron 172 (10min) pode bloquear ms; SELECTs na view esperam ≤30s (statement_timeout) ou completam antes; PostgREST pode dar 1 request 404/500 transitório após DDL de view. lock_timeout=0 → txn longa ativa segura a view por tempo indefinido (idle-in-txn morre em 60s; query ativa morre em 30s). Risco: BAIXO–MEDIO.

### 4. Rollback

M1: trivial (DROP wrapper + restaurar COMMENTs; body da health fn é idêntico — nada a reverter em código). M2: **não há DOWN file e os bodies antigos (FATOR X) não estão no repo** — rollback exige reconstrução manual a partir do git history/dump da era Lovable. Além disso, rollback de M2 não desfaz dados já escritos com o nome novo. Risco: MEDIO-ALTO (operacional).

### 5. Pipeline executando durante a migração

Probabilidade ≈ 0 (sem cron, 0 callers). Se ocorrer: invocação antiga termina (lock share), CREATE OR REPLACE espera, nova body vale depois — sem erro. Pós-migração, invocar o pipeline ainda falha porque `fn_generate_constraints_reference` não existe (pré-existente, não corrigido por M2).

### 6. webhook_health_alerts com milhões de rows com título antigo

Não existe hoje (0 rows com 'FATOR X'; 781 total). M2 não tem UPDATE → nunca toca histórico: zero impacto de performance mesmo com 1M rows hipotético. Efeito colateral cosmético: títulos antigos persistem no histórico (sem backfill). Retention cron 242 limpa em 30/90d.

### 7. system_docs com entries FATOR_X_CONSTRAINTS_REFERENCE existentes

Tabela está VAZIA hoje → no-op. Se existissem: M2 não renomeia/limpa rows antigas → docs órfãos sob nome antigo + reset do hash de drift (primeiro snapshot novo = initial_snapshot, is_drift=false → alerta de drift mudo na transição). Nenhum reader do nome antigo existe (0 em DB + código).

### 8. ops.check_lovable_parity chamada por cron quando o wrapper é criado

Sem conflito (objetos distintos); cron 106 e 111 rodaram com sucesso após o apply — validado empiricamente. Risco real é futuro: deprecation parcial (drop da função antiga) quebra run_all_checks + fn_regression_tests + check_schema_parity juntos — o wrapper NÃO é independente, só delega.

### 9. Alguém consulta v_improvements_status durante a migração

Espera de ms ou 1 erro transitório (PostgREST cache reload). Hoje 0 consumidores em src/ (só types.ts). Impacto ≈ zero; em pico com txn longa, migração pode esperar (ver cat 3).

### 10. Permissões — precisa de superuser?

**Não precisa de superuser**, mas precisa de **ownership dos objetos substituídos + CREATE nos schemas zapp/ops/evo**. postgres ou supabase_admin OK (ambos superusers de fato). service_role, CI read-only, authenticated, anon → PERMISSION DENIED na primeira DDL. Nenhum statement superuser-only (sem ALTER SYSTEM/CREATE EXTENSION/pg_catalog).

## 4. Gaps detectados (pré-execução)

- GAP-01 — **M2 referencia função inexistente**: `fn_generate_constraints_reference()` não existe no banco; o pipeline (código morto hoje) falha se invocado, e o alerta de drift instrui o usuário a executar função inexistente. M2 deveria criar a função ou remover a referência.
- GAP-02 — **Sem arquivo DOWN/rollback para M2**; bodies antigos (FATOR X) não estão versionados no repo → rollback não-scriptável.
- GAP-03 — **M2 não registrado em schema_migrations** embora o conteúdo já esteja em prod → risco de drift entre repo e banco; `supabase db push` vai reaplicar (no-op) e registrar tardiamente.
- GAP-04 — **Wrapper `check_schema_parity` acoplado à função deprecated**: delega 100% e repete o tipo de retorno; deprecation futura (DROP da antiga) quebra 3 caminhos de monitoramento (cron 106, 111 e o próprio wrapper).
- GAP-05 — **Nome de arquivo inconsistente com version registrada** (20260803_ vs 20260803160000) → replay/re-registro confuso no histórico.
- GAP-06 — **Sem backfill de histórico**: títulos antigos de alertas e docs antigos nunca são renomeados (decisão implícita, não documentada).
- GAP-07 — **Race no DO-block da view** se 2 runners aplicarem M2 em paralelo (relation already exists); sem lock de CI single-runner.
- GAP-08 — **search_path de M2 sem pg_catalog** (`zapp,evo,monitoring`): funciona hoje (objetos resolvem), mas é frágil a hijack/ambiguidade futura; guard cron 165 cobre.
- GAP-09 — **Dependência de ownership não documentada**: se qualquer pipeline futuro aplicar migrations como service_role, falha na primeira DDL.
- GAP-10 — **M1 falha em ambiente futuro onde check_lovable_parity já foi dropada** (COMMENT ON FUNCTION sem guard).
- GAP-11 — **Fresh envs (restore de dump antigo)**: M1 depende de `ops.check_lovable_parity` + tipo `ops.schema_drift_log`; M2 depende de UNIQUE(doc_name,content_hash) em system_docs — sem preflight, falhas só aparecem em runtime.
- GAP-12 — **Verificação pós-apply ausente**: não há passo de smoke test (chamar check_schema_parity(), conferir grants, conferir viewdef) após aplicar M2.

## 5. Recomendações de mitigação (priorizadas)

- 1. **[ALTA] Corrigir GAP-01**: adicionar `fn_generate_constraints_reference()` (ou removê-la do corpo do pipeline/do texto do alerta) em uma migration complementar; testar `SELECT zapp.fn_snapshot_constraints_reference(NULL,'test')`.
- 2. **[ALTA] Criar DOWN migrations**: capturar os bodies pré-M2 do git history e commitar `20260803_fix_fator_x_db_references_DOWN.sql` + `20260803_deprecate_lovable_parity_functions_DOWN.sql` (DROP wrapper, restaurar COMMENTs).
- 3. **[ALTA] Registrar M2** em schema_migrations (uma execução via CLI) para alinhar repo↔banco; padronizar timestamp do filename.
- 4. **[MEDIA] Single-runner enforcement**: aplicar migrations apenas via CI job serializado como postgres/supabase_admin; assert de role no início da migration (`SELECT current_user`) para falhar cedo com mensagem clara.
- 5. **[MEDIA] lock_timeout=5s no início das migrations** (`SET lock_timeout='5s'`) + kill de blockers via pg_stat_activity se timeout — evita espera infinita atrás de txn longa (lock_timeout global = 0).
- 6. **[MEDIA] Documentar dependência do wrapper**: comentário em check_schema_parity e em run_all_checks indicando que DROP de check_lovable_parity exige os 3 juntos; adicionar chamada do wrapper em fn_regression_tests.
- 7. **[BAIXA] Adicionar pg_catalog ao search_path das funções de M2** e rodar guard secdef (cron 165) após apply.
- 8. **[BAIXA] Smoke test pós-apply**: `SELECT ops.check_schema_parity(false);`, verificar grants de check_schema_parity, verificar viewdef de v_improvements_status, conferir doc_name em system_docs após 1 execução do pipeline.
- 9. **[BAIXA] Backfill opcional documentado**: se histórico importar, migration dedicada com UPDATE em webhook_health_alerts (title/details) e rename em system_docs — fora do escopo das 2 migrations atuais (deliberadamente sem backfill).
- 10. **[INFO] Preflight para fresh envs**: script de verificação de dependências (check_lovable_parity, schema_drift_log, UNIQUE(doc_name,content_hash), extensão pgcrypto) antes de aplicar em staging/restore.

## 6. Conclusão

As 2 migrations têm **blast radius mínimo** (strings em 2 funções + 1 view; sem DDL de tabela, sem backfill, sem mudança de tipos). M1 já está validada em produção (crons 106/111/172 succeeded pós-apply) e M2 é no-op no estado atual do banco. Os riscos reais não estão no apply — estão na **orfandade operacional**: função geradora inexistente, ausência de DOWN files, M2 não registrado, e o acoplamento do wrapper à função que se pretende deprecar.

---
*Gerado por simulação determinística (seed 42): 520 cenários · 62 templates únicos · baseado em 40+ queries de leitura no banco de produção. Nenhuma escrita foi executada.*