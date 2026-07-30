# Best-Practices Audit — All 37 Workflows

**Audited:** 2026-07-30
**Scope:** `.github/workflows/*.yml` (37 files found; user reference of "41" appears to count some non-existent or moved files)

**Checks performed:**
1. ✅ Missing `name:` field
2. ❌ Missing top-level `permissions:` block
3. ❌ Missing `concurrency:` group
4. ❌ Missing `timeout-minutes:` on jobs
5. ❌ Deprecated action versions

---

## 1. Missing `name:` — 0 violations ✅

All 37 workflows have a `name:` field. Clean.

---

## 2. Missing top-level `permissions:` — 19 violations ❌

Files with **no** top-level `permissions:` key (rely on GitHub's default permissive token):

| # | Workflow | Notes |
|---|----------|-------|
| 1 | `ai-agent-pr-policy.yml` | |
| 2 | `check-realtime-dead-channels.yml` | |
| 3 | `ci.yml` | |
| 4 | `ci-gate.yml` | |
| 5 | `clean-build.yml` | |
| 6 | `cleanup-e2e-data.yml` | |
| 7 | `e2e-admin-vps.yml` | |
| 8 | `e2e-crm-vps.yml` | Has job-level `permissions: {}` / `contents: read` on some jobs |
| 9 | `e2e-evolution-vps.yml` | |
| 10 | `e2e-inbox-vps.yml` | Has job-level `permissions: {}` / `contents: read` on some jobs |
| 11 | `flaky-test-detector.yml` | |
| 12 | `gitleaks.yml` | Only job-level permissions on `gitleaks` job |
| 13 | `health-review.yml` | Has job-level only |
| 14 | `migration-smoke-test.yml` | |
| 15 | `migration-uniqueness.yml` | |
| 16 | `quality-gate.yml` | |
| 17 | `regression-test-gate.yml` | |
| 18 | `schema-drift.yml` | |
| 19 | `ts-nocheck-ratchet.yml` | |

**Files WITH top-level `permissions:` (18/37):**
branch-protection-sentinel, ci-status-gate, codeql, create-pr, deno-contract-tests, deploy-vps, fix-schema-refs, gen-types-zapp, pr-size-gate, ratchet-tighten, regenerate-graph, schema-snapshot, security, security-invoker-gate, typecheck-gate, seed-e2e-contacts, seed-e2e-user, validate-e2e-user, cleanup-e2e-data

---

## 3. Missing `concurrency:` — 33 violations ❌

Only 4 workflows have `concurrency:` configured:
- `ci.yml`
- `ci-gate.yml`
- `deploy-vps.yml`
- `migration-smoke-test.yml`

All 33 remaining workflows are missing `concurrency:` — meaning overlapping runs on the same branch/ref will pile up rather than cancelling the in-progress one.

**Lower priority** for schedule-only or workflow_dispatch-only workflows, but should be added to PR-triggered workflows.

---

## 4. Missing `timeout-minutes:` — widespread ❌

Only **8 workflows** have any `timeout-minutes:` set on any job:

| Workflow | Job(s) with timeout |
|----------|---------------------|
| `ci.yml` | `e2e: 15`, `a11y: 15` |
| `clean-build.yml` | `clean-build: 30` |
| `codeql.yml` | `analyze: 30` |
| `e2e-admin-vps.yml` | `e2e-admin: 45` |
| `e2e-crm-vps.yml` | `e2e-crm: 45` |
| `e2e-evolution-vps.yml` | `e2e-evolution: 45` |
| `e2e-inbox-vps.yml` | `e2e-inbox: 60` |
| `flaky-test-detector.yml` | `flaky-baseline: 30` |
| `regenerate-graph.yml` | `regenerate-graph: 30` |

**Notable:** `ci.yml` has timeout only on `e2e` and `a11y` jobs but NOT on `lockfile`, `quality`, `test`, `build`, or `security` jobs — any of these could hang indefinitely.

**Recommendation:** Every job should have `timeout-minutes: 15` (short) to `60` (long e2e) depending on expected duration.

---

## 5. Deprecated Action Versions — 4 violations ❌

| Workflow | Line | Current Action | Should Be | Risk |
|----------|------|----------------|-----------|------|
| `gen-types-zapp.yml` | 19 | `oven-sh/setup-bun@v1` | `@v2` | May break when v1 is deprecated |
| `gen-types-zapp.yml` | 52 | `peter-evans/create-pull-request@v6` | `@v7` (used in `create-pr.yml`) | May break when v6 is deprecated |
| `typecheck-gate.yml` | 18 | `oven-sh/setup-bun@v1` | `@v2` | May break when v1 is deprecated |
| `gitleaks.yml` | 76 | `github/codeql-action/upload-sarif@v3` | `@v4` (CodeQL v4 is current since Oct 2025, v3 deprecated Dec 2026) | Urgent: v3 EOL Dec 2026 |

**Notes on other actions for awareness (not currently deprecated):**
- `actions/upload-artifact@v4` is widely used (28 workflows). v5/v6 exist but v4 is still maintained — no urgent action needed.
- `actions/checkout@v4` is widely used — v5/v6 exist but v4 is still supported.

---

## Summary

| Check | Violations | Severity |
|-------|-----------|----------|
| Missing `name:` | **0/37** | ✅ Clean |
| Missing top-level `permissions:` | **19/37 (51%)** | 🟡 Medium — principle of least privilege |
| Missing `concurrency:` | **33/37 (89%)** | 🟡 Medium — overlapping runs waste resources |
| Missing `timeout-minutes:` | **~29/37 (78%)** | 🟠 High — jobs can hang indefinitely |
| Deprecated action versions | **4 findings** | 🔴 High-Urgent — CodeQL v3 + setup-bun v1 |
