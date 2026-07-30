# CI/CD Fix Priorities — Consolidated Report

> **Date:** 2026-07-30
> **Repo:** adm01-debug/zapp-web-v3
> **Commit:** 2cb8c78271cd29b97d9ed81bf0e7b31bf6408934
> **Pipeline:** #3053 (CI/CD Pipeline — FAILED)
> **Ref:** `main`

---

## 1. types.ts Status ✅ FIXED (commit 2cb8c78)

The Supabase types file (`src/integrations/supabase/types.ts`) was regenerated with schemas `zapp+evo+public`. This fixes the previous schema stub issues. The Quality Diagnostics job in #3053 confirmed:

- ✅ Supabase schema coverage gate passed (zapp + evo)
- ✅ TypeScript check (ratchet, blocking) — passed
- ✅ TypeScript check — chat components (blocking, strict) — passed
- ✅ ts-nocheck drift gate (blocking) — passed

**Status:** RESOLVED. No action needed.

---

## 2. CI/CD Pipeline #3053 — Root Cause Analysis

### 2A. Unit Tests — Sprint1 Security Hardening ❌

**Root cause:** `src/__tests__/sprint1-security-hardening.test.ts` greps migration SQL files for function definitions matching `public.<fn_name>` with specific SECURITY DEFINER guard patterns. The test expects functions like `pause_instance`, `unpause_instance`, `manage_department_member`, etc. to be defined under the `public` schema.

**Failures (9 tests in 1 file, 7520 passed / 37 skipped out of 7566):**
- HIGH-1: 6 functions with `SECURITY DEFINER` guards — functions not found in migrations or guard patterns don't match
- HIGH-2: `prevent_role_escalation` — RAISE EXCEPTION pattern not found
- HIGH-3: `notify_sicoob_on_reply` — current_setting check and outbox INSERT pattern not found

**Likely cause:** Functions were moved from `public` to `zapp` schema following the schema architecture (per AGENTS.md, `public` is only for views/RPCs). The test still searches for `public.<fn>` but the latest migration defines them under `zapp.<fn>` or the migration the test is looking for doesn't exist in the current migration history.

**Fix needed:** Update the test regex to search for functions in both `public` and `zapp` schemas, or update the migration to ensure the function definitions exist.

### 2B. E2E Tests — boot-resilience ❌

**Root cause:** `boot-resilience.spec.ts:40` — "SPA monta e não reloada em loop com backend inacessível" failed on all 3 retries. The E2E test verifies the app mounts without infinite reloading when the backend is offline.

**Likely cause:** Environmental — the test relies on the VPS backend state. In CI, the mock backend or the app's behavior when backend is unreachable doesn't match production expectations.

**Fix needed:** 
- Investigate if the mock environment correctly simulates backend offline
- Or mark as flaky and skip in CI

---

## 3. Build & Deploy (deploy-vps.yml) — Portainer Token ❌

**Root cause:** The "Build & push image" job failed in run #366 (same commit as #3052), not the "Deploy to VPS" job. The "Deploy to VPS" job was skipped because the build step failed first.

The deploy job checks for `PORTAINER_API_TOKEN` and `PORTAINER_URL` secrets in the `production` GitHub environment. If these aren't configured, the job fails.

**Fix needed:**
1. Verify `PORTAINER_API_TOKEN` and `PORTAINER_URL` secrets are set in Settings → Environments → production
2. Check the `PORTAINER_URL` endpoint is reachable from GitHub Actions runners
3. The "Build & push image" failure might be a separate Docker/GHCR issue

---

## 4. CI Gate / Quality Gate / Typecheck Gate ❌

These are separate workflows that also failed alongside the CI/CD Pipeline. Since the Quality Diagnostics job within #3053 passed its TypeScript checks, these gate failures could be:

1. **CI Gate** (ci-gate.yml) — runs its own set of checks (lockfile, TS ratchet, ts-nocheck, schema usage, supabase casts, unit tests, build). If it failed, it was likely the same unit test failure (sprint1) propagating.

2. **Quality Gate** — likely an organizational-level status check that aggregates CI results.

**Fix needed:** These will auto-resolve once the root causes (sprint1 tests, Portainer token) are fixed.

---

## 5. Legacy `apply-*` Workflows ❌

Three legacy workflows consistently fail:

| Workflow | Status | Notes |
|---|---|---|
| `apply-chatpanel-fixes.yml` | ❌ Fails | Tries to apply chat panel migration script — fails because branch protection prevents direct pushes. Creates PR instead. |
| `apply-types-patch.yml` | ❌ Fails | Same issue — attempts to patch types.ts but triggers branch protection |
| `add-schema-stubs.yml` | ❌ Fails | File is empty (0 bytes) on disk — needs removal |

**Root cause:** These workflows were designed for direct push to `main`, but branch protection is now active. They've been partially migrated to create PRs, but still fail:

- `apply-chatpanel-fixes.yml`: Fails because the migration script errors or creates a PR that already exists
- `apply-types-patch.yml`: Same — the patch is already applied (types.ts is fixed), so "no changes" but the workflow still fails on the diff check
- `add-schema-stubs.yml`: File is empty (0 bytes on disk) — needs to be deleted or rewritten

**Fix needed:**
- Delete `add-schema-stubs.yml` (empty file, legacy artifact)
- Disable or remove `apply-chatpanel-fixes.yml` and `apply-types-patch.yml` (obsolete — types.ts is already regenerated)

---

## 6. Gitleaks (Secret Scan) — Pre-existing ⚠️

Gitleaks has failed in previous runs (runs #263 from the recent listing), but in the latest commit it succeeded.

**Status:** PASSED in the most recent run. No immediate action needed, but pre-existing findings should be reviewed.

---

## 🎯 Prioritized Fix List

| Priority | Area | What to Fix | Effort | Impact |
|---|---|---|---|---|
| **P0** | ⚡ Sprint1 tests | Update test to search both `public` and `zapp` schemas (or add migration) | 1-2h | Blocks all CI/CD pipeline |
| **P0** | ⚡ Portainer token | Configure `PORTAINER_API_TOKEN` and `PORTAINER_URL` in Environments → production | 30min | Blocks production deploys |
| **P1** | 🧹 Legacy workflows | Delete `add-schema-stubs.yml`, disable/remove `apply-chatpanel-fixes.yml` and `apply-types-patch.yml` | 15min | Reduces noise, eliminates daily failures |
| **P2** | 🔄 E2E boot-resilience | Investigate & fix or mark as flaky-skip | 2-4h | Sporadic CI failure |
| **P3** | 🛡️ Gitleaks | Review pre-existing findings (already passing now) | 1h | Cleanup |

### Dependency chain:
```
Sprint1 test fix ──► CI Gate passes ──► CI/CD Pipeline green
                                                  │
                                    ┌─────────────┘
                                    ▼
                              Build succeeds ──► Deploy to VPS 
                              (but Portainer token blocks this)
```
