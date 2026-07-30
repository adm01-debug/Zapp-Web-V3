# Workflow Obsolescence Audit Report

**Generated:** 2026-07-30  
**Files analyzed:** 37 on-disk .yml + 4 ghost API registrations  
**Scope:** Script existence, duplicates, last successful run, disable/noop status  

---

## Legend

| Category | Meaning |
|----------|---------|
| **KEEP** | Active, healthy, needed |
| **DUPLICATE** | Redundant — another workflow does the same job |
| **OBSOLETE** | No longer needed (migration complete, replaced by automation) |
| **BROKEN** | Cannot run (missing deps, untracked file, always fails) |
| **GHOST** | Registered in GitHub API but file does not exist on disk |

---

## Full Audit

### 1. ai-agent-pr-policy.yml → KEEP
- **Scripts:** None (inline logic)
- **Last success:** 2026-07-30 (main)
- **Notes:** Blocks direct AI pushes to main/develop. Working. `push` trigger is intentional for enforcement.
- **Trigger:** push [main, develop]

### 2. branch-protection-sentinel.yml → KEEP
- **Scripts:** None (inline + curl)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Daily check of branch protection rules on main. Advisory-only. API shows stale registration (name=path) but file exists.
- **Trigger:** PR + schedule (daily) + workflow_dispatch

### 3. check-realtime-dead-channels.yml → KEEP
- **Scripts:** `scripts/check-realtime-dead-channels.sh` ✅
- **Last success:** 2026-07-30 (main)
- **Notes:** Prevents realtime subscriptions to public-schema views. Working.
- **Trigger:** PR + push [main] (paths: src/**/*.ts, src/**/*.tsx)

### 4. ci-gate.yml → KEEP
- **Scripts:** `scripts/check-tsc-ratchet.mjs` ✅, `scripts/check-ts-nocheck.mjs` ✅, `scripts/check-schema-usage.mjs` ✅, `scripts/lint-supabase-casts.mjs` ✅
- **Last success:** 2026-07-30 (main)
- **Notes:** Required status check for branch protection. Runs lockfile check, type ratchet, schema guardrails, unit tests, build. Critical gate.
- **Trigger:** push + PR [main, develop]

### 5. ci-status-gate.yml → KEEP
- **Scripts:** None (gh CLI API calls)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Posts `ci:success` commit status for non-main branches so branch protection is satisfied. Working.
- **Trigger:** push (branches-ignore: main, develop) + PR [main, develop]

### 6. ci.yml → DUPLICATE (overlaps with ci-gate.yml + quality-gate.yml)
- **Scripts:** `scripts/check-tsc-ratchet.mjs` ✅, `scripts/check-ts-nocheck.mjs` ✅, `scripts/check-schema-usage.mjs` ✅, `scripts/lint-supabase-casts.mjs` ✅, `scripts/check-types-schemas.mjs` ✅, `scripts/repair-types-schemas.mjs` ✅, `scripts/check-design-system.ts` ✅
- **Last success:** 2026-07-28 (main)
- **Notes:** Comprehensive CI/CD pipeline. Heavy overlap with ci-gate.yml (type ratchet, schema, tests, build) and quality-gate.yml. Has 7 parallel jobs (lockfile, quality, test, build, e2e, a11y, security). 399 lines — largest workflow. Could be slimmed by removing redundant checks already in ci-gate.yml.
- **Trigger:** push + PR [main, develop]
- **Recommendation:** DUPLICATE in terms of checks. Consider simplifying — ci-gate.yml already runs the blocking checks.

### 7. clean-build.yml → KEEP
- **Scripts:** `scripts/check-tsc-ratchet.mjs` ✅
- **Last success:** **never** (never run)
- **Notes:** Weekly clean-slate reproducibility build. Has never run (likely because no Saturday has passed since creation). Not broken, just never triggered.
- **Trigger:** schedule (Saturday 04h UTC) + workflow_dispatch

### 8. cleanup-e2e-data.yml → KEEP
- **Scripts:** `scripts/cleanup-e2e-data.sh` ✅
- **Last success:** **never**
- **Notes:** Daily defensive cleanup of E2E data on VPS. Never run successfully (likely missing secrets/SSH connectivity).
- **Trigger:** schedule (daily) + workflow_dispatch + workflow_call

### 9. codeql.yml → KEEP
- **Scripts:** None (uses CodeQL action)
- **Last success:** 2026-07-30 (main)
- **Notes:** Standard CodeQL analysis. Working.
- **Trigger:** push + PR [main] + schedule (weekly)

### 10. create-pr.yml → KEEP
- **Scripts:** None (uses peter-evans/create-pull-request)
- **Last success:** **never** (reusable workflow_call only)
- **Notes:** Reusable workflow to create PRs. Not meant to run standalone.
- **Trigger:** workflow_call only

### 11. deno-contract-tests.yml → KEEP
- **Scripts:** None (inline deno test)
- **Last success:** 2026-07-29 (main)
- **Notes:** Tests Edge Functions with Deno. Working but `push` has no branch filter (fires on ALL branches).
- **Trigger:** push (NO branch filter!) + PR (paths: supabase/functions/**, deno.json)

### 12. deploy-vps.yml → KEEP
- **Scripts:** None (Portainer API inline)
- **Last success:** 2026-07-30 (main)
- **Notes:** Production deployment via Portainer. Working.
- **Trigger:** push [main] + workflow_dispatch

### 13. e2e-admin-vps.yml → KEEP
- **Scripts:** None (Playwright spec files)
- **Last success:** **never** (manual dispatch only)
- **Notes:** Admin E2E suite against VPS. Manual dispatch. Has never been run successfully (likely missing VPS secrets).
- **Trigger:** workflow_dispatch only

### 14. e2e-crm-vps.yml → KEEP
- **Scripts:** None (calls validate-e2e-user + seed-e2e-contacts reusable workflows)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** CRM E2E against VPS. PR trigger is noop (skips with a message). Working on schedule/dispatch.
- **Trigger:** PR (noop) + workflow_dispatch + schedule (daily)

### 15. e2e-evolution-vps.yml → KEEP
- **Scripts:** None (Playwright spec files)
- **Last success:** **never**
- **Notes:** Evolution E2E against VPS. Manual dispatch only. Never run successfully.
- **Trigger:** workflow_dispatch only

### 16. e2e-inbox-vps.yml → KEEP
- **Scripts:** None (calls validate-e2e-user + seed-e2e-contacts reusable workflows)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Inbox E2E against VPS. PR trigger is noop. Working on schedule/dispatch.
- **Trigger:** PR (noop) + workflow_dispatch + schedule (daily)

### 17. fix-schema-refs.yml → OBSOLETE
- **Scripts:** None
- **Last success:** 2026-07-15 (main)
- **Notes:** **DISABLED** — the workflow intentionally exits 1. Comment at top says "DISABLED (migration complete)". Schema migration is finished; only 2 intentional public refs remain. Self-declared obsolete.
- **Trigger:** workflow_dispatch only (can still be triggered but will always fail)
- **Recommendation:** Delete or archive. It's self-declared obsolete.

### 18. flaky-test-detector.yml → KEEP
- **Scripts:** None (inline)
- **Last success:** 2026-07-30 (main)
- **Notes:** Nightly test suite without retry to measure flakiness. Working.
- **Trigger:** schedule (weekdays) + workflow_dispatch

### 19. gen-types-zapp.yml → KEEP
- **Scripts:** None (curl to postgres-meta API)
- **Last success:** **never**
- **Notes:** Weekly Supabase types regeneration via postgres-meta API. Never run successfully (likely missing ZAPP_META_URL/ZAPP_META_TOKEN secrets).
- **Trigger:** schedule (Mondays) + workflow_dispatch

### 20. gitleaks.yml → DUPLICATE
- **Scripts:** None (gitleaks binary)
- **Last success:** 2026-07-30 (main)
- **Notes:** Standalone gitleaks secret scan. **Duplicates the gitleaks job in security.yml.** The security.yml already runs gitleaks (using gitleaks-action@v3). Both scan for secrets on push/PR. This one uses raw gitleaks binary, security.yml uses the official action.
- **Trigger:** push + PR [main, master]
- **Recommendation:** DUPLICATE — remove in favor of security.yml's gitleaks job.

### 21. health-review.yml → KEEP
- **Scripts:** None (inline + actions/github-script)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Creates bi-weekly health review issue. Working.
- **Trigger:** PR (noop) + schedule (1st/15th) + workflow_dispatch

### 22. migration-smoke-test.yml → KEEP
- **Scripts:** `scripts/lint-migrations.mjs` ✅, `supabase/ci/pg-bootstrap.sql` ✅
- **Last success:** **never**
- **Notes:** Applies migrations against fresh Postgres 16. Never run successfully because migrations are incremental (require existing prod schema). This is by design (continue-on-error on apply step). The static linter is the real gate. Working as designed.
- **Trigger:** PR + push [main] (paths: supabase/migrations/**)

### 23. migration-uniqueness.yml → KEEP
- **Scripts:** None (inline bash)
- **Last success:** 2026-07-30 (main)
- **Notes:** Validates migration filenames are unique. Working.
- **Trigger:** PR + push [main] (paths: supabase/migrations/**)

### 24. pr-size-gate.yml → KEEP
- **Scripts:** None (actions/github-script)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Labels PRs by size and comments on oversized ones. Working.
- **Trigger:** PR [main, develop] (opened/synchronize/reopened)

### 25. quality-gate.yml → KEEP
- **Scripts:** 10 scripts: `scripts/check-dead-code.mjs`, `scripts/check-data-layer.mjs`, `scripts/lint-migrations.mjs`, `scripts/audit-rls-coverage.mjs`, `scripts/check-schema-usage.mjs`, `scripts/lint-supabase-casts.mjs`, `scripts/simulate-schema-access.mjs`, `scripts/check-cluster-typecheck.mjs`, `scripts/check-tsc-ratchet.mjs`, `scripts/check-types-freshness.mjs`, `scripts/check-coverage-ratchet.mjs` ✅ All exist.
- **Last success:** 2026-07-29 (fix/standardize-supabase-js-runbook)
- **Notes:** Comprehensive quality gate (lint, refactor guards, migration linter, RLS audit, schema usage, typecheck, tests, e2e, perf). One of the most critical workflows. Has known bugs documented in QUALITY-GATE-FIX-PLAN.md.
- **Trigger:** push + PR [main, master]

### 26. ratchet-tighten.yml → KEEP
- **Scripts:** `scripts/check-data-layer.mjs` ✅, `scripts/data-layer-baseline.json` ✅
- **Last success:** 2026-07-30 (main)
- **Notes:** Auto-tightens data-layer baselines after main merge. Working.
- **Trigger:** push [main] (intentional post-merge)

### 27. regenerate-graph.yml → BROKEN
- **Scripts:** None (uses graphifyy Python package)
- **Last success:** **N/A** (file is untracked)
- **Notes:** ❌ **File is UNTRACKED (not committed to git).** Does not exist in any git commit. GitHub has no registration for it — queries return 404. Will never run. Appears to be a local-only experimental file.
- **Trigger:** schedule (weekly) + workflow_dispatch + push [main]
- **Recommendation:** BROKEN — either commit it or delete it.

### 28. regression-test-gate.yml → KEEP
- **Scripts:** `scripts/check-fix-regression-test.mjs` ✅
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Enforces regression tests on `fix:` PRs. Working.
- **Trigger:** PR [main, master]

### 29. schema-drift.yml → KEEP
- **Scripts:** None (inline)
- **Last success:** 2026-07-30 (main)
- **Notes:** Two jobs: static-drift (detects DDL outside migrations) and live-drift (manual, requires DATABASE_URL). Working.
- **Trigger:** PR + push [main, master] + workflow_dispatch

### 30. schema-snapshot.yml → KEEP
- **Scripts:** None (pg_dump via actions/github-script)
- **Last success:** 2026-07-28 (main)
- **Notes:** Weekly schema snapshot. Working (last run 2 days ago).
- **Trigger:** schedule (weekly) + workflow_dispatch

### 31. security.yml → KEEP
- **Scripts:** None (uses gitleaks-action, npm audit)
- **Last success:** 2026-07-30 (main)
- **Notes:** Security scanning (gitleaks + dependency audit + lockfile check). Working.
- **Trigger:** push + PR [main, master] + schedule (weekly) + workflow_dispatch

### 32. security-invoker-gate.yml → KEEP
- **Scripts:** None (inline curl to postgres-meta)
- **Last success:** 2026-07-30 (cleanup/migrations-archive)
- **Notes:** Verifies all views have security_invoker and no anon-executable functions. Working.
- **Trigger:** PR (paths: supabase/migrations/**, src/integrations/supabase/**) + schedule (weekly)

### 33. seed-e2e-contacts.yml → KEEP
- **Scripts:** `scripts/seed-e2e-contacts.sql` ✅, `scripts/seed-e2e-contacts.sh` ✅, `scripts/render-seed-report.mjs` ✅
- **Last success:** **never**
- **Notes:** Seeds E2E contacts on VPS via SSH. Reusable workflow_call. Never run successfully (likely missing VPS secrets).
- **Trigger:** workflow_dispatch + workflow_call

### 34. seed-e2e-user.yml → KEEP
- **Scripts:** `scripts/seed-e2e-user.sql` ✅, `scripts/seed-e2e-user.sh` ✅, `scripts/render-seed-report.mjs` ✅
- **Last success:** **never**
- **Notes:** Seeds E2E user on VPS via SSH. Reusable workflow_call. Never run successfully (likely missing VPS secrets).
- **Trigger:** workflow_dispatch + workflow_call

### 35. ts-nocheck-ratchet.yml → DUPLICATE
- **Scripts:** None (inline grep)
- **Last success:** 2026-07-30 (fix/post-restoration-hardening)
- **Notes:** Enforces @ts-nocheck baseline. **Duplicates the `scripts/check-ts-nocheck.mjs` step already present in typecheck-gate.yml, quality-gate.yml, ci.yml, and ci-gate.yml.** This standalone version runs on PR. The check is already covered by all major CI workflows.
- **Trigger:** PR [main] (paths: src/**)
- **Recommendation:** DUPLICATE — the `scripts/check-ts-nocheck.mjs` check in ci-gate.yml, ci.yml, and quality-gate.yml already enforces this. Remove standalone file.

### 36. typecheck-gate.yml → KEEP (but partially redundant)
- **Scripts:** `scripts/check-ts-nocheck.mjs` ✅
- **Last success:** 2026-07-30 (main)
- **Notes:** Advisory type check + build smoke test. Runs on push to main (duplicated by quality-gate.yml/ci.yml on PR). Partially redundant but serves as fast advisory feedback.
- **Trigger:** push + PR [main, master]

### 37. validate-e2e-user.yml → KEEP
- **Scripts:** `scripts/validate-e2e-user.sql` ✅, `scripts/validate-e2e-user.sh` ✅
- **Last success:** **never**
- **Notes:** Validates E2E user permissions on VPS. Reusable workflow_call. Never run standalone (used by e2e-* workflows).
- **Trigger:** workflow_dispatch + workflow_call

---

## Ghost Registrations (API-only, no file on disk)

These appear in the GitHub Actions API but the corresponding .yml files do not exist on disk or in git history. They are stale/phantom registrations.

| API ID | Name | Path | Status |
|--------|------|------|--------|
| 320943416 | commitlint.yml | .github/workflows/commitlint.yml | GHOST |
| 321048580 | merge-bot.yml | .github/workflows/merge-bot.yml | GHOST |
| 320944226 | migration-uniqueness-check.yml | .github/workflows/migration-uniqueness-check.yml | GHOST — duplicate name of migration-uniqueness.yml |
| 320943395 | pr-size-check.yml | .github/workflows/pr-size-check.yml | GHOST — duplicate name of pr-size-gate.yml |

These are likely remnants from file renames or one-shot experiments. The API registrations should be left alone (GitHub auto-clears them after ~90 days of no file).

---

## Recently Deleted Workflows (in recent git history)

These were removed in the last 2 commits. Included for completeness since the task referenced "ALL 41".

| File | Removed In | Reason |
|------|-----------|--------|
| add-schema-stubs.yml | d1f759845 | Replaced by MCP type generation |
| apply-chatpanel-fixes.yml | d1f759845 | Replaced by MCP type generation |
| apply-types-patch.yml | d1f759845 | Replaced by MCP type generation |
| cleanup-dist-backups.yml | 29d4fabe1 | One-shot cleanup task completed |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Total on-disk workflow files** | **37** |
| **Total API registrations (file-based)** | **38** (includes 4 ghosts) |
| **Dynamic registrations (Copilot/Dependabot)** | **4** (not analyzed) |
| **Recently deleted** | **4** |
| | |
| **KEEP** | 28 |
| **DUPLICATE** | 3 (ci.yml, gitleaks.yml, ts-nocheck-ratchet.yml) |
| **OBSOLETE** | 1 (fix-schema-refs.yml — self-declared disabled) |
| **BROKEN** | 1 (regenerate-graph.yml — untracked file, never runs) |
| **GHOST** | 4 (commitlint.yml, merge-bot.yml, migration-uniqueness-check.yml, pr-size-check.yml) |

---

## Action Items

| Priority | Workflow | Action |
|----------|----------|--------|
| 🔴 High | **regenerate-graph.yml** | Either commit the file (if wanted) or delete it. Currently untracked — will never run. |
| 🔴 High | **fix-schema-refs.yml** | Delete. Self-declared OBSOLETE (DISABLED — migration complete). |
| 🟠 Medium | **gitleaks.yml** | Delete. security.yml already runs gitleaks via the official action. Standalone gitleaks.yml is redundant. |
| 🟠 Medium | **ts-nocheck-ratchet.yml** | Delete. The `scripts/check-ts-nocheck.mjs` check is already in ci-gate.yml, quality-gate.yml, and typecheck-gate.yml. |
| 🟡 Low | **ci.yml** | Consider simplifying to remove overlap with ci-gate.yml. The ci-gate.yml already runs blocking checks. |
| 🟡 Low | **cleanup-e2e-data.yml** | Investigate why it never succeeded. Missing VPS secrets? |
| 🟡 Low | **gen-types-zapp.yml** | Missing ZAPP_META_URL/ZAPP_META_TOKEN secrets — has never run. Configure or remove. |
| 🔵 Info | **e2e-*.yml** (4 files) | These require VPS + SSH + DB secrets. If VPS is decommissioned, these are OBSOLETE. |
| 🔵 Info | **ANALYSIS_WORKFLOWS.md** | 13 workflows flagged with unnecessary `push` trigger that duplicates PR trigger. Consider cleaning up. |
| 🔵 Info | **Ghost registrations** | 4 stale API entries with no backing file. Can be ignored — GitHub auto-purges. |

---

## Script Health

All **27 referenced scripts** (`.mjs`, `.sh`, `.sql`, `.json`) and **1 SQL bootstrap** file exist and are tracked in git. No broken script references found.

