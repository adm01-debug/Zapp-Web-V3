# Workflow Trigger Analysis — All 39 Files

Generated: 2026-07-30

## Legend
| Column | Meaning |
|--------|---------|
| **#** | Count |
| **Name** | Workflow display name |
| **Trigger** | `on:` event(s) |
| **Push to main?** | Does it fire on push to main unnecessarily? |
| **Recommendation** | What should change |
| **Actions** | push / pull_request / workflow_dispatch / schedule / workflow_call |

---

| # | Workflow Name | File | Trigger Events | Unnecessary Push to Main? | Recommendation |
|---|---|---|---|---|---|
| 1 | AI Agent PR Policy | `ai-agent-pr-policy.yml` | `push [main, develop]` | **YES** — this checks PR policy but fires on push, which is redundant | Remove `push`; keep only `pull_request [main, develop]` |
| 2 | Apply ChatPanel Fixes | `apply-chatpanel-fixes.yml` | `workflow_dispatch` | No — manual only | ✅ Already correct |
| 3 | Apply types.ts patch | `apply-types-patch.yml` | `workflow_dispatch` | No — manual only | ✅ Already correct |
| 4 | Branch Protection Sentinel | `branch-protection-sentinel.yml` | `pull_request [main,master]` + `schedule` (daily) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 5 | Guard — Realtime Dead Channels | `check-realtime-dead-channels.yml` | `pull_request [main]` (path-filtered) + **`push [main]`** (path-filtered) | **YES** — `push [main]` duplicates PR check | Remove `push [main]` — PR already covers it |
| 6 | CI/CD Pipeline | `ci.yml` | **`push [main, develop]`** + `pull_request [main, develop]` | **YES** — `push [main, develop]` is redundant when PR triggers also fire | Remove `push [main, develop]`; PR trigger suffices |
| 7 | CI Gate | `ci-gate.yml` | **`push [main, develop]`** + `pull_request [main, develop]` | **YES** — but this is the **required status check** for branch protection. Removing push would break the branch protection gate (PR merges to main need this context). | Keep as-is due to branch protection requirement |
| 8 | CI Status Gate | `ci-status-gate.yml` | `push [branches-ignore: main, develop]` + `pull_request [main, develop]` + `workflow_dispatch` | No — explicitly excludes main | ✅ Already correct |
| 9 | Clean Build From Zero | `clean-build.yml` | `schedule` (weekly) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 10 | Cleanup E2E data (VPS) | `cleanup-e2e-data.yml` | `workflow_dispatch` + `workflow_call` + `schedule` (daily) | No — no push trigger | ✅ Already correct |
| 11 | CodeQL | `codeql.yml` | **`push [main]`** + `pull_request [main]` + `schedule` (weekly) | **YES** — push duplicates PR + schedule. However, push on main is standard security practice (catches merge skew) | Consider removing `push [main]` — PR + schedule is sufficient for security scanning |
| 12 | Create PR | `create-pr.yml` | `workflow_call` | No — reusable only | ✅ Already correct |
| 13 | Deno Contract Tests | `deno-contract-tests.yml` | **`push` (no branch filter!)** + `pull_request` | **YES** — `push` without branch filter fires on ALL branches, including main. Push is redundant given PR trigger | Add `branches: [main, develop]` filter to push, or remove push entirely |
| 14 | Build & Deploy — ZAPP web v3 | `deploy-vps.yml` | `push [main]` + `workflow_dispatch` | **NO** — push to main is the intended deployment trigger | ✅ Keep as-is (deployment workflow) |
| 15 | E2E Admin (VPS) | `e2e-admin-vps.yml` | `workflow_dispatch` | No — manual only | ✅ Already correct |
| 16 | E2E CRM (VPS) | `e2e-crm-vps.yml` | `pull_request [main, master]` + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 17 | E2E Evolution (VPS) | `e2e-evolution-vps.yml` | `workflow_dispatch` | No — manual only | ✅ Already correct |
| 18 | E2E Inbox (VPS) | `e2e-inbox-vps.yml` | `pull_request [main, master]` + `workflow_dispatch` + `schedule` (daily) | No — no push trigger | ✅ Already correct |
| 19 | Fix schema references | `fix-schema-refs.yml` | `workflow_dispatch` | No — manual only | ✅ Already correct |
| 20 | Flaky Test Detector | `flaky-test-detector.yml` | `schedule` (weekdays) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 21 | Generate Supabase Types | `gen-types-zapp.yml` | `schedule` (weekly) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 22 | Secret Scan (gitleaks) | `gitleaks.yml` | **`push [main, master]`** + `pull_request [main, master]` | **YES** — push to main duplicates PR. However, this is the standalone gitleaks workflow (separate from `security.yml` which also has gitleaks) | Remove `push [main, master]` — PR trigger covers it |
| 23 | Health Review Quinzenal | `health-review.yml` | `pull_request [main, master]` + `schedule` (biweekly) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 24 | Migration Smoke Test | `migration-smoke-test.yml` | `pull_request [main, develop]` (path-filtered) + **`push [main]`** (path-filtered) | **YES** — `push [main]` duplicates the PR check | Remove `push [main]` — PR trigger covers migration changes |
| 25 | Migration Uniqueness Gate | `migration-uniqueness.yml` | `pull_request` (path-filtered) + **`push [main]`** (path-filtered) | **YES** — `push [main]` duplicates the PR check | Remove `push [main]` — PR trigger covers it |
| 26 | PR Size Gate | `pr-size-gate.yml` | `pull_request [main, develop]` | No — no push trigger | ✅ Already correct |
| 27 | Quality Gate | `quality-gate.yml` | **`push [main, master]`** + `pull_request [main, master]` | **YES** — push to main duplicates PR check | Remove `push [main, master]` — PR trigger suffices |
| 28 | ratchet-tighten | `ratchet-tighten.yml` | `push [main]` | **NO** — this is intentional: auto-tightens baselines after merge to main | ✅ Keep as-is (post-merge automation) |
| 29 | Regenerate Knowledge Graph | `regenerate-graph.yml` | `schedule` (weekly) + `workflow_dispatch` + **`push [main]`** (path-filtered) | **NO** — push to main intentionally updates the graph after code changes | ✅ Keep as-is (post-merge automation) |
| 30 | Regression Test Gate | `regression-test-gate.yml` | `pull_request [main, master]` | No — no push trigger | ✅ Already correct |
| 31 | schema-drift-guard | `schema-drift.yml` | `pull_request [main, master]` (path-filtered) + **`push [main, master]`** + `workflow_dispatch` | **YES** — `push [main, master]` duplicates PR | Remove `push [main, master]` — PR trigger covers it |
| 32 | Schema Snapshot | `schema-snapshot.yml` | `schedule` (weekly) + `workflow_dispatch` | No — no push trigger | ✅ Already correct |
| 33 | Security & Compliance | `security.yml` | **`push [main, master]`** + `pull_request [main, master]` + `schedule` (weekly) + `workflow_dispatch` | **YES** — push to main duplicates PR + schedule. All steps are already advisory on PRs | Remove `push [main, master]` — PR + schedule covers everything |
| 34 | Guard — Security Invoker | `security-invoker-gate.yml` | `pull_request` (path-filtered) + `schedule` (weekly) | No — no push trigger | ✅ Already correct |
| 35 | Seed E2E contacts (VPS) | `seed-e2e-contacts.yml` | `workflow_dispatch` + `workflow_call` | No — manual only | ✅ Already correct |
| 36 | Seed E2E user (VPS) | `seed-e2e-user.yml` | `workflow_dispatch` + `workflow_call` | No — manual only | ✅ Already correct |
| 37 | TypeScript @ts-nocheck Ratchet | `ts-nocheck-ratchet.yml` | `pull_request [main]` (path-filtered) | No — no push trigger | ✅ Already correct |
| 38 | Typecheck Gate | `typecheck-gate.yml` | **`push [main, develop]`** + `pull_request [main, develop]` + `workflow_dispatch` | **YES** — push to main duplicates PR. However, may be needed for the required `ci` status check | Remove `push` if branch protection context is handled elsewhere; keep if it's the required check |
| 39 | Validate E2E user (VPS) | `validate-e2e-user.yml` | `workflow_dispatch` + `workflow_call` | No — reusable/manual only | ✅ Already correct |

---

## Summary

### Total workflows analyzed: **39**

### Trigger distribution:
| Trigger | Count |
|---------|-------|
| `push` | 16 workflows (including intentional deployment/post-merge ones) |
| `pull_request` | 22 workflows |
| `workflow_dispatch` | 24 workflows |
| `schedule` | 11 workflows |
| `workflow_call` | 5 workflows |

### Workflows unnecessarily firing on push to main (13 workflows):

These have a `push` trigger on `main`/`master` **and** an equivalent `pull_request` trigger, making the push redundant:

| # | Workflow | Why it's unnecessary |
|---|---|---|
| 1 | `ai-agent-pr-policy` | Push to main/develop blocked by branch protection; PR is the only valid entry |
| 5 | `check-realtime-dead-channels` | PR already checks the same paths |
| 6 | `ci.yml` | PR trigger checks the same changes |
| 7 | `ci-gate.yml` | PR trigger checks the same — **but keep as-is: this is the required status check context** |
| 11 | `codeql.yml` | PR + schedule covers all scanning scenarios |
| 13 | `deno-contract-tests` | Push has **no branch filter** — fires on ALL branches |
| 22 | `gitleaks.yml` | PR trigger covers it fully |
| 24 | `migration-smoke-test` | PR trigger covers migration changes on main target |
| 25 | `migration-uniqueness` | PR trigger covers migration changes |
| 27 | `quality-gate` | PR trigger covers the same checks |
| 31 | `schema-drift` | PR trigger covers schema changes |
| 33 | `security.yml` | PR + schedule covers everything |
| 38 | `typecheck-gate` | PR trigger covers typechecking |

### Workflows where push to main IS intentional:
- **`deploy-vps.yml`** — push to main triggers production deployment
- **`ratchet-tighten.yml`** — post-merge baseline tightening
- **`regenerate-graph.yml`** — post-merge knowledge graph update

### Candidates for `workflow_dispatch`-only conversion:
**None** are clear candidates for **exclusive** `workflow_dispatch` (all have valid triggers). However, the following automation-focused workflows could have their non-dispatch triggers narrowed:

| Workflow | Current Trigger | Suggested Change |
|---|---|---|
| `ai-agent-pr-policy` | `push [main, develop]` | Change to `pull_request [main, develop]` only |
| `check-realtime-dead-channels` | `push [main]` + `pull_request [main]` | Remove `push [main]` |
| `ci.yml` | `push [main, develop]` + `pull_request [main, develop]` | Remove `push` (unless needed for required check) |
| `codeql.yml` | `push [main]` + `pull_request [main]` + `schedule` | Remove `push [main]` |
| `deno-contract-tests` | `push` (no filter!) + `pull_request` | Add branch filter or remove push entirely |
| `gitleaks.yml` | `push [main, master]` + `pull_request [main, master]` | Remove `push` |
| `migration-smoke-test` | `push [main]` + `pull_request` | Remove `push [main]` |
| `migration-uniqueness` | `push [main]` + `pull_request` | Remove `push [main]` |
| `quality-gate` | `push [main, master]` + `pull_request` | Remove `push` |
| `schema-drift` | `push [main, master]` + `pull_request` + `workflow_dispatch` | Remove `push` |
| `security.yml` | `push [main, master]` + `pull_request` + `schedule` + `workflow_dispatch` | Remove `push` |
| `typecheck-gate` | `push [main, develop]` + `pull_request` + `workflow_dispatch` | Remove `push` |
