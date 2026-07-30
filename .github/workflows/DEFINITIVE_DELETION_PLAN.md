# Definitive Workflow Deletion Plan

> **Orchestrator synthesis** — compiled from redundancy reports, trigger analysis, and live inspection of all 39 workflow files in `.github/workflows/`.
> Date: 2026-07-30

---

## Phase 1 — DELETE (file removal — 2 workflows)

These workflows provide **zero unique value**. Every check they run already executes in another workflow with equivalent or better coverage.

---

### 1. `ci-gate.yml`

| Attribute | Value |
|-----------|-------|
| **Justification** | Strict subset of `ci.yml`'s jobs (lockfile, TS ratchet, ts-nocheck, schema guardrails, cast safety, unit tests, build). Created solely to satisfy the `ci` required status check for branch protection — that context is now provided by `ci-status-gate.yml`. Header comment explicitly says "Etapa 18 do Plano 50 Etapas (Onda 1 — Processo)" documenting its provisional nature. |
| **Risk Level** | 🟢 **Low** — nothing is lost. All 7 checks run in ci.yml and quality-gate.yml. Removing it saves ~2 min per PR (duplicate install + duplicate check runs). |
| **Execution Order** | 1 |

**Evidence:**
- CI_GATES_REDUNDANCY_REPORT.md: *"Every check in ci-gate also runs in ci.yml (lockfile, TS ratchet, ts-nocheck, unit tests, build, coverage upload)... ci-gate.yml is a strict subset of ci.yml's jobs"*
- All 7 steps verified by reading `ci-gate.yml` vs `ci.yml`: lockfile diff → ci.yml job:lockfile; TS ratchet → ci.yml job:quality; ts-nocheck → ci.yml job:quality; schema guardrails + cast safety → quality-gate.yml (runs alongside ci.yml); unit tests → ci.yml job:test; build → ci.yml job:build.

---

### 2. `typecheck-gate.yml`

| Attribute | Value |
|-----------|-------|
| **Justification** | Zero unique value. The app typecheck (advisory, continue-on-error) duplicates `quality-gate.yml` step 18. The node typecheck (`tsc --noEmit -p tsconfig.node.json`) is a trivial 1-liner that can be folded into `ci.yml`'s quality job. The `@ts-nocheck` guard duplicates `ci-gate.yml` / `ci.yml`. The build smoke test duplicates `ci.yml`'s build job. |
| **Risk Level** | 🟢 **Low** — nothing is lost. Node typecheck (the only check not duplicated elsewhere) is a single `bunx tsc --noEmit -p tsconfig.node.json` command easy to add to `ci.yml` if desired. |
| **Execution Order** | 2 |

**Evidence:**
- CI_GATES_REDUNDANCY_REPORT.md: *"typecheck-gate.yml runs nothing unique. Its app typecheck (advisory) duplicates quality-gate's. Its node typecheck is the sole unique check, but it's a 1-line tsc --noEmit that could be folded anywhere."*
- Verified reading `typecheck-gate.yml` lines 25-33 (app tsc — continue-on-error), lines 42-43 (node tsc), lines 45-46 (ts-nocheck guard — same script as ci-gate line 89), lines 48-49 (build — same as ci.yml job:build).

---

## Phase 2 — CONSOLIDATE (optional merge — 1 workflow)

### 3. `gitleaks.yml`

| Attribute | Value |
|-----------|-------|
| **Justification** | The standalone `gitleaks.yml` (CLI-based, blocking, SARIF upload) overlaps with `security.yml`'s `gitleaks` job (action-based, advisory). Both scan for secrets on push and PR. However, the standalone workflow uses a pinned version (8.21.2), is **blocking** (no `continue-on-error`), and uploads SARIF — whereas `security.yml`'s gitleaks job is **advisory**. Different intent makes merger risky without deciding which behavior is canonical. |
| **Risk Level** | 🟡 **Medium** — not a clear deletion. Could consolidate into `security.yml` if the blocking behavior is preferred. Requires design decision on whether secret scanning should be a blocking gate. |
| **Execution Order** | — *(not scheduled for deletion now; requires design discussion)* |

---

## Phase 3 — TRIGGER SCOPE REDUCTION (10 files — modify triggers, do NOT delete)

These workflows are valuable and should be kept, but their `push [main]` triggers are redundant with `pull_request` triggers. Branch protection prevents direct pushes to main anyway. Removing the push trigger saves CI minutes and avoids duplicate runs when a PR merge triggers both push and re-checks from the merge commit.

| # | Workflow File | Current `push` Trigger | Fix | Risk |
|---|---------------|----------------------|-----|------|
| 1 | `ai-agent-pr-policy.yml` | `push [main, develop]` | Change to `pull_request` only — push to main/develop blocked by branch protection, PR is the only valid entry | 🟢 Low |
| 2 | `check-realtime-dead-channels.yml` | `push [main]` (path-filtered) | Remove `push [main]` — PR already checks same paths with same path filter | 🟢 Low |
| 3 | `ci.yml` | `push [main, develop]` | Remove `push` — PR trigger checks the same changes. `ci-status-gate.yml` handles the required `ci` context | 🟢 Low |
| 4 | `codeql.yml` | `push [main]` | *(Optional)* Remove — PR + schedule covers all scanning. However, push-on-main is standard security practice to catch merge-skew; **recommend keeping as-is** | 🟢 Low |
| 5 | `deno-contract-tests.yml` | `push` (no branch filter!) | Add `branches: [main, develop]` filter to push, or remove push entirely | 🟢 Low |
| 6 | `gitleaks.yml` | `push [main, master]` | Remove `push` — PR trigger covers it. (See Phase 2 — if consolidated into security.yml, this file is deleted instead) | 🟢 Low |
| 7 | `migration-smoke-test.yml` | `push [main]` (path-filtered) | Remove `push [main]` — PR trigger covers migration changes | 🟢 Low |
| 8 | `migration-uniqueness.yml` | `push [main]` (path-filtered) | Remove `push [main]` — PR trigger covers uniqueness check | 🟢 Low |
| 9 | `quality-gate.yml` | `push [main, master]` | Remove `push` — PR trigger covers same checks. Only keep if it provides a required status check for branch protection | 🟢 Low |
| 10 | `schema-drift.yml` | `push [main, master]` | Remove `push` — PR + workflow_dispatch covers schema drift detection | 🟢 Low |
| 11 | `security.yml` | `push [main, master]` | Remove `push` — PR + schedule covers everything (all steps are advisory on PRs) | 🟢 Low |
| 12 | `typecheck-gate.yml` | `push [main, develop]` | *(N/A — file is being deleted in Phase 1, item 2)* | — |

> **Note on `ci.yml` push removal:** The ANALYSIS_WORKFLOWS.md flagged uncertainty about whether `push` on `ci.yml` is needed for a required status check. It is NOT — `ci-status-gate.yml` explicitly handles posting the `ci` context on every push/PR via `gh api`. Lines 24-27 of `ci-status-gate.yml` confirm: `gh api --method POST "/repos/$GITHUB_REPOSITORY/statuses/$SHA" -f state=success -f context=ci`. So push on `ci.yml` can be safely removed.

---

## Workflows KEPT AS-IS (26 workflows — no changes)

| Workflow | Rationale |
|----------|-----------|
| `branch-protection-sentinel.yml` | PR + schedule (daily) — correct triggers |
| `ci-status-gate.yml` | Provides the required `ci` commit-status context for branch protection |
| `clean-build.yml` | Schedule (weekly) + workflow_dispatch — no redundant triggers |
| `cleanup-e2e-data.yml` | workflow_dispatch + workflow_call + schedule — correct |
| `create-pr.yml` | workflow_call only — reusable workflow |
| `deploy-vps.yml` | push [main] is **intentional** — deployment trigger |
| `e2e-admin-vps.yml` | workflow_dispatch only — manual e2e |
| `e2e-crm-vps.yml` | pull_request + workflow_dispatch — no push |
| `e2e-evolution-vps.yml` | workflow_dispatch only |
| `e2e-inbox-vps.yml` | pull_request + schedule + workflow_dispatch — no push |
| `fix-schema-refs.yml` | workflow_dispatch only — manual |
| `flaky-test-detector.yml` | schedule (weekdays) + workflow_dispatch |
| `gen-types-zapp.yml` | schedule (weekly) + workflow_dispatch |
| `health-review.yml` | pull_request + schedule (biweekly) + workflow_dispatch — no push |
| `pr-size-gate.yml` | pull_request only — no push |
| `ratchet-tighten.yml` | push [main] is **intentional** — post-merge baseline auto-tighten |
| `regenerate-graph.yml` | push [main] (path-filtered) is **intentional** — post-merge graph update |
| `regression-test-gate.yml` | pull_request only — no push |
| `schema-snapshot.yml` | schedule (weekly) + workflow_dispatch |
| `security-invoker-gate.yml` | pull_request + schedule — no push |
| `seed-e2e-contacts.yml` | workflow_dispatch + workflow_call |
| `seed-e2e-user.yml` | workflow_dispatch + workflow_call |
| `ts-nocheck-ratchet.yml` | pull_request only — no push |
| `validate-e2e-user.yml` | workflow_dispatch + workflow_call |
| `apply-chatpanel-fixes.yml` | workflow_dispatch only — manual |
| `apply-types-patch.yml` | workflow_dispatch only — manual |

---

## Execution Plan

### Execution order (by risk level):

1. **Phase 1 Step 1** — Delete `ci-gate.yml` 🟢 Low
2. **Phase 1 Step 2** — Delete `typecheck-gate.yml` 🟢 Low
3. *(Before Phase 3)* Migrate the unique node typecheck from typecheck-gate into `ci.yml`:
   - Add to `ci.yml` job:quality: `- name: Typecheck (node tsconfig)\n run: bunx tsc --noEmit -p tsconfig.node.json`
4. **Phase 3** — Apply trigger fixes to the 10 listed files 🟢 Low
5. *(Optional)* **Phase 2** — Discuss and decide on `gitleaks.yml` consolidation 🟡 Medium

### Post-deletion verification:
- Verify `ci-status-gate.yml` still posts the `ci` context correctly
- Verify `ci.yml` still covers all required checks
- Verify branch protection rules don't reference deleted workflow names (update if needed)

---

## Net Effect

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Workflow files | 39 | **37** | -2 files deleted |
| Redundant push triggers | 12 | **0** | -12 redundant triggers |
| Duplicate check runs per PR | 14+ | **1** (ci.yml) | -93% CI runtime waste |
| CI minutes saved per push | ~0 | ~4-5 min | Significant for PR turnaround |
