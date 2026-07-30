# Workflow Deletion Plan

**Date:** 2026-07-30  
**Source:** ANALYSIS_WORKFLOWS.md + QUALITY-GATE-FIX-PLAN.md + manual audit of all 37 workflow YAML files  
**Total workflows audited:** 37  
**Categorized:** 2 → IMMEDIATELY_DELETE · 3 → DISABLE_FIRST · 14 → KEEP_BUT_FIX · 18 → KEEP

---

## 🛑 IMMEDIATELY_DELETE (2)

These are dead code — deleting them has zero impact and reduces CI noise.

### 1. `fix-schema-refs.yml` — OBSOLETE / SELF-DISABLED
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/fix-schema-refs.yml` |
| **Status** | Already disabled by its own code |
| **Justification** | The file header says: *"fix-schema-refs.yml — DISABLED (migration complete)"*. The only job runs `echo "Schema migration complete. Only 2 intentional public refs remain."` then `exit 1`. It only fires on `workflow_dispatch` so nobody can trigger it successfully anyway. |
| **Impact of deletion** | ✅ **None** — it's already non-functional. The comment in the file about the 2 remaining refs should be preserved in a doc if valuable, but the workflow itself is dead. |
| **Recommendation** | Delete the file. If the 2 remaining intentional refs are worth documenting elsewhere, move that info to `CLAUDE.md` or `docs/`. |

### 2. `gitleaks.yml` — DUPLICATE of `security.yml`
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/gitleaks.yml` |
| **Status** | Redundant duplicate |
| **Justification** | Both `gitleaks.yml` and `security.yml` run gitleaks secret scanning on push+PR to main/master. The `security.yml` version uses the official `gitleaks/gitleaks-action@v3` action (maintained, cached, supported). The standalone `gitleaks.yml` downloads the binary manually via curl (version 8.21.2 hardcoded — a maintenance burden). Running gitleaks twice on every PR doubles the wasted CI minutes. |
| **Impact of deletion** | ✅ **None** — `security.yml` already provides gitleaks scanning. De-duping saves ~2 min of CI per PR run. |
| **Recommendation** | Delete `gitleaks.yml`. Ensure `security.yml`'s gitleaks job has adequate coverage (it already uses `continue-on-error: true` and the official action). |

---

## ⏸ DISABLE_FIRST (3)

These should be disabled (set `on: workflow_dispatch` only or remove triggers) for 1-2 weeks. If nobody notices or complains, delete them. If they prove useful, fix and re-enable.

### 3. `ci-status-gate.yml` — OBSOLETE HACK
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-status-gate.yml` |
| **Status** | Historical workaround — superseded by `ci-gate.yml` |
| **Justification** | This workflow was created to fake a `ci:success` status check for branch protection before `ci-gate.yml` existed. It literally posts a hardcoded `ci:success` status without running any checks. Now that `ci-gate.yml` (which has 6 actual blocking checks) provides the real `ci` context, this workflow is a security hole — it reports `ci:success` for branches that never ran the real gate. Branches that *are not* main/develop still get a fake passing check. |
| **Impact of deletion** | 🟡 **Medium** — if some workflow or branch protection rule still depends on this fake status, removing it could cause "Expected — Waiting for status" errors. But since `ci-gate.yml` already provides the real `ci` context, this should be safe. |
| **Verification step** | Set `on: workflow_dispatch` only (no push/PR triggers). Wait 1 week. If no breakage, delete. |
| **Recommendation** | **Disable triggers first.** After 1 week, delete. |

### 4. `schema-snapshot.yml` — LOW VALUE / LIKELY BROKEN
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/schema-snapshot.yml` |
| Status | Weekly schema dump — depends on `SUPABASE_DB_URL` secret + `pg_dump` on runner |
| **Justification** | Runs weekly to dump `pg_dump --schema-only` and commit the result. However: (a) The `SUPABASE_DB_URL` secret may not be configured in all contexts (it's a production DB URL). (b) The `pg_dump` command runs inside `actions/github-script@v7` via `execSync` — pg_dump may not be installed on the default ubuntu runner (postgresql-client is not pre-installed). (c) The schema can already be inspected via migration files + the live `schema-drift-guard` in-cluster. The value proposition is minimal. |
| **Impact of deletion** | 🟢 **Low** — if it works, it's nice-to-have; if it doesn't (likely), it's just a silent failure. |
| **Recommendation** | Disable schedule trigger → set `workflow_dispatch` only. Delete after 2 weeks if no one uses it. |

### 5. `typecheck-gate.yml` — DUPLICATE / ADVISORY
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/typecheck-gate.yml` |
| Status | Advisory typecheck — duplicates checks in ci.yml, ci-gate.yml, quality-gate.yml |
| **Justification** | This runs `tsc --noEmit` (advisory, `continue-on-error: true`), a node typecheck, `check-ts-nocheck.mjs`, and a build smoke test. Every single one of these checks is already performed by **ci.yml** (TypeScript ratchet + ts-nocheck), **ci-gate.yml** (TS ratchet + ts-nocheck), and **quality-gate.yml** (cluster typecheck × 4 + TS Ratchet + ts-nocheck + build). This workflow adds zero unique value and doubles CI costs. If it provides a required status check context for branch protection, that should be re-pointed to `ci-gate.yml` instead. |
| **Impact of deletion** | 🟢 **Low** — all checks are duplicated in other workflows. Could cause a branch protection gap if it's the only required status check. |
| **Verification step** | Check branch protection settings → see if `typecheck-gate` is a required check. If so, add `typecheck` context to ci-gate.yml first, then disable. |
| **Recommendation** | **Disable triggers first.** After verifying no branch protection depends on it, delete. |

---

## 🔧 KEEP_BUT_FIX (14)

These workflows provide value but have bugs, redundant triggers, or configuration issues that must be addressed.

### 6. `quality-gate.yml` — 3 CRITICAL + 2 HIGH + 3 MEDIUM bugs (docs in QUALITY-GATE-FIX-PLAN.md)
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/quality-gate.yml` |
| Priority | 🔴 **HIGHEST** |
| **Issues** | **(Critical)** Shallow checkout breaks `git diff HEAD~1` in migration linter. Cluster typecheck blocking loses info on first failure. No `--frozen-lockfile` allows drift. **(High)** Fuzzing always fails (no supabase local) wasting 30-60s. Playwright installs all browsers (chromium only needed). **(Medium)** Missing concurrency group, no timeout-minutes, schema access step lacks advisory/blocking label. |
| **Impact if not fixed** | Silent false passes on migration linter → bad migrations could merge. CI time wasted: ~3-5 min per run (fuzzing + Playwright extra browsers). |
| **Fix reference** | See `QUALITY-GATE-FIX-PLAN.md` — patches 1-9 fully documented. |

### 7. `ci.yml` — Redundant push trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | `push [main, develop]` duplicates `pull_request [main, develop]` trigger. Push fires after merge when PR already ran the same checks. |
| **Impact** | Wastes ~8 min of CI per merge to main (5 jobs: lockfile, quality, test, build, a11y, security). |
| **Fix** | Remove `push` trigger OR keep only if it provides the required `ci` status check context (it doesn't — `ci-gate.yml` handles that). |

### 8. `ci-gate.yml` — Redundant push trigger (but keep if required for branch protection)
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ci-gate.yml` |
| Priority | 🔵 LOW |
| **Issue** | `push [main, develop]` duplicates PR trigger. However, this IS the required status check for branch protection, so push may be needed for the merge queue. |
| **Recommendation** | Keep as-is — ANALYSIS_WORKFLOWS.md flags it as intentionally kept due to branch protection requirement. |

### 9. `ai-agent-pr-policy.yml` — Wrong trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/ai-agent-pr-policy.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | Fires on `push [main, develop]` only. But branch protection should already block direct pushes to main. The check would only catch pushes to develop, which are expected for development branches. Never fires on PRs (where AI commits arrive). |
| **Impact** | The workflow as designed never catches its target scenario (AI commits in PRs). It only catches direct pushes to develop, which may be intentional. |
| **Fix** | Change to `pull_request [main]` trigger so it validates PRs targeting main. Also consider removing `push [develop]` — it adds noise. |

### 10. `check-realtime-dead-channels.yml` — Redundant push trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/check-realtime-dead-channels.yml` |
| Priority | 🔵 LOW |
| **Issue** | `push [main]` + `pull_request [main]` with same path filters. Push is redundant. |
| **Fix** | Remove `push [main]` — PR trigger covers the same changes. |

### 11. `codeql.yml` — Redundant push trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/codeql.yml` |
| Priority | 🔵 LOW |
| **Issue** | `push [main]` + `pull_request [main]` + `schedule` (weekly). Push adds no coverage. |
| **Fix** | Remove `push [main]` — PR + weekly schedule covers all scanning scenarios. |

### 12. `deno-contract-tests.yml` — Branch filter missing on push
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/deno-contract-tests.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | Push trigger has **no branch filter** — fires on pushes to ALL branches including feature branches and main. Combined with the PR trigger (which is path-filtered), push can double-fire. |
| **Impact** | Extra CI runs on every branch push touching `supabase/functions/`. |
| **Fix** | Add `branches: [main, develop]` filter to push, or remove push entirely (PR trigger is sufficient). |

### 13. `migration-smoke-test.yml` — Redundant push trigger + known-limitation architecture
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/migration-smoke-test.yml` |
| Priority | 🟡 MEDIUM |
| **Issues** | (1) `push [main]` duplicates PR trigger. (2) The "apply from scratch" step is documented as knowingly failing (*"This is expected for incremental schemas"*). The static linter is the real gate, but the misleading "apply" step runs anyway adding ~2 min of noise. |
| **Fix** | Remove `push [main]` trigger. Consider whether the always-failing apply-from-scratch step should be skipped entirely when it's known to fail. |

### 14. `migration-uniqueness.yml` — Redundant push trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/migration-uniqueness.yml` |
| Priority | 🔵 LOW |
| **Issue** | `push [main]` + `pull_request` with path filters. Push is redundant. |
| **Fix** | Remove `push [main]` — PR trigger covers migration changes. |

### 15. `security.yml` — Redundant push trigger + potential gitleaks double-run (if #2 not deleted)
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/security.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | `push [main, master]` duplicates PR trigger. Also, both security.yml and gitleaks.yml run gitleaks. |
| **Fix** | Remove `push [main, master]` — PR + weekly schedule covers all security scanning scenarios. Also delete `gitleaks.yml` (#2 in this plan). |

### 16. `schema-drift.yml` — Redundant push trigger
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/schema-drift.yml` |
| Priority | 🔵 LOW |
| **Issue** | `push [main, master]` (unfiltered) + `pull_request` (path-filtered) same coverage. |
| **Fix** | Remove `push [main, master]` trigger — PR trigger is path-filtered and sufficient. |

### 17. `typecheck-gate.yml` — see DISABLE_FIRST section (item #5)

### 18. `security-invoker-gate.yml` — BROKEN quoting
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/security-invoker-gate.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | Lines 34 and 53 have broken string quoting: `-H "apikey: *** \` — the closing quote is missing (`\"` at end of line is escaped wrong). This means the curl commands probably fail or send malformed headers. |
| **Impact** | The live security check may silently fail, giving a false sense of security. The step exits 0 when secrets are missing, so it only offers value when secrets ARE configured — but then the broken quoting sabotages it. |
| **Fix** | Fix quoting on lines 34 and 53: change `"apikey: *** \` to properly quoted `"apikey: ${{ secrets.META_TOKEN }}"`. |

### 19. `gen-types-zapp.yml` — BROKEN token interpolation
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/gen-types-zapp.yml` |
| Priority | 🟡 MEDIUM |
| **Issue** | Lines 36-37: `-H "apikey: *** secrets.ZAPP_META_TOKEN }}"` — missing `${{` before `secrets`, and the `***` appears to be a redaction placeholder that was accidentally committed. This means the curl request sends an invalid API key header, likely resulting in a 401 and failed type generation. |
| **Impact** | Automatic type generation via schedule or workflow_dispatch produces an empty/invalid `types.ts` (the script checks for valid output, so it doesn't corrupt — it just silently does nothing). The workflow runs but never accomplishes its goal. |
| **Fix** | Fix lines 36-37: change `"apikey: *** secrets.ZAPP_META_TOKEN }}"` → `"apikey: ${{ secrets.ZAPP_META_TOKEN }}"` and the Authorization header similarly. |

### 20. `regression-test-gate.yml` — Purely advisory standalone (absorb into quality-gate)
| Field | Value |
|-------|-------|
| **File** | `.github/workflows/regression-test-gate.yml` |
| Priority | 🔵 LOW |
| **Issue** | Standalone advisory check (`continue-on-error: true`). Runs `check-fix-regression-test.mjs` but never blocks CI. Could be absorbed into `quality-gate.yml` as an advisory step. |
| **Recommendation** | Absorb into `quality-gate.yml` as an advisory step, then delete this file. |

---

## ✅ KEEP (18)

These workflows are **fine as-is** — correct triggers, no bugs, no duplicates.

| # | Workflow | Reason |
|---|----------|--------|
| 1 | `deploy-vps.yml` | Push to main is the intended deploy trigger. Correct. |
| 2 | `branch-protection-sentinel.yml` | PR + schedule + workflow_dispatch. Correct triggers. |
| 3 | `clean-build.yml` | Schedule + workflow_dispatch only. Correct. |
| 4 | `cleanup-e2e-data.yml` | workflow_dispatch + workflow_call + schedule. Correct. |
| 5 | `create-pr.yml` | Reusable workflow_call only. Correct. |
| 6 | `e2e-admin-vps.yml` | workflow_dispatch only. Correct. |
| 7 | `e2e-crm-vps.yml` | pull_request + workflow_dispatch. PR trigger correctly skips actual tests (no VPS access). Correct. |
| 8 | `e2e-evolution-vps.yml` | workflow_dispatch only. Correct. |
| 9 | `e2e-inbox-vps.yml` | pull_request + workflow_dispatch + schedule. PR trigger correctly skips actual tests. Correct. |
| 10 | `flaky-test-detector.yml` | Schedule + workflow_dispatch only. Correct. |
| 11 | `health-review.yml` | Pull_request + schedule + workflow_dispatch. PR correctly skipped. Correct. |
| 12 | `pr-size-gate.yml` | pull_request only. Correct. |
| 13 | `ratchet-tighten.yml` | push [main] is intentional (post-merge automation). Correct. |
| 14 | `regenerate-graph.yml` | push [main] is intentional (post-merge KG update) + schedule + workflow_dispatch. Correct. |
| 15 | `security-invoker-gate.yml` | pull_request + schedule only. (Needs fix for broken quoting but the trigger is fine.) |
| 16 | `seed-e2e-contacts.yml` | workflow_dispatch + workflow_call only. Correct. |
| 17 | `seed-e2e-user.yml` | workflow_dispatch + workflow_call only. Correct. |
| 18 | `validate-e2e-user.yml` | workflow_dispatch + workflow_call only. Correct. |
| 19 | `ts-nocheck-ratchet.yml` | pull_request [main] path-filtered. Correct. |

---

## 📊 Summary by Category

| Category | Count | Action |
|----------|-------|--------|
| **IMMEDIATELY_DELETE** | 2 | Delete now: `fix-schema-refs.yml`, `gitleaks.yml` (duplicate) |
| **DISABLE_FIRST** | 3 | Set to `workflow_dispatch` only: `ci-status-gate.yml`, `schema-snapshot.yml`, `typecheck-gate.yml` |
| **KEEP_BUT_FIX** | 14 | Fix bugs/triggers documented above (see #6–#20) |
| **KEEP** | 18 | No action needed |
| **Total** | **37** | |

## 📈 Estimated CI Savings After Cleanup

| Action | Savings per merge | Savings per week |
|--------|-----------------:|-----------------:|
| Delete `gitleaks.yml` | ~2 min | ~10 min |
| Remove redundant push triggers (13 workflows) | ~15-20 min | ~30 min |
| Fix `quality-gate.yml` fuzzing + Playwright | ~4 min | ~20 min |
| Disable `ci-status-gate.yml` | ~30 sec | ~2 min |
| **Total estimated savings** | **~22-26 min per merge** | **~62 min/week** |

## 🚦 Recommended Execution Order

1. **Phase 1 (immediate):** Delete `fix-schema-refs.yml` and `gitleaks.yml`
2. **Phase 2 (this sprint):** Apply all patches from `QUALITY-GATE-FIX-PLAN.md` to `quality-gate.yml`
3. **Phase 3 (this sprint):** Fix broken quoting in `security-invoker-gate.yml` and `gen-types-zapp.yml`
4. **Phase 4 (this sprint):** Remove redundant push triggers from 12 workflows
5. **Phase 5 (monitor):** Disable `ci-status-gate.yml`, `schema-snapshot.yml`, `typecheck-gate.yml` triggers
6. **Phase 6 (after 1-2 weeks):** Delete disabled workflows if no breakage reported
