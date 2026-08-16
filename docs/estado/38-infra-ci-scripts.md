# Estado: infra, CI e scripts — Fase 3

> ## ⚠️ CORREÇÃO DO ORQUESTRADOR — 2026-08-16, pós-publicação
>
> **O achado A1 está invertido — o `INV-5` NÃO está errado, o `CLAUDE.md` é que está.**
>
> A1 conclui que o gate obriga configuração quebrada porque contradiz a regra 4 do
> `CLAUDE.md`. A premissa vem de um briefing errado meu. Verificado ao vivo via
> `pg_class` nesta data: `evo.evolution_messages` e `evo.evolution_conversations` são
> **tabelas particionadas físicas**; os objetos homônimos em `zapp` são **VIEWs**. A
> migration `20260816250003_decouple_e73_e75_i4_zero.sql` (ADR-I4, commit `a3c1dc952`)
> moveu de volta `zapp`→`evo` às 11:50Z de 2026-08-16.
>
> Logo o `INV-5` exigir `schema:'evo'` está **alinhado com a topologia vigente**, e a
> regra 4 do `CLAUDE.md` é que ficou invertida. Rebaixar A1 de 🔴 Crítica para 🟡:
> deixa de ser "CI enforça o errado" e passa a ser "documentação contradiz o CI, e a
> documentação é que está errada".
>
> **Porém o sintoma relatado é real, por outra causa:** `evolution_messages` e
> `evolution_conversations` **não constam da publication `supabase_realtime` em nenhum
> schema**. `useEvolutionMonitoring.ts:87` de fato não recebe eventos — não por causa do
> schema, mas por ausência na publication. Esse é o bug a investigar.
>
> Os demais achados deste documento (A2, A3, A4, A6) não dependem dessa premissa e
> seguem válidos.

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos cobertos: 184/184
> (44 workflows `.yml` + 1 `.md` extraviado em `.github/workflows/` · 110 arquivos em `scripts/` · 30 em `infra/`)

**Metodo:** leitura estatica do repo na branch `claude/validar-levantamento-sistema-uxonxc`.
Nenhum acesso a banco, nenhum run de CI observado. **Nao se afirma aqui que qualquer
workflow passa ou falha** — apenas o que esta declarado no YAML.

---

## 1. Visão Geral

| Bloco | Arquivos | Linhas | Observação |
|---|---|---|---|
| `.github/workflows/*.yml` | 44 | 5.237 | 1 arquivo extra (`QUALITY-GATE-FIX-PLAN.md`, 329 linhas) nao e workflow — ver A9 |
| `scripts/` | 110 | 81.341 | **67.960 linhas (83%) sao um unico dump**: `scripts/decouple/snapshots/zapp_schema_snapshot.sql`. Codigo real: **13.381 linhas** |
| `infra/` | 30 | 3.579 | runbooks, stacks Swarm, runner self-hosted, backup, edge-deploy |

O numero "81 mil linhas de scripts" e enganoso: descontado o snapshot SQL de drift,
`scripts/` tem 13.381 linhas — dimensao normal para a quantidade de gates do projeto.

**Contagem de gates declarados como obrigatorios:** o unico lugar do repo que enumera os
required status checks e `.github/workflows/branch-protection-sentinel.yml:157`, e ele lista
**10** contextos, nao 11 (ver A5).

---

## 2. Workflows

Legenda de gatilhos: PR = `pull_request`, PUSH = `push`, CRON = `schedule`,
MAN = `workflow_dispatch`, CALL = `workflow_call`, RUN = `workflow_run`.

"Obrigatório no merge?" = o `name:` do job consta no array `EXPECTED_CONTEXTS` do
branch-protection-sentinel (`.github/workflows/branch-protection-sentinel.yml:157`).

### 2.1 Gates obrigatórios no merge (10)

| workflow | gatilho | o que faz | obrigatório no merge? | ativo/resíduo |
|---|---|---|---|---|
| `edge-auth-smoke.yml` | PR main · CRON 06:00 · MAN | Em PR: verificação estática de auth das edge functions; fora de PR: smoke real contra o gateway | **SIM** (`edge-auth-smoke`) | ativo |
| `edge-drift-check.yml` | PR main · CRON 09:00 · MAN | E37 hash repo×produção, E38 completude de env, E39 `deploy-edge.sh` read-only | **SIM** (`edge-drift-check`) | ativo |
| `edge-guard.yml` | PR (todos) | Bloqueia comandos de deploy manual, `migrate-helper` em config.toml e `.bak` em `supabase/functions` | **SIM** (`Edge guard checks`) | ativo |
| `db-invariants.yml` | PUSH/PR main,develop | INV-1..INV-6 de Realtime (schema, partições, cleanup, publicação) | **SIM** (`DB Invariants`) | ativo — **mas INV-5 esta invertido, ver A1** |
| `migration-uniqueness.yml` | PR main · PUSH main | Valida unicidade de nome/timestamp de migration | **SIM** (`Migration Uniqueness Gate`) | ativo |
| `schema-drift.yml` | PR/PUSH main,master · MAN | `static-drift`: detecta DDL fora de `supabase/migrations/`. `live-drift`: só em MAN, exige `DATABASE_URL` | **SIM** (`schema-drift-guard` = job estático) | ativo |
| `pr-size-gate.yml` | PR main,develop | Comenta/bloqueia PR acima do teto de tamanho | **SIM** (`PR Size Gate`) | ativo |
| `codeql.yml` | PR/PUSH main · CRON seg 09:00 | CodeQL javascript-typescript | **SIM** (`Analyze (javascript-typescript)`) | ativo |
| `security.yml` | PR/PUSH main,master · CRON seg 06:00 · MAN | gitleaks (secret scan) | **SIM** (`🔍 Secret Scan (gitleaks)`) | ativo |
| `security-invoker-gate.yml` | PR **com paths** · CRON seg 08:00 · MAN | D-8 `v_security_audit`, `security_invoker` em todas as views, funções não-executáveis por anon | **SIM** (`Verify security_invoker on all views`) | ativo — **paths filter em required check, ver A2** |

### 2.2 Gates de PR não obrigatórios

| workflow | gatilho | o que faz | obrigatório? | ativo/resíduo |
|---|---|---|---|---|
| `ci.yml` (CI/CD Pipeline, 543 ln) | PR/PUSH main,develop · MAN | 11 jobs: lockfile, quality (ESLint, anti-`***`, design-system ratchet `--max=130`, `check-types-schemas` + auto-repair), audit-contract scan/live, contract-gate, migration-gates, test, build, e2e, a11y, security | não | ativo |
| `quality-gate.yml` | PR/PUSH main,master | lint, `check-audit-docs-integrity.sh`, ratchets dead-code + data-layer, migration linter, `audit-rls-coverage --check`, `check-schema-usage`, `lint-supabase-casts`, cluster-typecheck, types-freshness, coverage ratchet, simulate-schema-access | não | ativo |
| `decouple-guard.yml` | PR/PUSH main (paths amplos) | Bloqueia recriação de infra/workflows Evolution neste repo + inventário de acoplamento (gate TOTAL=0) + SQL egress gate por fixture | não | **ativo e intencional** (não é resíduo) |
| `regression-test-gate.yml` | PR main,master | E46 — PR com título `fix:` precisa alterar ≥1 arquivo de teste | não | ativo |
| `measure-invariants.yml` | PR (opened/sync/reopen) · MAN | `boundary-audit` ONLINE contra banco real, publica `decouple-score.json` e comenta no PR | não | ativo (depende de secret de DB) |
| `ownership-gate.yml` | PR/PUSH main,`feat/decouple*` | Zapp não grava em `evo` Grupo A | não | ativo |
| `evo-ddl-gate.yml` | PR (migrations) | E42 — DDL novo em schema `evo` bloqueado, com allowlist | não | ativo |
| `edge-env-completeness.yml` | PR/PUSH main · MAN | Env vars usadas × declaradas nas edge functions | não | ativo |
| `edge-schema-parity.yml` | PR/PUSH main · MAN | Integridade de schema nas edge functions (enforce) | não | ativo |
| `migration-lint.yml` | PR/PUSH (migrations) | `scripts/lint-migrations.sh` (idempotência de RLS) + comentário no PR | não | ativo |
| `migration-smoke-test.yml` | PR/PUSH (migrations) | Aplica todas as migrations do zero em Postgres de serviço; valida schemas esperados | não | ativo |
| `check-realtime-dead-channels.yml` | PR/PUSH main (`src/**`) | `check-realtime-dead-channels.sh src` — subscriptions sem unsubscribe | não | ativo |
| `health-score-anti-drift.yml` | PR/PUSH main (`supabase/**`,`scripts/**`) | F3 — detecta mudança em `fn_system_health_score` / `fn_score_security_acl` | não | ativo |
| `deno-contract-tests.yml` | PR/PUSH (`supabase/functions/**`) · CRON 06:00 | Testes de contrato Deno das edge functions | não | ativo |
| `ai-agent-pr-policy.yml` | PUSH main,develop · MAN | Bloqueia push direto de autor AI em branch protegida | não | ativo |
| `branch-protection-sentinel.yml` | PR main,master (paths) · CRON 06:00 · MAN | Em PR: veta `console.log` e `as any` novos. Em CRON: audita as regras de proteção de `main` via API (fail-open sem PAT) | não | ativo |

### 2.3 Deploy

| workflow | gatilho | o que faz | obrigatório? | ativo/resíduo |
|---|---|---|---|---|
| `deploy-vps.yml` (395 ln) | PUSH main · MAN | Build+push GHCR (runner `[Linux,X64,vps-zapp]`), tags de rollback protegidas, retenção GHCR `min-versions-to-keep: 30`, deploy via API Portainer, job `post-deploy-health` inline | não | **ativo — deploy de produção** |
| `deploy-vps-selfhosted.yml` (325 ln) | **PUSH main** · MAN | Mesmo pipeline, deploy no runner self-hosted com convergência verificada; retenção GHCR `min-versions-to-keep: 9`; stack Portainer **157** | não | **marcado `[DRAFT] — NÃO ativar`, porém ESTÁ ATIVO — ver A3 (crítico)** |
| `edge-deploy.yml` | PUSH main (`supabase/functions/**`) · MAN | Deploy das edge functions `--apply --restart` + validação de hash + upload de drift report | não | ativo |
| `post-deploy-check.yml` | RUN `["deploy-vps.yml"]` | TTM de `www.zappweb.app.br`, PostgREST vivo, edge `get-media-base64` viva | não | **resíduo funcional — nunca dispara, ver A4** |
| `notify-ci-failure.yml` | RUN (6 workflows) | POST warroom → Email + Bitrix24 em falha | não | **5 dos 6 nomes não existem, ver A4** |

### 2.4 E2E, seeds e utilitários

| workflow | gatilho | o que faz | obrigatório? | ativo/resíduo |
|---|---|---|---|---|
| `e2e-inbox-vps.yml` | PR main,master · MAN · CRON 09:00 | Em PR: job `pr-check` só marca skip. Fora de PR: valida user → seed contatos → Playwright Inbox + axe autenticado contra VPS | não | ativo |
| `e2e-crm-vps.yml` | PR main,master · MAN | Mesmo padrão, suite CRM | não | ativo |
| `e2e-admin-vps.yml` | MAN | valida user → Playwright Admin contra VPS | não | ativo (só manual) |
| `e2e-nightly-full.yml` | MAN · CRON 06:00 | `check-e2e-spec-coverage.mjs` (nenhum spec órfão) + suite completa de `e2e/` | não | ativo |
| `validate-e2e-user.yml` | MAN · CALL | RPC REST — valida permissões CRM do `E2E_USER_EMAIL` | não | ativo (reusable) |
| `seed-e2e-contacts.yml` | MAN · CALL | RPC REST `rpc_e2e_seed_contacts` (exige ≥5 contatos) | não | ativo (reusable) |
| `seed-e2e-user.yml` | MAN · CALL | RPC REST — cria/atualiza usuário E2E (auth + profile + role agent) | não | ativo, **mas sem chamador** — ver A7 |
| `cleanup-e2e-data.yml` | MAN · CALL · CRON 07:00 | RPC `rpc_e2e_cleanup` | não | ativo |
| `flaky-test-detector.yml` | CRON seg–sex 03:00 · MAN | 3 passadas de vitest sem retry, extrai testes instáveis | não | ativo |
| `db-reference-integrity.yml` | CRON 08:00 · MAN · PUSH (`supabase/**`,`scripts/sql/**`) | Q-1/Q-2 via `scripts/sql/check-reference-integrity.sql` | não | ativo |
| `zapp-schema-drift-gate.yml` | CRON 09:10 · MAN · PR/PUSH (migrations) | `scripts/decouple/zapp-drift-check.sh` contra o snapshot versionado | não | **ativo e intencional** (criado 2026-08-16) |
| `schema-snapshot.yml` | CRON dom 04:00 · MAN | `pg_dump` do schema via container `supabase_db`, publica em branch dedicado | não | ativo |
| `ratchet-tighten.yml` | PUSH main | Aperta baselines (down-only) dos ratchets hard | não | ativo |

---

## 3. Scripts

Altitude de script. `chamado por` = referência real encontrada por busca literal do
basename em `.github/`, `package.json`, `scripts/`, `docs/`, `infra/`, `src/`.
Menção apenas em `docs/` **não** conta como chamador (é citação, não invocação).

### 3.1 Em uso — invocados por workflow

| script | linhas | o que faz | chamado por | status |
|---|---|---|---|---|
| `scripts/audit-contract.mjs` | 547 | Auditoria de contrato front↔DB | `ci.yml` | EM_USO |
| `scripts/check-migration-gates.mjs` | 133 | Antipadrão + timestamp de migration | `ci.yml` | EM_USO |
| `scripts/check-ts-nocheck.mjs` | 96 | Ratchet de `@ts-nocheck` | `ci.yml` | EM_USO |
| `scripts/check-types-schemas.mjs` | 319 | Cobertura de schema zapp+evo nos tipos | `ci.yml` | EM_USO |
| `scripts/repair-types-schemas.mjs` | 195 | Auto-repair quando o gate acima falha | `ci.yml` | EM_USO |
| `scripts/check-design-system.ts` | 363 | Ratchet de design system (`--ci --max=130`) | `ci.yml`, `package.json` (lint) | EM_USO |
| `scripts/ds-config.ts` | 72 | Config do checker acima | import em `check-design-system.ts:3` | EM_USO |
| `scripts/check-tsc-ratchet.mjs` | 96 | Ratchet de erros tsc | `ci.yml`, `quality-gate.yml` | EM_USO |
| `scripts/audit-rls-coverage.mjs` | 239 | E34 — cobertura de RLS (blocking) | `quality-gate.yml` | EM_USO |
| `scripts/check-audit-docs-integrity.sh` | 60 | Integridade dos docs de auditoria | `quality-gate.yml` | EM_USO |
| `scripts/gerar-indice-achados.mjs` | 243 | Gera `docs/audits/INDICE_ACHADOS.md` | `check-audit-docs-integrity.sh` (indireto) | EM_USO |
| `scripts/check-cluster-typecheck.mjs` | 172 | Typecheck por cluster | `quality-gate.yml` | EM_USO |
| `scripts/check-coverage-ratchet.mjs` | 173 | Ratchet de cobertura | `quality-gate.yml`, `package.json` | EM_USO |
| `scripts/check-data-layer.mjs` | 81 | Ratchet de data layer | `quality-gate.yml`, `ratchet-tighten.yml` | EM_USO |
| `scripts/check-dead-code.mjs` | 110 | Ratchet de dead code | `quality-gate.yml`, `package.json` | EM_USO |
| `scripts/check-schema-usage.mjs` | 168 | Guardrail de uso zapp/evo | `quality-gate.yml`, `package.json` | EM_USO |
| `scripts/check-types-freshness.mjs` | 114 | Frescor dos tipos gerados | `quality-gate.yml` | EM_USO |
| `scripts/lint-supabase-casts.mjs` | 208 | SUP-001..006 casts inseguros | `quality-gate.yml`, `package.json` | EM_USO |
| `scripts/lint-migrations.mjs` | 272 | Linter de migration (static drift) | `quality-gate.yml`, `migration-smoke-test.yml` | EM_USO |
| `scripts/lint-migrations.sh` | 64 | Idempotência de RLS | `migration-lint.yml` | EM_USO |
| `scripts/simulate-schema-access.mjs` | 174 | Simula acesso por schema | `quality-gate.yml` | EM_USO |
| `scripts/check-realtime-dead-channels.sh` | 110 | Subscriptions sem cleanup | `check-realtime-dead-channels.yml` | EM_USO |
| `scripts/check-fix-regression-test.mjs` | 97 | E46 — teste obrigatório em `fix:` | `regression-test-gate.yml` | EM_USO |
| `scripts/check-e2e-spec-coverage.mjs` | 49 | Nenhum spec e2e órfão | `e2e-nightly-full.yml` | EM_USO |
| `scripts/check-deploy-secrets.mjs` | 65 | Secrets de deploy presentes | `deploy-vps.yml`, `deploy-vps-selfhosted.yml`, `prebuild` | EM_USO |
| `scripts/decouple/inventory.mjs` | 362 | Inventário de acoplamento v3 (gate TOTAL=0) | `decouple-guard.yml` | EM_USO |
| `scripts/decouple/sql-gate.mjs` | 543 | SQL egress gate | `decouple-guard.yml` | EM_USO |
| `scripts/decouple/evo-ddl-gate.mjs` | 257 | E42 — DDL em `evo` | `evo-ddl-gate.yml` | EM_USO |
| `scripts/decouple/ownership-gate.mjs` | 252 | Ownership de schema | `ownership-gate.yml` | EM_USO |
| `scripts/decouple/boundary-audit.mjs` | 205 | Mede I1–I9 online | `measure-invariants.yml` | EM_USO |
| `scripts/decouple/zapp-drift-check.sh` | 43 | Drift zapp × snapshot | `zapp-schema-drift-gate.yml` | EM_USO |
| `scripts/decouple/schema-snapshot-transform.mjs` | 380 | Normaliza o snapshot | `zapp-drift-check.sh` | EM_USO |
| `scripts/decouple/snapshots/zapp_schema_snapshot.sql` | 67.960 | Snapshot de referência do schema zapp | `zapp-drift-check.sh` | EM_USO (dado, não código) |
| `scripts/sql/check-realtime-publication.sql` | 70 | INV-6 — publicação Realtime | `db-invariants.yml` | EM_USO |
| `scripts/sql/realtime-publication.manifest` | 68 | Manifesto esperado | `check-realtime-publication.sql` | EM_USO |
| `scripts/sql/check-reference-integrity.sql` | 63 | Q-1/Q-2 integridade | `db-reference-integrity.yml` | EM_USO |

### 3.2 Em uso — só por `package.json` / husky (nunca em CI)

| script | linhas | o que faz | chamado por | status |
|---|---|---|---|---|
| `scripts/typecheck.sh` | 5 | wrapper de typecheck | `package.json:typecheck` | EM_USO (local) |
| `scripts/validate-supabase-types.sh` | 142 | Gera/valida tipos Supabase | `package.json:types:gen`,`types:check` | EM_USO (local) |
| `scripts/gen-types-zapp.mjs` | 97 | Gera tipos do schema zapp | `package.json:gen:types:zapp` | EM_USO (local) |
| `scripts/clean-deno-shadow.sh` | 74 | Limpa shadow do Deno | `package.json:prebuild` | EM_USO |
| `scripts/generate-component-registry.ts` | 48 | Registry de componentes | `package.json:prebuild` | EM_USO |
| `scripts/check-edge-function-sync.sh` | 41 | Sync de edge functions | `package.json:check:fnsync` | EM_USO (local) |
| `scripts/check-fe-be-sync.sh` | 140 | Sync FE↔BE (usa `.sync-ignore`) | `package.json:check:febesync` | EM_USO (local) |
| `scripts/check-domain-boundaries.ts` | 64 | Fronteiras de domínio | `package.json:check:domain` | EM_USO (local) |
| `scripts/validate-barrels.ts` | 76 | Valida barrels | `package.json:check:barrels` | EM_USO (local) |
| `scripts/check-performance-budget.mjs` | 309 | Budget de performance | `package.json:perf:budget` | EM_USO (local) |
| `scripts/generate-coverage-report.ts` | 58 | Relatório de cobertura | `package.json:report:coverage` | EM_USO (local) |
| `scripts/stress-test.ts` | 98 | Stress test | `package.json:test:stress` | EM_USO (local) |
| `scripts/fuzz-edge-functions.ts` | 101 | Fuzz das edge functions | `package.json:test:fuzz` | EM_USO (local) |
| `scripts/regen-trilha-mensagens.ts` | 305 | Regenera trilha de mensagens | `package.json:regen:trilha` | EM_USO (local) |
| `scripts/check-design-system.test.ts` | 49 | Teste do DS checker | `package.json:ds:test` | EM_USO (local) |
| `scripts/update-rollback-protection.sh` | 56 | Mantém tags GHCR protegidas | `infra/ghcr-protected-tags.txt:3` | EM_USO (manual) |
| baselines (`coverage-baseline.json`, `data-layer-baseline.json`, `tsc-error-baseline.json`, `ts-nocheck-baseline.txt`, `dead-code-allowlist.txt`, `.column-map-baseline.txt`, `audit-allowlist.json`, `.sync-ignore`, `evo-ddl-allowlist.txt`, `sql-gate-fixture.json`, `fixtures/sql_report_snapshot.json`) | — | dados de ratchet/allowlist | pelos scripts correspondentes | EM_USO (dados) |

### 3.3 Testes de gate (rodam só sob vitest/bun, não referenciados por workflow)

| script | linhas | status |
|---|---|---|
| `scripts/decouple/__tests__/sql-gate.test.mjs` | 86 | EM_USO (citado em `decouple-guard.yml`) |
| `scripts/decouple/__tests__/evo-ddl-gate.test.mjs` | 110 | ORFAO — nenhum runner o coleta explicitamente |
| `scripts/decouple/__tests__/schema-registry-validate.test.mjs` | 83 | ORFAO — idem |
| `scripts/rls-role-matrix.test.ts` | 142 | ORFAO — só referenciado por `audit-rls-coverage.mjs` como dado |

---

## 4. Scripts órfãos (candidatos a remoção, com veredito de risco)

**Definição usada:** nenhum workflow, nenhum script de `package.json`, nenhum outro script
e nenhum runbook operacional o invoca. Citação em `docs/` de plano/retro **não** conta.

### 4.1 Órfãos que se apresentam como gate de CI — risco ALTO de falsa segurança

| script | linhas | veredito |
|---|---|---|
| `scripts/check-column-map.mjs` | 94 | **NÃO REMOVER — WIRE.** `src/integrations/supabase/README.md:20` afirma que ele "bloqueia PRs que reintroduzam" nomes de coluna legados, e `src/integrations/supabase/columnMap.ts:11` repete "O CI impede regressão". **Nenhum workflow o executa.** A proteção documentada não existe. Ver A6. |
| `scripts/decouple/phys-refs-gate.mjs` | 188 | **NÃO REMOVER — WIRE.** Gate E71 (bloqueia refs físicas novas a `zapp.evolution_*` em migrations) completo e com CLI documentado no cabeçalho, sem nenhum chamador. Viola a regra do `CLAUDE.md` ("sem chamador, não entra"). |
| `scripts/decouple/verb-contract-gate.mjs` | 91 | **AVALIAR.** Gate de contrato dos 12 verbos; só citado em docs e por `coverage-report.mjs` (também órfão). |
| `scripts/decouple/run-all-gates.mjs` | 77 | **AVALIAR.** Agregador que roda inventory+sql-gate+ownership; nenhum workflow o usa (os workflows chamam cada gate direto). Duplica orquestração. |
| `scripts/decouple/schema-registry-validate.mjs` | 134 | **AVALIAR.** Só o próprio teste o referencia. |
| `scripts/decouple/score-ratchet.mjs` | 342 | **AVALIAR.** Ratchet de score de desacoplamento; só citado em `docs/decouple/VALIDACAO_EXECUCAO_PLANO_20260815.md`. |
| `scripts/decouple/coverage-report.mjs` | 276 | **AVALIAR.** Só citado em docs de plano V4. |

### 4.2 Órfãos de ferramenta pontual — risco BAIXO, remoção segura

| script | linhas | veredito |
|---|---|---|
| `scripts/audit-semaphore-sim.mjs` | 270 | REMOVER. Réplica congelada do algoritmo de semáforo "working tree 2026-08-03" — simulação de auditoria já concluída. Zero referências. |
| `scripts/fwdref_scan.py` | 193 | REMOVER (ou mover p/ `docs/`). Varredura one-shot de forward-reference em migrations; exige `pglast`, não declarado em lugar nenhum. |
| `scripts/sql/validate-media-bucket-sql.py` | 22 | REMOVER. **Caminho hardcoded `C:\zapp-web-v3\...`** — script de máquina Windows de um dev; não roda neste repo. |
| `scripts/query-fingerprint.mjs` | 63 | REMOVER. Zero chamadores. |
| `scripts/render-seed-report.mjs` | 140 | REMOVER. Renderiza HTML de summaries de seed que os workflows REST atuais não emitem mais. |
| `scripts/decouple/medir-baseline.sh` | 5 | REMOVER. 5 linhas, depende de env vars que ninguém define. |
| `scripts/residuos-sweep.sh` | 125 | AVALIAR. Varredura anti-resíduos de Docker Swarm — coerente com `infra/runbooks/POLITICA_ANTI_RESIDUOS.md`, mas **o runbook não o cita**. Wire no runbook ou remova. |
| `scripts/SECRET_SCAN.sh` | 74 | AVALIAR. Substituído na prática por gitleaks em `security.yml`. |
| `scripts/preview-start.sh` | 120 | REMOVER. Substituído por `scripts/preview/start-preview.sh`. |
| `scripts/check-schema-drift.sh` + `scripts/check_schema_drift.sql` | 9 + 35 | REMOVER. Superados por `zapp-schema-drift-gate.yml` + `decouple/zapp-drift-check.sh`. Consta em `.lovableignore:39`. |
| `scripts/templates/audit_template.md` | 80 | MANTER como template (não é executável). |

### 4.3 Par legado de seed E2E — superado pela via REST/RPC

`seed-e2e-contacts.yml:17` diz textualmente "mesma convenção do **antigo** `scripts/seed-e2e-contacts.sql`".
Os 4 workflows de seed/validate/cleanup chamam RPC via `curl` e **não referenciam nenhum `.sh`/`.sql`**.

| script | linhas | veredito |
|---|---|---|
| `scripts/seed-e2e-user.sh` + `.sql` | 98 + 120 | ORFAO — via psql legada. Manter só se o acesso direto ao banco ainda for procedimento de contingência; caso contrário remover. |
| `scripts/seed-e2e-contacts.sh` + `.sql` | 45 + 106 | ORFAO — idem |
| `scripts/validate-e2e-user.sh` + `.sql` | 40 + 81 | ORFAO — idem |
| `scripts/cleanup-e2e-data.sh` | 20 | ORFAO — só citado em `supabase/migrations/20260807140000_create_rpc_e2e_cleanup.sql:4` como contexto histórico |
| `scripts/lib/preflight-secrets.sh` | 70 | EM_USO pelos 4 `.sh` acima — cai junto se eles caírem |
| `scripts/run-e2e-evolution-vps.sh` | 48 | ORFAO — nenhum workflow; só docs |

### 4.4 Subárvore `scripts/preview/` (11 arquivos, ~166 linhas) — dev local Windows

Nenhum workflow toca. `watchdog-preview.sh:3` faz `cd /c/zapp-web-v3` e o cabeçalho diz
"Roda via cron 1x/min" — **cron da máquina do dev, não do repo**. Só `docs/plano-lovable-local-50-etapas.md`
os cita. Veredito: **manter isolado ou mover para fora de `scripts/`** — não são infraestrutura do projeto.

### 4.5 Bytecode Python versionado sem fonte — remoção imediata

Três `.pyc` estão **rastreados pelo git** e seus `.py` de origem **não existem mais**:

- `scripts/__pycache__/a11y-toast-contrast-check.cpython-311.pyc` (fonte deletada)
- `__pycache__/ci_cost_analysis.cpython-314.pyc` (na raiz do repo)
- `.hermes/rollback-test/__pycache__/generate_and_test_rollbacks.cpython-311.pyc`

Veredito: **REMOVER e adicionar `__pycache__/` ao `.gitignore`.** (O terceiro está em `.hermes/`,
fora do meu escopo de edição — apenas registrado.)

---

## 5. Infra declarada (docker, nginx, vercel, runbooks)

**30 arquivos, 3.579 linhas.**

### 5.1 Empacotamento e serving

| arquivo | o que declara |
|---|---|
| `Dockerfile` | Multi-stage `oven/bun:1.3-alpine` → deps → builder → serve. 8 `ARG VITE_*` injetados em build time. Comentário na linha 7: `--frozen-lockfile` **removido** por compat com tag flutuante `bun 1.3.x` — build não é reprodutível por lockfile (ver A8) |
| `docker-compose.yml` | Serviço `zapp-web`, rede `AtomicaBRNet`, labels Traefik (`zapp.atomicabr.com.br`, websecure, TLS letsencrypt), healthcheck `GET /healthz` 30s, limites 1 CPU / 512M |
| `nginx.conf` (72 ln) / `nginx-prod.conf` (81 ln) | Dois configs nginx coexistindo na raiz; o Dockerfile define qual entra |
| `vercel.json` | Framework vite, build `bun run build`, SPA rewrite, HSTS preload, `X-Frame-Options SAMEORIGIN`, CSP extensa, cache imutável em `/static` e `/assets`. **Coexiste com o deploy Docker/Swarm/Portainer** — dois alvos de deploy declarados |

### 5.2 `infra/stacks/` — 9 stacks Swarm versionados

`zapp-web-prod.yml` (stack 157 do Portainer), `supabase-backup.yml`,
`postgres-backup-daily.yml` / `-weekly.yml` / `-monthly.yml`, `glitchtip.yml` (Sentry self-hosted),
`dlq-inspector.yml`, `reconcile-ops.yml`, `supabase-db-mcp.yml`, `zapp-functions-health.yml`.
Este último referencia `scripts/check-functions-health.sh` (`infra/stacks/zapp-functions-health.yml:14,17`)
— **script que não existe em `scripts/`**; presume-se residir na VPS. Ver A10.

### 5.3 Demais

| caminho | conteúdo |
|---|---|
| `infra/runbooks/` | `OPERATIONS.md`, `PLAYBOOK_INCIDENTE.md`, `AUDITORIA_MENSAL.md`, `POLITICA_ANTI_RESIDUOS.md`, `SECURITY-INCIDENT-CREDENTIAL-ROTATION.md` |
| `infra/runner/` | `docker-compose.runner.yml` + `install-runner.sh` — runner self-hosted (`myoung34/github-runner`, stack 210) |
| `infra/backup/` | `README.md` (procedimento de restore) + `backup_v4.sh` |
| `infra/edge-deploy/deploy-edge.sh` | Usado em read-only por `edge-drift-check.yml` (E39) e no apply por `edge-deploy.yml` |
| `infra/supabase/` | `docker-compose.supabase.yml` (referencia `scripts/98-webhooks.sql`, `99-roles.sql`, `99-jwt.sql` — do container Supabase, não deste repo) + `EDGE_FUNCTIONS.md` |
| `infra/scripts/` | `housekeeping.sh`, `memory-limits.sh` — citados em `OPERATIONS.md:101,159` |
| `infra/ghcr-protected-tags.txt` | Tags GHCR imunes à retenção; mantido por `scripts/update-rollback-protection.sh` |
| `infra/github/branch-protection-main.md` | Doc das regras de proteção de `main` |
| `infra/stack35/SECRETS_INVENTORY.md` | Inventário de secrets |

---

## 6. Achados

| ID | Achado | Caminho:linha | Severidade |
|---|---|---|---|
| **A1** | **Invariante de CI enforça o schema errado de Realtime.** `INV-5` exige que toda subscription a `evolution_messages`/`evolution_conversations` use `schema:'evo'`. O `CLAUDE.md` (regra 4) afirma o oposto e é explícito: *"Subscription em `schema: 'evo'` recebe ZERO eventos — a relação física não está lá"*. O gate portanto **obriga a configuração quebrada**. Há pelo menos um consumidor já em conformidade com o gate — e, por consequência, morto: `useEvolutionMonitoring.ts:87` faz `{ event:'INSERT', schema:'evo', table:'evolution_messages' }` com o comentário "tabela-fonte em schema evo (Realtime exige tabela base)". | `.github/workflows/db-invariants.yml:128-145`; `src/components/monitoring/hooks/useEvolutionMonitoring.ts:87` | 🔴 Crítica |
| **A2** | **Required check com `paths:` filter → PR pode travar para sempre.** `security-invoker-gate.yml` é required (`Verify security_invoker on all views`) mas só dispara em PR que toque `supabase/migrations/**`, `supabase/functions/**` ou `src/integrations/supabase/**`. PR que não toque esses caminhos nunca reporta o contexto, e o GitHub mantém o merge bloqueado em "Expected — Waiting for status". É o único dos 10 required com filtro de path. | `.github/workflows/security-invoker-gate.yml:20-24` vs `branch-protection-sentinel.yml:157` | 🔴 Crítica |
| **A3** | **Workflow marcado "DRAFT — NÃO ativar" está ativo e concorre com o deploy de produção.** `deploy-vps-selfhosted.yml` traz no cabeçalho `⚠️ DRAFT PARA REVISÃO — NÃO ativar antes de aprovação`, mas declara `on: push: branches:[main]` sem `if:` e com o `paths:` **comentado**. Roda em todo push na main, ao lado de `deploy-vps.yml`. Os dois usam **grupos de concurrency diferentes** (`deploy-vps` vs `deploy-vps-v2`), logo **não se serializam**: dois deploys disputam o mesmo stack Portainer 157 e a mesma imagem GHCR. Pior, as retenções GHCR divergem — o DRAFT poda para **9** versões enquanto o de produção preserva **30**, então o DRAFT pode apagar tags que o pipeline oficial considera vivas. | `deploy-vps-selfhosted.yml:3,23,25-34,52-54,147` vs `deploy-vps.yml:17-23,160` | 🔴 Crítica |
| **A4** | **Toda a camada de notificação/verificação pós-deploy está desligada por nome errado.** `workflow_run` casa pelo `name:` do workflow, nunca pelo nome do arquivo. (a) `post-deploy-check.yml` escuta `["deploy-vps.yml"]` — o comentário nas linhas 28-30 afirma que "aceita nome do arquivo OU nome do workflow", o que é falso; o nome real é `🚀 Build & Deploy — ZAPP web v3`, então **nunca dispara**. (b) `notify-ci-failure.yml` escuta 6 workflows e **5 não existem**: `"CI"` (real: `CI/CD Pipeline`), `"E2E CRM VPS"` (real: `E2E CRM (VPS)`), `"E2E Inbox VPS"` (real: `E2E Inbox (VPS)`), `"E2E Nightly Full"` (real: `E2E Nightly Full (VPS)`), `"Deploy VPS"` (real: `🚀 Build & Deploy — ZAPP web v3`). Só `"Quality Gate"` casa. Falha de CI/deploy em produção não gera alerta. | `post-deploy-check.yml:28-38`; `notify-ci-failure.yml:6-12` | 🔴 Crítica |
| **A5** | **Divergência entre required checks esperados e o levantamento.** O sentinel enumera **10** contextos em `EXPECTED_CONTEXTS`, não 11. Além disso o job só roda em `schedule`/`workflow_dispatch` e é **fail-open**: sem o secret `BRANCH_PROT_PAT`, o `GITHUB_TOKEN` recebe 403 e o passo emite `::warning` e `exit 0` (linhas 82-88). Hoje não há garantia de que a proteção real de `main` corresponda ao array. | `.github/workflows/branch-protection-sentinel.yml:157`, `:82-88` | 🟠 Alta |
| **A6** | **Guard-rail documentado como ativo que nenhum CI executa.** `src/integrations/supabase/README.md:20` afirma que `check-column-map.mjs` "bloqueia PRs que reintroduzam" colunas legadas e `columnMap.ts:11` afirma "O CI impede regressão de strings legadas". Nenhum workflow invoca o script. Mesma classe de problema em `decouple/phys-refs-gate.mjs` (gate E71 completo, sem chamador) — ambos violam a regra do `CLAUDE.md`: *"Sem chamador, não entra"*. | `scripts/check-column-map.mjs`; `src/integrations/supabase/README.md:20`; `src/integrations/supabase/columnMap.ts:11`; `scripts/decouple/phys-refs-gate.mjs:17` | 🟠 Alta |
| **A7** | **`seed-e2e-user.yml` é reusable sem nenhum chamador.** Expõe `workflow_call` exigindo 3 secrets, mas os workflows E2E chamam apenas `validate-e2e-user.yml` e `seed-e2e-contacts.yml`. O usuário E2E nunca é semeado automaticamente — se ele sumir do ambiente, as 4 suítes E2E quebram no pré-check sem caminho de auto-recuperação. | `.github/workflows/seed-e2e-user.yml:16-21`; chamadas em `e2e-crm-vps.yml:43,54`, `e2e-inbox-vps.yml:46,57`, `e2e-admin-vps.yml:26` | 🟠 Alta |
| **A8** | **Build de produção não é reprodutível por lockfile.** O `Dockerfile` removeu `--frozen-lockfile` deliberadamente ("compatibilidade com bun 1.3.x (floating tag)"), enquanto o job `lockfile` do `ci.yml` valida que `bun.lock` está em sync e os E2E usam `--frozen-lockfile`. A imagem que vai a produção pode resolver dependências diferentes das validadas no CI. A base também é tag flutuante `oven/bun:1.3-alpine`. | `Dockerfile:6-8`; `ci.yml:40-49` | 🟠 Alta |
| **A9** | **Documento markdown dentro de `.github/workflows/`.** `QUALITY-GATE-FIX-PLAN.md` (329 linhas, auditoria de 2026-07-30) está no diretório de workflows. É inofensivo para o Actions, mas é a origem da contagem "45 workflows / 5.566 linhas" — o real é 44 workflows / 5.237 linhas. Mover para `docs/`. | `.github/workflows/QUALITY-GATE-FIX-PLAN.md` | 🟡 Média |
| **A10** | **Stack de monitoria referencia script inexistente no repo.** `zapp-functions-health.yml` invoca `scripts/check-functions-health.sh` duas vezes; esse arquivo não existe em `scripts/`. Ou vive só na VPS (infra não versionada) ou o stack está quebrado — não é decidível estaticamente. | `infra/stacks/zapp-functions-health.yml:14,17` | 🟡 Média |
| **A11** | **Bytecode Python versionado sem código-fonte.** Três `.pyc` rastreados pelo git cujos `.py` não existem mais, incluindo um na raiz do repo. `__pycache__/` não está no `.gitignore`. | `scripts/__pycache__/a11y-toast-contrast-check.cpython-311.pyc`; `__pycache__/ci_cost_analysis.cpython-314.pyc`; `.hermes/rollback-test/__pycache__/generate_and_test_rollbacks.cpython-311.pyc` | 🟡 Média |
| **A12** | **Dois alvos de deploy declarados simultaneamente.** `vercel.json` descreve um deploy completo (build, rewrites SPA, CSP, HSTS) enquanto `Dockerfile`+`docker-compose.yml`+`infra/stacks/zapp-web-prod.yml`+`deploy-vps.yml` descrevem Docker/Swarm/Portainer em `zapp.atomicabr.com.br`. Nada no repo declara qual é o canônico. Como só o CSP do `vercel.json` existe, se o caminho vivo for o nginx, as políticas de segurança ali definidas não se aplicam. | `vercel.json`; `docker-compose.yml:18-24`; `nginx-prod.conf` | 🟡 Média |
| **A13** | **~19 scripts órfãos, dos quais 7 se apresentam como gates.** Detalhamento na seção 4. Além do subconjunto de gates (A6), há ~9 ferramentas one-shot removíveis, o par legado psql de seed E2E (6 arquivos, superado pela via REST/RPC — o próprio `seed-e2e-contacts.yml:17` chama o `.sql` de "antigo") e a subárvore `scripts/preview/` (11 arquivos, paths Windows `/c/zapp-web-v3`, cron de máquina de dev). | seção 4 | 🟡 Média |
| **A14** | **Inconsistência cosmética na retenção GHCR.** O passo se chama "🧹 GHCR retention (keep 9 — 3 deploys íntegros)" mas configura `min-versions-to-keep: 30`. O nome do passo mente sobre o que o passo faz. | `.github/workflows/deploy-vps.yml:150,160` | 🟢 Baixa |
| **A15** | **INV-6 é fail-open silencioso.** Único invariante que consulta o banco; sem `SUPABASE_DB_URL`, sem `psql` ou sem conectividade emite `::notice`/`::warning` e `exit 0`. A escolha é deliberada e está justificada em comentário, mas hoje significa que drift na publicação `supabase_realtime` pode passar sem ninguém notar. O próprio texto do notice admite isso. | `.github/workflows/db-invariants.yml:159-178` | 🟢 Baixa (por design, registrado) |
