# Workflow Dependency Chain & Cascade Failure Analysis

**Repository:** `adm01-debug/zapp-web-v3`
**Date:** 2026-07-30
**Total Workflows:** 39

---

## 1. All 39 Workflows with Triggers

| # | Workflow | Triggers | Nature |
|---|----------|----------|--------|
| 1 | `ci-gate.yml` | push: main, develop; PR: main, develop | **BLOCKING** — required 'ci' check |
| 2 | `ci-status-gate.yml` | push: branches-ignore main/develop; PR: main, develop | SATISFIER — synthetic 'ci' check |
| 3 | `ci.yml` | push: main, develop; PR: main, develop | **BLOCKING** — 7 jobs pipeline |
| 4 | `quality-gate.yml` | push: main, master; PR: main, master | **BLOCKING** (mixed advisory/blocking steps) |
| 5 | `deploy-vps.yml` | push: main; workflow_dispatch | **PRODUCTION DEPLOY** |
| 6 | `regression-test-gate.yml` | PR: main, master | **BLOCKING** (ADVISORY=false) |
| 7 | `typecheck-gate.yml` | push: main, develop; PR: main, develop; wf_dispatch | **BLOCKING** — tsc --noEmit |
| 8 | `security-invoker-gate.yml` | PR (paths migrations/**); schedule: Mon | **BLOCKING** (when secrets available) |
| 9 | `security.yml` | push: main, master; PR: main, master; schedule: Mon | ADVISORY |
| 10 | `pr-size-gate.yml` | PR: main, develop (opened/synchronize/reopened) | ADVISORY — labels only |
| 11 | `clean-build.yml` | schedule: Sat 4am UTC; wf_dispatch | SCHEDULED |
| 12 | `codeql.yml` | push: main; PR: main; schedule: Mon 9am | ADVISORY |
| 13 | `gitleaks.yml` | push: main, master; PR: main, master | **BLOCKING** |
| 14 | `gen-types-zapp.yml` | schedule: Mon 6am UTC; wf_dispatch | SCHEDULED — auto-PR |
| 15 | `migration-smoke-test.yml` | PR (paths migrations/**); push: main (paths) | **BLOCKING** |
| 16 | `migration-uniqueness.yml` | PR (paths migrations/**); push: main (paths) | **BLOCKING** |
| 17 | `schema-drift.yml` | PR (src/**, supabase/**, infra/**); push: main, master; wf_dispatch | **BLOCKING** (static) |
| 18 | `schema-snapshot.yml` | schedule: Sun 4am UTC; wf_dispatch | SCHEDULED |
| 19 | `health-review.yml` | PR: main, master; schedule: 1st/15th; wf_dispatch | SCHEDULED |
| 20 | `flaky-test-detector.yml` | schedule: Mon-Fri 3am UTC; wf_dispatch | SCHEDULED |
| 21 | `e2e-admin-vps.yml` | workflow_dispatch | MANUAL |
| 22 | `e2e-crm-vps.yml` | PR: main, master (skipped); wf_dispatch | MANUAL/SCHEDULED |
| 23 | `e2e-evolution-vps.yml` | workflow_dispatch | MANUAL |
| 24 | `e2e-inbox-vps.yml` | PR: main, master (skipped); wf_dispatch; schedule: daily 9am | DAILY SCHEDULED |
| 25 | `seed-e2e-contacts.yml` | workflow_dispatch; workflow_call | **REUSABLE** |
| 26 | `seed-e2e-user.yml` | workflow_dispatch; workflow_call | **REUSABLE** |
| 27 | `validate-e2e-user.yml` | workflow_dispatch; workflow_call | **REUSABLE** |
| 28 | `cleanup-e2e-data.yml` | wf_dispatch; workflow_call; schedule: daily 7am | REUSABLE + SCHEDULED |
| 29 | `check-realtime-dead-channels.yml` | PR: main (src/**/*.ts, tsx); push: main | **BLOCKING** |
| 30 | `branch-protection-sentinel.yml` | PR: main, master; schedule: daily 6am; wf_dispatch | **BLOCKING** (PR mode) |
| 31 | `create-pr.yml` | workflow_call | **REUSABLE** |
| 32 | `ai-agent-pr-policy.yml` | push: main, develop | **BLOCKING** |
| 33 | `apply-chatpanel-fixes.yml` | workflow_dispatch | MANUAL |
| 34 | `apply-types-patch.yml` | workflow_dispatch | MANUAL |
| 35 | `fix-schema-refs.yml` | workflow_dispatch | MANUAL |
| 36 | `ratchet-tighten.yml` | push: main | AUTOMATIC |
| 37 | `ts-nocheck-ratchet.yml` | PR: main (path: src/**) | **BLOCKING** |
| 38 | `deno-contract-tests.yml` | push (paths supabase/functions/**); PR (paths) | **BLOCKING** |
| 39 | `.gitkeep` | — | Placeholder |

---

## 2. Dependency Map

### Implicit Trigger-based Dependencies (on push:main)

```
push:main
  ├── ci-gate.yml (REQUIRED 'ci' check — branch protection)
  ├── ci.yml (comprehensive pipeline: lockfile→quality→test→build→e2e)
  ├── quality-gate.yml (17 checks, mixed advisory/blocking)
  ├── gitleaks.yml (BLOCKING — secret scan)
  ├── ai-agent-pr-policy.yml (BLOCKING — enforces PR policy)
  ├── migration-smoke-test.yml (BLOCKING, if migrations changed)
  ├── migration-uniqueness.yml (BLOCKING, if migrations changed)
  ├── schema-drift.yml (BLOCKING static check)
  ├── check-realtime-dead-channels.yml (BLOCKING, if src/ changed)
  ├── deno-contract-tests.yml (BLOCKING, if edge funcs changed)
  ├── security.yml (ADVISORY)
  ├── codeql.yml (ADVISORY)
  ├── security-invoker-gate.yml (BLOCKING, if migrations touched)
  ├── ratchet-tighten.yml (auto-tightens baselines)
  └── deploy-vps.yml (PRODUCTION DEPLOY — Docker→GHCR→Portainer→Swarm)
```

### Explicit Job Dependencies (ci.yml)

```
lockfile ──┬──> quality ──┬──> test
           │              │
           ├──> build ────┼──> e2e (needs: build)
           │              └──> a11y (needs: build)
           └──> security (parallel)
```

### Reusable Workflow Call Graph (E2E VPS flows)

```
validate-e2e-user.yml (reusable)
  ├──> e2e-admin-vps.yml ──── e2e-admin job
  ├──> e2e-evolution-vps.yml ── e2e-evolution job
  │
  ├──> seed-e2e-contacts.yml (reusable) ──┐
  │    (called by e2e-crm & e2e-inbox)     ├──> e2e-crm job
  └──> e2e-inbox-vps.yml (daily+manual) ───┘
       (also calls seed-e2e-contacts)

cleanup-e2e-data.yml (daily + reusable) — independent cleanup
```

---

## 3. Cascade Failure Simulations

### SCENARIO 1: ci-gate FAILS

| Aspect | Detail |
|--------|--------|
| **Trigger** | Unit tests fail, TS ratchet violation, build breaks, etc. |
| **Failed check** | Required status check `ci` NOT posted |
| **Cascade effect** | **Branch protection blocks ALL PR merges** — no PR can merge to main/develop |
| **Blocked** (9) | ci-gate itself, ci.yml, quality-gate.yml, typecheck-gate.yml, ts-nocheck-ratchet.yml, branch-protection-sentinel.yml, check-realtime-dead-channels.yml, deno-contract-tests.yml, schema-drift.yml |
| **Still runs** (3) | pr-size-gate.yml, security.yml, gitleaks.yml (advisory) |
| **Prod deploy** | Still technically possible (deploy-vps.yml has no dependency) but deploying red CI is a process violation |
| **Mitigation** | ci-status-gate.yml exists but only runs on branches-ignore main/develop — it CANNOT satisfy the main-branch required check |

### SCENARIO 2: quality-gate FAILS

| Aspect | Detail |
|--------|--------|
| **Trigger** | E2E tests fail, RLS audit fails, TS ratchet, unit tests fail |
| **Cascade effect** | Quality gate is a required check — **PRs blocked from merging** |
| **Blocked** (4) | quality-gate, ci.yml (comprehensive), typecheck-gate, regression-test-gate |
| **Still runs** (3) | security.yml, codeql.yml, pr-size-gate.yml (advisory) |
| **Advisory steps** (pass without failing) | Lint, design-system, TypeScript GAR mismatch, coverage ratchet, fuzzing |
| **Key risk** | 17 mixed checks in one sequential job — a blocking E2E failure with fake Supabase creds means a false-positive blocks all work |

### SCENARIO 3: build FAILS

| Aspect | Detail |
|--------|--------|
| **Trigger** | Vite build fails OR Docker build fails OR TypeScript compilation error |
| **Cascade effect** | Blocks everything downstream of build |
| **Blocked** (5) | ci.yml e2e (needs build), ci.yml a11y (needs build), ci-gate build step, deploy-vps build-and-push, deploy-vps deploy job |
| **Prod deploy** | **IMPOSSIBLE** — no Docker image to deploy |
| **Worst case** | Build passes in ci.yml (different env/context) but fails in deploy-vps.yml — code was merged green but can't ship |

### SCENARIO 4: deploy FAILS

| Aspect | Detail |
|--------|--------|
| **Trigger** | Docker push to GHCR fails OR Portainer API auth fails OR container healthcheck fails |
| **Cascade effect** | Self-contained — only deploy-vps affected |
| **Blocked** (1) | deploy-vps deploy job |
| **Safety** | Swarm stack has `update_config.failure_action: rollback` with `order: start-first` — old version keeps serving |
| **Secrets SPOF** | `PORTAINER_URL` + `PORTAINER_API_TOKEN` must be configured in GitHub environments/production |
| **User impact** | **NONE** — previous version remains live |

### SCENARIO 5: Migration-related FAILURES

| Aspect | Detail |
|--------|--------|
| **Trigger** | SQL error in migration, duplicate migration name, DDL outside migrations/ |
| **Cascade effect** | **ANY PR touching supabase/migrations/ is blocked** |
| **Blocked** (4) | migration-smoke-test, migration-uniqueness, schema-drift (static), security-invoker-gate |
| **Key advantage** | Migration smoke test runs against **fresh PG16** — no production dependency, so failures are real code errors |
| **Security gap** | security-invoker-gate silently passes when `ZAPP_META_URL`/`ZAPP_META_TOKEN` secrets absent |

---

## 4. BLOCKING vs ADVISORY — Production Deploy Impact

### BLOCKING (16 workflows — block merge or production deploy)

| Workflow | Blocks | Why |
|----------|--------|-----|
| ci-gate.yml | PR merge | Required 'ci' check in branch protection |
| ci.yml | PR merge | Comprehensive pipeline; lockfile→quality→test→build→e2e |
| quality-gate.yml | PR merge | Required check; E2E, RLS, TS ratchet, unit tests |
| typecheck-gate.yml | PR merge | tsc --noEmit required |
| gitleaks.yml | PR merge | Secret scan, exit-code=1 |
| migration-smoke-test.yml | PR merge | Migration SQL errors |
| migration-uniqueness.yml | PR merge | Duplicate filenames |
| schema-drift.yml (static) | PR merge | DDL outside migrations/ |
| check-realtime-dead-channels.yml | PR merge | Dead subscriptions |
| branch-protection-sentinel.yml | PR merge | New console.log/explicit any |
| ts-nocheck-ratchet.yml | PR merge | @ts-nocheck count > 9 |
| deno-contract-tests.yml | PR merge | Edge function contract tests |
| security-invoker-gate.yml | PR merge | Views without security_invoker |
| ai-agent-pr-policy.yml | push:main | Direct AI-agent commits |
| deploy-vps.yml | **PRODUCTION** | Docker build + Portainer deploy |
| regression-test-gate.yml | PR merge | Enforces regression tests for fix: PRs |

### ADVISORY (never block deployment, warnings only)
- security.yml
- codeql.yml
- pr-size-gate.yml
- quality-gate.yml (partial: lint, design-system, GAR typecheck, coverage ratchet, fuzzing)
- flaky-test-detector.yml
- health-review.yml
- clean-build.yml
- regression-test-gate.yml (configurable: can be ADVISORY=true)

---

## 5. Critical Path & Single Points of Failure

### Critical Path to Production

```
PR opened → [14 gates] → MERGE to main → ci.yml runs → deploy-vps.yml → PRODUCTION
```

The minimum viable path: **PR → ci-gate → deploy-vps → PROD**

### Top 10 Single Points of Failure

| # | SPOF | Severity | Impact |
|---|------|----------|--------|
| 1 | **ci-gate is the single mandatory required check** | CRITICAL | If ci-gate has any false-positive, NO PR can merge. No alternative posts the 'ci' context for main-targeting PRs. |
| 2 | **quality-gate E2E blocks with fake backend** | HIGH | E2E tests use `https://example.supabase.co` — any test needing real backend will fail, blocking all PRs |
| 3 | **deploy-vps depends on Portainer API secrets** | HIGH | PORTAINER_URL + PORTAINER_API_TOKEN must be configured. No alternative deploy path exists |
| 4 | **No staging/pre-prod environment** | MEDIUM | Changes go PR→main→VPS directly. Runtime regressions hit production with no pre-deploy validation |
| 5 | **Lockfile verification custom script** | MEDIUM | 50+ line bash script with multiple edge-case patches already. A regression blocks all PRs |
| 6 | **No migration rollback validation** | MEDIUM | DOWN migrations not tested. Irreversible migration in production has no automated safety net |
| 7 | **ts-nocheck baseline blocks unrelated PRs** | LOW | File-count-based baseline. Adding @ts-nocheck to existing files can block even if total files unchanged |
| 8 | **quality-gate sequential execution** | MEDIUM | 17 checks in ONE job. No fail-fast; advisory steps run before blocking steps |
| 9 | **Security-invoker gate silently passes without secrets** | HIGH | ZAPP_META_URL/ZAPP_META_TOKEN required for real check. Missing secrets = blind pass |
| 10 | **Flaky detector never gates** | LOW | Nightly detection only warns. Flaky tests may mask real regressions |

---

## 6. Recommendations

1. **Add a staging deploy environment** — Deploy to staging first, run E2E against it, then promote to production (addresses SPOF #4)

2. **Parallelize quality-gate** — Split into 3 parallel jobs (static analysis, tests, schema checks) to fail faster (SPOF #8)

3. **Make security-invoker gate secrets-mandatory** — Fail with clear error if secrets absent (SPOF #9)

4. **Add synthetic context from typecheck-gate** — Make it post a 'typecheck' status so ci-gate failures don't block all merges (SPOF #1)

5. **Deploy-vps fallback path** — Manual SSH deploy script so Portainer API unavailability doesn't block deployments (SPOF #3)

6. **Add migration rollback test** — Validate every new migration has a DOWN migration (SPOF #6)

7. **E2E against real backend in ci.yml** — Use Supabase local stack or sandbox project (SPOF #2)

---

*Analysis generated 2026-07-30 from all 39 `.github/workflows/*.yml` files in `adm01-debug/zapp-web-v3`*
