# Simulação de Falhas — Scripts Deletados Referenciados por Cron, Docs e Rollback Git (50 cenários)

**Data:** 2026-08-03 · **Repo:** zapp-web-v3 · **Método:** simulation-first (ground truth → modelos → matriz) · **Cenários:** 50

## Resumo executivo

- **Cenários:** 50 · **Status:** PROTEGIDO 7 · PARCIAL 23 · GAP 20
- **Severidade:** CRITICO 8 · ALTO 18 · MEDIO 17 · BAIXO 7
- **Top 3 riscos:** D1 (revert conflita em 5 scripts re-adicionados, risco 7.45), G1 (runbook com script deletado atrasa RTO, 7.2), B1 (job 116 órfão após deleção do rate-limiter, 7.1) — empatados C1 (runbook aplicador VPS, 7.1).
- **Estado atual do CI: PROTEGIDO** — 0/16 workflows com cron citam scripts deletados; package.json 100% resolvido; workflows de risco (e2e-inbox-vps, schema-snapshot, gen-types-zapp, cleanup-e2e-data) verificados individualmente.
- **Maior GAP real:** docs operacionais apontam para scripts deletados (C1, C2, C6) e **não existe gate de CI** que detecte referência doc→arquivo inexistente (G4).
- **GAP estrutural de rollback:** `supabase/manual-rollbacks/` ficou VAZIO (DOWN do harden_rls deletado) enquanto 2 docs de deploy/rollback apontam para ele (C6, D4).

## Evidência (ground truth)

| Fato | Evidência |
|---|---|
| Commit ebf9558d5 deletou 1026 arquivos (limpeza massiva) | `git show ebf9558d5` |
| 44 scripts deletados; 39 ainda ausentes; 5 re-adicionados depois | `git ls-files` × `git show --name-status ebf9558d5` |
| 10 arquivos de edge functions deletados (f4ff55af1) | `git show f4ff55af1` |
| 0 refs a scripts deletados em .github/workflows, package.json, infra/, src/, e2e/ | grep nos 39 basenames |
| 28 referências a scripts deletados em 19 docs (6 operacionais) | varredura docs/ |
| 80 jobs pg_cron (docs/db/CRONS.md) — todos SQL functions, 0 refs a scripts | docs/db/CRONS.md |
| Job 116 purga webhook_rate_limits — tabela escrita só por webhook-rate-limiter.ts (deletado) | CRONS.md + f4ff55af1 |
| 0 functions atuais importam módulos _shared deletados → revert f4ff55af1 seguro | grep supabase/functions |
| simulate-whatsapp-flow.ts (deletado) importa circuit-breaker.ts (deletado) | `git show ebf9558d5~1:scripts/simulate-whatsapp-flow.ts` |
| 2 pyc de scripts deletados TRACKED no git | `git ls-files '*__pycache__*'` |
| manual-rollbacks/ vazio após deleção do DOWN do harden_rls | `ls supabase/manual-rollbacks/` |
| rollback-test: 129 migrações → 62 PASS / 58 MANUAL / 8 CASCADE / 1 FAIL | .hermes/rollback-test/rollback-test-report.md |

## Modelos computacionais

### M1 — Modelo de conflito de revert (dados reais do git)

git revert ebf9558d5 re-adiciona 1026 arquivos. Arquivos deletados no commit e RE-ADICIONADOS depois (conflito certo): 5 (SECRET_SCAN.sh, backfill-ghost-wpp2.sql, preview-start.sh, query-fingerprint.mjs, run-e2e-evolution-vps.sh). Arquivos deletados e ainda ausentes (revert limpo, mas resurrect de código morto): 39 scripts + 982 docs/migrations. Restore-overwrite via checkout ~1 -- scripts/: 44 arquivos, dos quais 5 sobrescreveriam versões atuais diferentes.

`conflitos_certos=5, restaurados_limpos=39, sobrescritos_atuais=5, total_reaplicados=44`

### M2 — Exposição de docs a referências quebradas

28 referências a scripts deletados em 19 arquivos docs/. Operacionais (execução manual/runbook): 6 (21%). Históricas (auditorias antigas): 22. Sem gate de CI (G4), qualquer doc nova pode reintroduzir referência quebrada.

`hits=28, docs_afetados=19, operacionais=6, historicas=22`

### M3 — Exposição de cron a scripts do repo

16 workflows GitHub Actions com schedule (cron) + 80 jobs pg_cron. Referências atuais a scripts deletados: 0 em workflows, 0 diretas em pg_cron (jobs chamam SQL functions). Risco residual: (a) jobs pg_cron que tocam tabelas escritas só por módulos deletados: 1 (job 116 → webhook_rate_limits ← webhook-rate-limiter.ts deletado); (b) jobs sem alarme: 3 (171/172/173); (c) cron externo VPS não auditável: 1 (housekeeping.sh).

`gha_workflows_cron=16, pg_cron_jobs=80, refs_deletadas_gha=0, refs_deletadas_pgcron=0, jobs_orfanos=1, jobs_sem_alarme=3`

### M4 — Cadeia de restore quebrada

Dos 44 scripts deletados, 1 (simulate-whatsapp-flow.ts) importa módulo também deletado (circuit-breaker.ts) — restore cego = build quebrado. 39 scripts são folhas (sem deps internas deletadas). Restored com deps: 1/44 (2.3%).

`scripts_deletados=44, com_deps_deletadas=1, pct_quebra_restore_cego=2.3`

### M5 — Rollback de migrações (rollback-test 2026-08-03)

129 migrações testadas: 62 PASS (48%), 58 MANUAL (45%), 8 PASS_CASCADE (6%), 1 FAIL (1%). 51% das migrações NÃO têm down-script automático limpo.

`total=129, pass=62, manual=58, pass_cascade=8, fail=1, pct_sem_down_automatico=51.0`

## Matriz de cenários

| ID | Domínio | Cenário | Status | Sev | Lik | Risco |
|---|---|---|---|---|---|---|
| A1 | Cron externo | Workflow agendado referencia script deletado — estado atual: 0/16 workflows com cron citam os 39 scripts ausentes (verificado em e2e-inbox-vps, schema-snapshot, gen-types-zapp, cleanup-e2e-data) | PROTEGIDO | CRITICO 9 | 1 | **5.4** |
| A2 | Cron externo | Novo workflow agendado (ou edição futura) referencia script deletado — sem gate de CI que valide referências a scripts/ | GAP | CRITICO 8 | 4 | **6.2** |
| A3 | Cron externo | schema-snapshot.yml (cron dom 04h) divergiu do doc SCHEMA_SNAPSHOT_CI.md, que instrui ./scripts/introspect-schema.sh (deletado) — doc descreve fluxo que não existe mais | PARCIAL | MEDIO 5 | 5 | **5.0** |
| A4 | Cron externo | cleanup-e2e-data.yml (cron diário 07h) faz scp de scripts/cleanup-e2e-data.sh — vivo HOJE; deleção futura sem auditoria do workflow quebra o cron (lição GAP-21) | PARCIAL | ALTO 7 | 3 | **5.2** |
| A5 | Cron externo | e2e-inbox-vps.yml (cron diário 09h) sobreviveu à deleção de run-e2e-inbox-vps.sh — executa playwright direto; dependência removida com segurança | PROTEGIDO | ALTO 6 | 1 | **3.8** |
| A6 | Cron externo | Cron externo na VPS (/root/supabase/docker housekeeping.sh, prunes containers exit 255) — fora do repo, referências a scripts do repo não auditáveis | GAP | ALTO 7 | 4 | **5.7** |
| A7 | Cron externo | workflow_dispatch manual (muscle memory) usa run-e2e-admin-vps.sh / run-e2e-inbox-vps.sh deletados | GAP | ALTO 6 | 3 | **4.7** |
| A8 | Cron externo | Agendador Windows (schtasks) na máquina local referencia scripts do repo (preview-start.sh, typecheck.sh) — fora do git, não auditável | GAP | MEDIO 5 | 3 | **4.1** |
| G1 | Cross | Incidente + runbook com script deletado (C1/C2 em cascata) → atraso de RTO em migração/rollback de emergência | GAP | CRITICO 9 | 5 | **7.2** |
| G2 | Cross | Onboarding: CLAUDE.md/AGENTS.md/README limpos de refs a scripts deletados (verificado) | PROTEGIDO | MEDIO 4 | 1 | **2.7** |
| G3 | Cross | edge-drift-check.yml (cron 09h) e regenerate-graph.yml (cron seg 08h) usam scripts vivos e auto-contidos (check-edge-function-sync.sh, regenerate-graph.sh) | PROTEGIDO | ALTO 6 | 1 | **3.8** |
| G4 | Cross | check-audit-docs-integrity.sh (quality-gate.yml) valida SÓ a estrutura de PLANO_IMPLEMENTACAO_100.md — NÃO há gate doc→arquivo: refs a scripts deletados passam no CI | GAP | ALTO 7 | 6 | **6.6** |
| G5 | Cross | Sem manifesto de intenção da limpeza (o quê/porquê dos 1026 arquivos) → arqueologia git lenta e decisões erradas | PARCIAL | MEDIO 4 | 6 | **4.9** |
| G6 | Cross | 980+ migrações movidas para archive/ → git log de migrations confuso; tooling de diff (Lovable) quebra | PARCIAL | MEDIO 4 | 6 | **4.9** |
| G7 | Cross | Edge functions deletadas ainda deployadas na VPS (Kong) — edge-drift-check.yml detecta drift md5 DEPOIS do fato | PARCIAL | ALTO 6 | 4 | **5.1** |
| C1 | Docs | Runbook APPLY_ZAPP_EVOLUTION_BRIDGES.md: opção A (recomendada) = ./scripts/apply-vps-migrations.sh (DELETADO); só opção B (psql direto) funciona | GAP | CRITICO 8 | 6 | **7.1** |
| C10 | Docs | PLANO_IMPLEMENTACAO_100.md (gated pelo CI!) referencia ci_cost_analysis.py e gen_insert.cjs (deletados) nas notas de método | PARCIAL | MEDIO 4 | 4 | **4.0** |
| C2 | Docs | SCHEMA_SNAPSHOT_CI.md §4 instrui ./scripts/introspect-schema.sh (DELETADO) para rodar manualmente | GAP | ALTO 6 | 5 | **5.6** |
| C3 | Docs | REFACTOR_PLAN.md referencia gen-types.mjs (DELETADO); sucessor gen-types-zapp.mjs menciona a diferença em comentário | PARCIAL | MEDIO 4 | 5 | **4.5** |
| C4 | Docs | QUALITY_METRICS_REPORT.md referencia 8 scripts de validação deletados (validate-*, stress-test-200, test-realtime-websocket) — registro histórico intencional | PROTEGIDO | BAIXO 3 | 5 | **3.9** |
| C5 | Docs | simulation-consolidated-2026-07-12.md e cutover 2026-07-15 referenciam simulate-auth-rls/realtime/whatsapp-flow (deletados) — histórico | PROTEGIDO | BAIXO 3 | 4 | **3.5** |
| C6 | Docs | DEPLOYMENT_GUIDE.md e RLS_SECURITY_DEFINER_HARDENING.md apontam para supabase/manual-rollbacks/ — diretório AGORA VAZIO (20260529120100_harden_rls_DOWN.sql deletado) | GAP | CRITICO 8 | 5 | **6.7** |
| C7 | Docs | docs/edge/relatorio-e4-2026-08-01.md referencia supabase/EDGE_FUNCTIONS.md (deletado) — link quebrado | PARCIAL | BAIXO 2 | 6 | **3.8** |
| C8 | Docs | DECISION.md referencia migrations-from-lovable/ALL_IN_ONE.sql (deletado) | PARCIAL | BAIXO 2 | 5 | **3.35** |
| C9 | Docs | AUDITORIA_FINAL_20_ETAPAS.md referencia lighthouse.mjs (deletado) como passo de execução | PARCIAL | MEDIO 4 | 4 | **4.0** |
| E1 | Restore | gen-types.mjs restaurado duplica funcionalidade de gen-types-zapp.mjs (workflow gen-types-zapp.yml usa o vivo) | PARCIAL | MEDIO 4 | 5 | **4.5** |
| E2 | Restore | Scripts da era Lovable restaurados (run-200-simulations.ts, stress-test-200.ts) apontam para infra morta (external-db-proxy, Lovable Cloud) | PARCIAL | MEDIO 5 | 5 | **5.0** |
| E3 | Restore | add-schema-stubs.sh / apply-types-patch.sh restaurados reaplicam patches manuais que conflitam com types.ts regenerado | PARCIAL | MEDIO 5 | 4 | **4.5** |
| E4 | Restore | design-system-audit.ts restaurado duplica check-design-system.ts (que já gera design-system-audit.md) | PARCIAL | MEDIO 4 | 4 | **4.0** |
| E5 | Restore | Restauração via git show > file perde bit de execução (+x) → falha em runbook/CI que invoca ./scripts/x.sh | GAP | MEDIO 4 | 6 | **4.9** |
| D1 | Rollback git | git revert ebf9558d5 → CONFLITO nos 5 scripts re-adicionados depois (SECRET_SCAN.sh, backfill-ghost-wpp2.sql, preview-start.sh, query-fingerprint.mjs, run-e2e-evolution-vps.sh) | GAP | ALTO 7 | 8 | **7.5** |
| D10 | Rollback git | Revert parcial (1 arquivo) esquece dependências em cascata (ex.: webhook-rate-limiter ↔ tabela webhook_rate_limits ↔ job 116) | PARCIAL | ALTO 6 | 5 | **5.6** |
| D2 | Rollback git | git checkout ebf9558d5~1 -- scripts/ restaura 44 scripts (39 mortos + 5 vivos) — sobrescreve versões atuais com versões antigas | GAP | ALTO 7 | 7 | **7.0** |
| D3 | Rollback git | Restaurar simulate-whatsapp-flow.ts (deletado) → importa _shared/circuit-breaker.ts (também deletado) — script quebrado pós-restore | GAP | ALTO 6 | 6 | **6.0** |
| D4 | Rollback git | Rollback da migração 20260529120100_harden_rls exige 20260529120100_harden_rls_DOWN.sql — DELETADO de manual-rollbacks/ | GAP | CRITICO 9 | 4 | **6.8** |
| D5 | Rollback git | git revert em working tree sujo (8 arquivos modificados + untracked .hermes/*) → perda de trabalho não commitado | GAP | ALTO 7 | 5 | **6.1** |
| D6 | Rollback git | Revert re-adiciona ~980 docs/migrations obsoletos — poluição e conflitos com arquivos modificados posteriormente | PARCIAL | MEDIO 5 | 7 | **5.9** |
| D7 | Rollback git | Rollback-test real (2026-08-03): 129 migrações → 1 FAIL, 8 PASS_CASCADE, 58 MANUAL — rollback não é 100% automatizável | GAP | ALTO 6 | 6 | **6.0** |
| D8 | Rollback git | 58 migrações MANUAL sem down-script — rollback exige reconstrução manual a partir do git history (funções REPLACE, data migrations) | PARCIAL | ALTO 6 | 7 | **6.5** |
| D9 | Rollback git | Revert f4ff55af1 (módulos _shared deletados): SEGURO hoje — verificado 0 imports atuais; restaura módulos que 6 docs descrevem (confusão de arquitetura) | PROTEGIDO | MEDIO 5 | 3 | **4.1** |
| F1 | Stale | pyc de scripts deletados TRACKED no git: scripts/__pycache__/a11y-toast-contrast-check.cpython-311.pyc e __pycache__/ci_cost_analysis.cpython-314.pyc — executáveis acidentalmente ou restaurados em revert | GAP | MEDIO 4 | 6 | **4.9** |
| F2 | Stale | pyc tracked engana auditorias grep (falso positivo de 'script existe') | PARCIAL | BAIXO 3 | 5 | **3.9** |
| F3 | Stale | reports/schema-status/ (modificado) e dist/ com outputs órfãos de scripts deletados → drift de evidência | PARCIAL | BAIXO 3 | 5 | **3.9** |
| F4 | Stale | SECRET_SCAN.sh varre pyc stale de script deletado → falso positivo/negativo de segredo | PARCIAL | BAIXO 3 | 3 | **3.0** |
| B1 | pg_cron | Job 116 purge-webhook-rate-limits-2h órfão: tabela webhook_rate_limits só era escrita por supabase/functions/_shared/webhook-rate-limiter.ts (deletado em f4ff55af1) — purge vira no-op silencioso, proteção de rate-limit some | GAP | CRITICO 8 | 6 | **7.1** |
| B2 | pg_cron | Job 17 reprocess_pending_webhooks reprocessa webhooks sem idempotência (webhook-idempotency.ts deletado) — retries podem gerar duplicatas | GAP | ALTO 7 | 5 | **6.1** |
| B3 | pg_cron | Crons 171/172/173 (pg_cron) falham SKIPPED/FAILED silenciosos — LOW-4 documentado em AUDITORIA_BACKEND_SENIOR sem ação | PARCIAL | ALTO 6 | 5 | **5.6** |
| B4 | pg_cron | Cron sicoob-outbox-drain ausente + função sicoob-outbox-consumer não deployada (achado P0-5 da auditoria self-hosted 2026-08-01) — dreno de outbox nunca roda | GAP | CRITICO 8 | 4 | **6.2** |
| B5 | pg_cron | Funções chamadas por cron (80 jobs) têm definição apenas no DB vivo; migrations movidas para archive/ → rollback/restore de função via git impossível | PARCIAL | ALTO 6 | 6 | **6.0** |
| B6 | pg_cron | ALL_IN_ONE.sql (migrations-from-lovable) deletado — sem fonte única de setup do schema legado Lovable para rebuild | PARCIAL | MEDIO 5 | 3 | **4.1** |

## Top 10 riscos

| # | ID | Risco | Status | Cenário |
|---|---|---|---|---|
| 1 | D1 | 7.5 | GAP | git revert ebf9558d5 → CONFLITO nos 5 scripts re-adicionados depois (SECRET_SCAN.sh, backfill-ghost-wpp2.sql, preview-start.sh, query-fingerprint.mjs, run-e2e-evolution-vps.sh) |
| 2 | G1 | 7.2 | GAP | Incidente + runbook com script deletado (C1/C2 em cascata) → atraso de RTO em migração/rollback de emergência |
| 3 | B1 | 7.1 | GAP | Job 116 purge-webhook-rate-limits-2h órfão: tabela webhook_rate_limits só era escrita por supabase/functions/_shared/webhook-rate-limiter.ts (deletado em f4ff55af1) — purge vira no-op silencioso, proteção de rate-limit some |
| 4 | C1 | 7.1 | GAP | Runbook APPLY_ZAPP_EVOLUTION_BRIDGES.md: opção A (recomendada) = ./scripts/apply-vps-migrations.sh (DELETADO); só opção B (psql direto) funciona |
| 5 | D2 | 7.0 | GAP | git checkout ebf9558d5~1 -- scripts/ restaura 44 scripts (39 mortos + 5 vivos) — sobrescreve versões atuais com versões antigas |
| 6 | D4 | 6.8 | GAP | Rollback da migração 20260529120100_harden_rls exige 20260529120100_harden_rls_DOWN.sql — DELETADO de manual-rollbacks/ |
| 7 | C6 | 6.7 | GAP | DEPLOYMENT_GUIDE.md e RLS_SECURITY_DEFINER_HARDENING.md apontam para supabase/manual-rollbacks/ — diretório AGORA VAZIO (20260529120100_harden_rls_DOWN.sql deletado) |
| 8 | G4 | 6.6 | GAP | check-audit-docs-integrity.sh (quality-gate.yml) valida SÓ a estrutura de PLANO_IMPLEMENTACAO_100.md — NÃO há gate doc→arquivo: refs a scripts deletados passam no CI |
| 9 | D8 | 6.5 | PARCIAL | 58 migrações MANUAL sem down-script — rollback exige reconstrução manual a partir do git history (funções REPLACE, data migrations) |
| 10 | A2 | 6.2 | GAP | Novo workflow agendado (ou edição futura) referencia script deletado — sem gate de CI que valide referências a scripts/ |

## Gaps cross-cutting (entregável)

| # | GAP | Impacto | Guarda sugerida |
|---|---|---|---|
| 1 | **Sem gate doc→arquivo**: check-audit-docs-integrity.sh valida só PLANO_IMPLEMENTACAO_100.md (G4) | Docs operacionais apontam para scripts deletados sem CI falhar | Estender gate: grep nos docs por basenames de scripts deletados (`git ls-files --deleted` → lista de ausentes) |
| 2 | **manual-rollbacks/ vazio** com 2 docs apontando (C6/D4) | Rollback de emergência do harden_rls sem procedimento | Restaurar DOWN file de git history OU atualizar docs |
| 3 | **Revert/checkout cego restaura código morto** (D1/D2/D3) | Reintroduz 39 scripts + 1 broken-by-deps | Restaurar via lista explícita; nunca `checkout ~1 -- scripts/` inteiro; manifesto de intenção |
| 4 | **Job 116 órfão** (B1) — tabela sem escritor após deleção do rate-limiter | Proteção de rate-limit some silenciosamente | Decidir: restaurar módulo ou dropar job/tabela com doc |
| 5 | **Cron externo VPS não auditável** (A6/A8) | housekeeping.sh / schtasks fora do repo | Inventário de crons externos no repo (docs/db/CRONS.md + seção VPS) |
| 6 | **pyc de scripts deletados tracked** (F1) | Artefatos binários executáveis/enganosos | `git rm --cached` dos 2 pyc + .gitignore __pycache__ |

## Ações prioritárias (top 5)

1. **P0** — Restaurar `supabase/manual-rollbacks/20260529120100_harden_rls_DOWN.sql` de `ebf9558d5~1` (rollback asset de segurança).
2. **P0** — Corrigir docs operacionais: runbook APPLY_ZAPP_EVOLUTION_BRIDGES.md (remover opção A ou apontar psql), SCHEMA_SNAPSHOT_CI.md (usar workflow real), DEPLOYMENT_GUIDE.md/RLS_SECURITY_DEFINER_HARDENING.md (estado do manual-rollbacks).
3. **P1** — Estender quality-gate.yml: gate de integridade de referências (docs/runbooks → arquivos existentes; scripts/ → workflows).
4. **P1** — Resolver job 116 (purge-webhook-rate-limits-2h): restaurar módulo de rate-limit ou documentar/dropar o job.
5. **P2** — `git rm --cached` dos pyc stale + .gitignore `__pycache__`; criar manifesto da limpeza (docs/simulation ou docs/history) com a lista dos 1026 arquivos e intenção.
