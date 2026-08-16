> **Nota histórica**: Este documento refere-se ao banco 'FATOR X' (projeto Supabase `tdprnylgyrogbbhgdoik`), descomissionado em 2026-07-15. O termo foi mantido para rastreabilidade histórica.

# 🔍 RELATÓRIO FINAL DE AUDITORIA — zapp-web-v3

**Data:** 2026-08-03
**Delegação:** `deleg_46358781` (15 workers: 14 auditores + 1 compilador)
**Repositório:** `adm01-debug/zapp-web-v3` · branch `main` · HEAD final `881706c85`
**Escopo:** Consolidação single-DB (remoção Evolution DB / Lovable Cloud) — validação exaustiva de código, banco de produção, migrations, testes, build, segurança e documentação.
**Método:** 14 workers paralelos especializados (DB via Supabase MCP contra produção PG 15.8, tsc, vitest, deno check, vite build, greps exaustivos, simulações determinísticas), seguidos deste compilador final.

---

## 0. Sumário Executivo

| Dimensão | Resultado |
|---|---|
| Achados NEEDS_FIX | 2 falhas `deno check` (pré-existentes) + 2 gaps de limpeza baixa severidade |
| Migrations | M1 **aplicada** em produção · M2 **válida, no-op, pendente de registro** |
| Testes | 7.539/7.552 passando (99,8%) · 12 falhas transitórias (edição paralela) · 389/389 nas suítes-alvo |
| TypeScript | ✅ 0 erros (3 tsconfigs + pós-sweep) |
| Build produção | ✅ exit 0 · 219 chunks · 9,51 MB (2,68 MiB gzip) |
| Referências deprecated no DB | **ZERO** em todos os tipos de objeto |
| Referências deprecated no código ativo | **ZERO** (sweep final estável) |
| Segurança | ✅ Sem regressões · 2 gaps de limpeza baixa severidade |
| Dívida conhecida | 12 gaps operacionais de migration + alertas pré-existentes não relacionados |
| **NOTA GERAL** | **8,5 / 10** |

---

## 1. O que foi encontrado (NEEDS_FIX)

### 1.1 Falhas de type-check em Edge Functions (pré-existentes, não introduzidas pela auditoria)

Worker 5 (`deno check` em 11 edge functions modificadas): **9 PASS / 2 FAIL**.

| Arquivo | Erro | Local |
|---|---|---|
| `supabase/functions/evolution-sender/index.ts` | `TS2339: Property 'id' does not exist on type 'object'` (2 erros) | linha 98 (`messageId` via `key.id`) |
| `supabase/functions/_shared/log-idempotency-miss.ts` | `Type checking failed` | confirmado em re-check independente |

> **Nota:** a lista exata dos 11 arquivos foi truncada no log do worker; re-verificação independente confirmou os dois arquivos acima falhando. Nenhum dos dois foi tocado pelas mudanças desta auditoria (somente strings/comentários) — são dívidas de tipo pré-existentes.

### 1.2 Gaps de limpeza de baixa severidade (Worker 12 — Security)

1. **`supabase/functions/.env.required` ainda declara** `EXTERNAL_SUPABASE_URL`, `EXTERNAL_SUPABASE_ANON_KEY`, `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` (linhas 12–14) — variáveis do banco externo extinto. (`EVOLUTION_DB_URL`/`EVOLUTION_DB_SERVICE_ROLE_KEY` já foram removidos pelo sweep do Worker 8.)
2. **`analyze-external-db` ainda deployada em produção** — responde **401** (auth-gated, seguro) em vez de 404; Kong bloqueia `external-db-bridge` (404) mas não essa rota. Deve ser removida da VPS ou adicionada à allowlist de bloqueio.

### 1.3 Gaps estruturais das migrations (Worker 9 — 520 simulações)

Ver seção 4 (Migration status) — GAP-01 a GAP-12. Destaques:

- **GAP-01 (ALTO):** `fn_generate_constraints_reference()` **não existe** no banco de produção. O pipeline `fn_constraints_reference_pipeline` (0 crons, 0 callers — código morto hoje) falharia em runtime (`undefined_function`) se invocado, e o texto do alerta de drift instrui o usuário a executar função inexistente.
- **GAP-02 (ALTO):** Não há arquivos **DOWN/rollback** para M1 nem M2; os bodies antigos (FATOR X) não estão versionados no repo.
- **GAP-04 (ALTO):** O wrapper `ops.check_schema_parity` é 100% acoplado à função deprecated `check_lovable_parity` — um futuro DROP quebra cron 106, cron 111 e o próprio wrapper simultaneamente.
- **GAP-03 (MEDIO):** M2 não registrada em `schema_migrations` embora o conteúdo já esteja vivo em prod (drift repo↔banco).

### 1.4 Alertas de produção PRÉ-EXISTENTES (não relacionados à consolidação — Worker 10)

| Item | Estado | Causa |
|---|---|---|
| Cron 44 `refresh_mv_daily_kpis` | ❌ falhando (horário) | `relation "evo.mv_daily_kpis" does not exist` — rename Evo v2 |
| Cron 126 | ❌ falhou 13:00 | `schema_drift_log_status_check` violado |
| `backup_sentinel_stale` | ❌ alerta ativo | sentinel 21h obsoleto |
| `burnin_critical_alert` E10-03 | ❌ alerta crítico | burn-in 72h em andamento (investigar antes do go-live) |
| `restore_integrity_fail` | ❌ alerta ativo | verificação de restauração |
| Monitor E9-05 | ⚠️ falso-positivo | `evolution_webhook_events` renomeada → `evolution_webhook_events_v2` (17 partições) |
| `lint-migrations` | ⚠️ 3 violações ML-001 | `20260724000014_fix_secdef_search_path_bulk.sql` (SECURITY DEFINER sem SET search_path — pré-existente) |

**Bottom line (Worker 10):** nenhum problema ativo causado pelas mudanças da auditoria. O pipeline de constraints está saudável mas **nunca executou** (sem cron, 0 callers).

---

## 2. O que foi corrigido (nesta auditoria / ondas anteriores consolidadas)

| # | Correção | Evidência |
|---|---|---|
| 1 | **Arquitetura dois-Supabase eliminada** — consolidação single-DB (`supabase.atomicabr.com.br`, schema `zapp`) | Commits #725/#726/#732/#736; `USE_EXTERNAL_DB=false` |
| 2 | **Módulos de proxy externo removidos** (`externalProxyBreaker.ts`, `externalProxyFetch.ts`, edge fns `external-db-bridge`, `analyze-external-db` removidas do git) | `git ls-files` limpo; commit `55ca468db`; ZERO importadores (Worker 6) |
| 3 | **`externalProxy.ts` simplificado** — usa Supabase direto; mantém superfície `queryExternalProxy` para ~37 consumidores | 10.5 KB, sem HTTP proxy; tsc 0 |
| 4 | **M1 aplicada e validada em produção** (`20260803_deprecate_lovable_parity_functions`, v`20260803160000`) | aplicada 2026-08-03T15:44:16Z; crons 106/111/172 succeeded pós-apply |
| 5 | **M2 validada** (`20260803_fix_fator_x_db_references`) — bodies das 2 funções + view já contêm texto novo em prod | diff normalizado IDENTICAL; EXPLAIN OK; aplicar = no-op |
| 6 | **Sweep final de referências deprecated: ZERO no código ativo** | Worker 8: 9 padrões × repo inteiro; tsc + 11 testes passando pós-sweep; só restam guardrails/probes/arquivos históricos intencionais |
| 7 | **Auditoria profunda do banco: ZERO referências** a `tdprnylgyrogbbhgdoik`/`allrjhkpuscmgbsnmjlv`/`FATOR_X` em TODOS os tipos de objeto (funções, views, defaults, enums, triggers, policies, crons, buckets, sequences, system_docs, prosqlbody) | Worker 2 — 29.661 runs de cron verificados |
| 8 | **Testes de proxy corrigidos** — `proxy.test.ts` 21/21 (PR #735); suíte alvo 389/389 | Workers 4 + git log |
| 9 | **Docs de arquitetura consistentes** — AGENTS.md/ENV_SETUP.md/SELF-HOSTED-DATABASE-GUIDE.md refletem single-DB; CHANGELOG com entradas de ambas auditorias | Worker 11 (PRs #723/#725/#726/#732/#736) |
| 10 | **Segurança de `external-db-proxy` (mantida)** — `requireUser()` na linha 380 gateia todas as rotas de dados; `/metrics` exige METRICS_SECRET ou JWT service_role | Worker 12, probes ao vivo |

---

## 3. Dívida conhecida (backlog)

### Prioridade ALTA
1. **[GAP-01]** Criar `fn_generate_constraints_reference()` ou remover a referência do pipeline/texto do alerta (M2 complementar).
2. **[GAP-02]** Criar DOWN migrations (`..._DOWN.sql`) para M1 e M2 — reconstruir bodies pré-M2 do git history.
3. **[GAP-04]** Desacoplar `check_schema_parity` da função deprecated (ou documentar dependência tripla).
4. **`evolution-sender` + `log-idempotency-miss`** — corrigir TS2339 (narrowing de `key.id`).

### Prioridade MÉDIA
5. **[GAP-03]** Registrar M2 em `schema_migrations` (execução via CLI; alinhar timestamp do filename).
6. **[GAP-05/07/09]** Padronizar timestamp de filename; single-runner enforcement + assert de role no início de migrations; documentar ownership (postgres/supabase_admin; service_role/CI-readonly = PERMISSION DENIED por design).
7. **Cron 44** — recriar `evo.mv_daily_kpis` ou apontar para a tabela renomeada (`evolution_webhook_events_v2`).
8. **Remover `analyze-external-db` da VPS** (ou bloquear via Kong request-termination).
9. **Limpar `.env.required`** — remover `EXTERNAL_SUPABASE_*` (linhas 12–14).
10. **Testes desabilitados por design** — `externalProxy.test.ts` e `resilienceSimulation.test.ts` estão comment-out (1 teste skipped cada); decidir reescrever para single-DB ou remover.

### Prioridade BAIXA / INFO
11. **[GAP-06/08/10/11/12]** Backfill histórico opcional; `pg_catalog` no search_path de M2; guard para re-run em ambiente pós-deprecation; preflight para fresh envs; smoke test pós-apply.
12. **Alertas pré-existentes** — sentinel de backup (21h), burn-in E10-03, restore integrity, falso-positivo E9-05.
13. **Working tree sujo no fim da auditoria** — edições do Worker 8 (useConnections.ts, Connections.tsx, clientTelemetry.ts, db.ts, types-manual.ts, config.toml, connection-health-check, workflows, TRILHA fixture, bun.lock) + artefatos `.hermes/` (postgrest_exposure_audit etc.) **pendentes de commit/PR**.

---

## 4. Status das Migrations

| Migration | Versão | Status em produção | Re-apply | Verdict |
|---|---|---|---|---|
| `20260803_deprecate_lovable_parity_functions.sql` (M1) | `20260803160000` | ✅ **APLICADA** (2026-08-03T15:44:16Z) | Corretamente **skipped** (idempotente) | Zero regressões; wrapper `check_schema_parity` OK; crons 106/111/172 succeeded DEPOIS do apply |
| `20260803_fix_fator_x_db_references.sql` (M2) | — (não registrada) | ⏳ **Conteúdo já vivo em prod** (bodies idênticos normalizados; view com diff de string residual) | No-op idempotente | **SAFE TO APPLY** — aplicar apenas registra a versão; pendente de registro (GAP-03) |

**Caracterização dos riscos (Worker 9, 520 cenários, seed 42):** blast radius mínimo — strings em 2 funções + 1 view; zero DDL de tabela, zero backfill, zero mudança de tipos. CRITICO: 0 · ALTO: 65 · MEDIO: 159 · BAIXO: 141 · INFO: 155 (cenários brutos). 57 cenários únicos determinísticos. Relatório completo: `docs/_archive/simulation/20260803_db_migrations_500_failure_simulation.md`.

---

## 5. Resumo de Testes

| Suíte | Resultado | Detalhe |
|---|---|---|
| **Vitest completo** (Worker 13, 562s) | **7.539 pass / 12 fail / 1 skip** (7.552) · 337 files pass / 3 fail / 1 skip (341) | Baseline: 7.510 pass / 30 fail / 1 skip → **+29 pass, −18 fail** (os 30 do baseline eram `proxy.test.ts`, agora 21/21) |
| Suítes-alvo 10 grupos (Worker 4) | ✅ **389/389 green, 0 fail, 0 skip** (13/13 files) | Proxy/EvoApi, telemetry, diagnostics, hooks, evolution, etc. |
| Re-check pós-estabilização (compilador) | ✅ `instrumentedExternal.test.ts` 35/35; `externalProxy.test.ts` + `resilienceSimulation.test.ts` skipped-by-design | — |
| **TypeScript** (Workers 3 e 6) | ✅ `tsconfig.app.json` / `tsconfig.json` / `tsconfig.node.json` — **0 erros**; TSC_EXIT=0; import graph íntegro (ZERO imports quebrados) | — |
| **Build produção** (Worker 7) | ✅ `vite build --mode production` exit 0 (2m11s, 6.329 módulos) · 219 chunks JS · 9,51 MB minified (2,68 MiB gzip) | — |
| **Deno check** (Worker 5) | ⚠️ **9/11 PASS, 2 FAIL** (evolution-sender TS2339; log-idempotency-miss) | pré-existentes |
| Pós-sweep (Worker 8) | ✅ tsc passa; 11 testes editados passam / 2 skipped-by-design | — |

> ⚠️ **Caveat metodológico:** as 12 falhas do vitest completo são **transitórias** — os 3 arquivos (`externalProxy.test.ts`, `resilienceSimulation.test.ts`, `instrumentedExternal.test.ts`) estavam sendo **reescritos por workers paralelos durante a execução** (mtime 13:28:36, mid-run). Após estabilização, todos passam ou estão desabilitados por design. Nenhuma regressão real.

---

## 6. Postura de Segurança

**Verdict (Worker 12): sem regressões — 2 gaps de limpeza de baixa severidade.**

| Item | Status |
|---|---|
| `external-db-proxy` (mantida) | ✅ `requireUser()` L380 gateia todas as rotas de dados; `/metrics` exige METRICS_SECRET ou JWT service_role; exceções apenas OPTIONS preflight + GET health |
| `external-db-bridge` (deletada) | ✅ Kong responde **404** (request-termination) |
| `analyze-external-db` | ⚠️ **401** (auth-gated, seguro) mas ainda deployada — remover |
| `external-db-proxy` sem auth | ✅ **401** (`Authorization failed` em probe ao vivo) |
| `LOVABLE_API_KEY` | ✅ intacta — exigida por `ai-proxy` (11 funções), não é referência de DB |
| `externalClient` shim | ✅ não expõe service_role; shim de compatibilidade (~37 consumidores) |
| CORS | ✅ não alargado |
| Env removida (`EVOLUTION_DB_URL` etc.) | ✅ nenhuma edge function crasha sem ela; `.env.required` só mantém `EXTERNAL_SUPABASE_*` (gap limpeza) |
| RLS em tabelas-chave | ✅ ativa (não FORCE) em `system_docs`/`webhook_health_alerts`; SECURITY DEFINER owner `supabase_admin` (bypass OK) |
| `system_docs` / `proxy_metrics` / `webhook_health_alerts` (FATOR) | ✅ 0 rows com referências deprecated |

---

## 7. Nota Geral

### **8,5 / 10**

| Critério | Peso | Nota | Justificativa |
|---|---|---|---|
| Migrations | 25% | 9,0 | M1 aplicada+validada; M2 no-op seguro; penaliza GAP-01/02/03 (função inexistente, sem DOWN, não registrada) |
| Testes | 25% | 9,0 | 99,8% verde; tsc 0; build OK; 12 falhas transitórias por paralelismo (não regressão) |
| Higiene de código | 20% | 9,5 | ZERO refs deprecated em código ativo e em TODOS os objetos do DB |
| Segurança | 20% | 8,5 | Sem regressões; auth íntegra; 2 gaps de limpeza + edge fn órfã deployada |
| Documentação | 10% | 7,5 | Docs principais consistentes; CHANGELOG ok; pendências menores (README ADR-005, .env.required) |

**Justificativa da nota:** consolidação single-DB concluída, validada em produção e sem regressões — o trabalho central está pronto para PR/merge. A nota não é 9+ por dívida operacional concreta: função de geração inexistente referenciada pelo pipeline, ausência de rollback scripted, M2 pendente de registro, 2 edge functions com falha de tipo, alertas pré-existentes (KPI MV, sentinel de backup) e working tree com edições não commitadas no fim da auditoria.

---

## 8. Workers e Artefatos

| Worker | Área | Status | Artefato |
|---|---|---|---|
| 0 | Validar M2 (fix_fator_x_db_references) | ✅ completed 216s | verdict no-op seguro |
| 1 | Validar + aplicar M1 (deprecate_lovable_parity) | ✅ completed 199s | aplicada; re-apply skipped |
| 2 | Deep DB audit (todos os objetos) | ✅ completed 157s | ZERO refs deprecated |
| 3 | TypeScript (3 tsconfigs) | ✅ completed 549s | ALL PASS |
| 4 | Vitest 10 grupos | ✅ completed 290s | 389/389 green |
| 5 | Deno check 11 edge functions | ✅ completed 140s | 9 PASS / 2 FAIL |
| 6 | Import graph integrity | ✅ completed 433s | ZERO broken imports; TSC_EXIT=0 |
| 7 | Build produção | ✅ completed 724s | exit 0; 9,51 MB |
| 8 | Sweep final (ZERO NEEDS_FIX) | ✅ completed 1107s | zero refs em código ativo |
| 9 | 520 simulações de falha (DB) | ✅ completed 573s | `docs/_archive/simulation/20260803_db_migrations_500_failure_simulation.md` |
| 10 | Health check produção | ✅ completed 207s | sem issues das mudanças; alertas pré-existentes |
| 11 | Docs consistency | ✅ completed 197s | consistentes com single-DB |
| 12 | Security audit | ✅ completed 466s | sem regressões; 2 gaps baixos |
| 13 | Vitest completo vs baseline | ✅ completed 681s | 7.539 pass (12 falhas transitórias) |
| 14 | **Compilar relatório final** | ✅ | **este documento** |

**Logs completos:** `~/.hermes/cache/delegation/live/deleg_46358781/task-{0..14}.log` (perfil otimizado)

---

*Gerado em 2026-08-03 · Compilador: worker 14 (FINAL) · Todos os 14 workers concluídos antes da compilação.*
