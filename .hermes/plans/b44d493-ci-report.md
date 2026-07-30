# Consolidated CI/CD Failure Report — Commit b44d493

**Analyzed:** 2026-07-30  
**Commit:** `b44d493d7` — `fix(types): regenerate complete types.ts from VPS — 3 schemas (public+zapp+evo), 2.8M chars, 515 tables`  
**Branch:** main  
**Status:** ❌ 5/5 unique workflows failing (6 total run failures)

---

## 1. Inventory — All Unique Failing Workflows

| # | Workflow | File | Runs Failed | Category |
|---|----------|------|-------------|----------|
| 1 | **CI Gate** | `.github/workflows/ci-gate.yml` | 1/1 | 🔴 **BLOCKING** |
| 2 | **Typecheck Gate** | `.github/workflows/typecheck-gate.yml` | 1/1 | 🔴 **BLOCKING** |
| 3 | **Quality Gate** | `.github/workflows/quality-gate.yml` | 1/1 | 🔴 **BLOCKING** |
| 4 | **CI/CD Pipeline** | `.github/workflows/ci.yml` | 1/1 | 🔴 **BLOCKING** |
| 5 | **🗂️ Generate Supabase Types (zapp)** | `.github/workflows/gen-types-zapp.yml` | 2/2 | 🟡 **ADVISORY** |

---

## 2. Root Cause Analysis

### 🔴 BLOCKING #1 — Typecheck Gate (#51): `tsc --noEmit` failures

**Root Cause:** The regenerated `types.ts` (2.8M chars, 515 tables) replaced loose stubs with concrete type definitions for schemas `zapp` (321 tables) and `evo` (189 tables). Previously these schemas were minimally typed or stubbed as `any`/`never`. The new strict types cause **150+ TypeScript errors** in 4 files:

| File | Error Count | Error Pattern |
|------|------------|---------------|
| `src/__tests__/security-and-performance.test.ts` | 5 | TS2345: Arg type not assignable to `undefined` |
| `src/adapters/inboxLegacyMapper.ts` | 8 | TS2322: `string` not assignable to `never` |
| `src/components/agents/ConfigurePermissionsDialog.tsx` | 16 | TS2339: Property on `never` |
| `src/components/campaigns/CampaignsView.tsx` | 44 | TS2339: Property on `never` |

**Fix:** Add explicit type annotations to affected files where inference fails with new strict types. Most fixes involve:
- Adding type guards/casts where Supabase generic inference returns `never`
- Updating table row type references to match the regenerated schema names
- Adding `as` casts for the specific table types that changed

---

### 🔴 BLOCKING #2 — CI Gate (#282) / Quality Gate (#2853) / CI/CD Pipeline Unit Tests (#3056): Test failures

**Root Cause:** Same underlying cause — the regenerated `types.ts` changed the shape of database row types. Tests that depend on specific field names, enum values, or row shapes now fail because:
1. The new types expose fields that were previously hidden/stubbed
2. Some test data structures don't match the actual database schema
3. SQL-injection detection test (`security-and-performance.test.ts`) fails because argument types changed

**Evidence from CI Gate logs:**
- `expected '' not to be '' // Object.is equality` (multiple lines)
- `expected '' to match /INSERT\s+INTO\s+public\.sicoob_reply…/i`
- Exit code 1 on `bun run test`

**Fix:** Update test assertions to match the new type shapes. The security-and-performance tests checking `sicoob_reply` and similar table references need their mock data updated.

---

### 🔴 BLOCKING #3 — CI/CD Pipeline E2E Tests (#3056): Playwright failures

**Root Cause:** The app fails to load or function correctly due to TypeScript compilation errors (from BLOCKING #1) being injected into the production bundle, or because the Playwright tests interact with components whose data shapes changed.

**Evidence:** `E2E tests` job → "Process completed with exit code 1"

**Fix:** Dependent on fixing BLOCKING #1 first. Once TypeScript compiles cleanly, re-run E2E suite.

---

### 🟡 ADVISORY #4 — 🗂️ Generate Supabase Types (zapp) (#15, #16): `supabase gen types` fails

**Root Cause:** The `supabase gen types typescript --linked` command fails because:
- The self-hosted Supabase instance (VPS) isn't publicly reachable from GitHub Actions runners
- OR `SUPABASE_PROJECT_ID` / `SUPABASE_ACCESS_TOKEN` secrets are missing or expired
- OR the `--db-url` connection string (used for self-hosted) isn't configured

**Evidence:** "Process completed with exit code 1" in the "Generate types" step. Runs completed in 17-28s (too short for a successful generation).

**Fix - Options:**
- Option A: Configure `SUPABASE_DB_URL` secret in GitHub Actions with direct DB connection string for self-hosted
- Option B: Switch to `supabase gen types --db-url "postgresql://..."` with credentials stored as secrets
- Option C: Accept that types generation is done manually from VPS and skip this workflow on self-hosted setups
- Option D: Add a self-hosted Supabase proxy/Cloudflare Tunnel so the CLI can reach the API

---

### ⚠️ COSMETIC — Node.js 20 Deprecation Warnings (all workflows)

**Affects:** All 5 workflows (7 jobs emit this warning)
**Message:** `Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4`
**Fix:** Pin actions to newer versions: `actions/checkout@v4` → needs `@v5` (or wait for GitHub to auto-update). **Not blocking.**

---

## 3. Dependency Graph — What Blocks What

```
Typecheck Gate (tsc --noEmit)    ← root cause
        │
        ▼
 CI Gate (tests fail)            ← same root cause, tests broken by type changes
        │
        ▼
 CI/CD Pipeline (unit tests)     ← same tests fail
        │
        ▼
 CI/CD Pipeline (E2E tests)      ← app broken due to tsc errors
        │
        ▼
 Quality Gate (unit tests)       ← same tests fail
        │
        ▼
 Gen Types (zapp)                ← independent issue (VPS connectivity)
```

**All 4 BLOCKING workflows collapse to ONE root cause:** the regenerated types.ts introduced concrete types that break 4 source files and ~73 tests.

---

## 4. Priority-Ordered Execution Plan

### Step 1 — Fix TypeScript errors (P0 · estimated 20-30 min)

**Target:** Typecheck Gate ✅  
**Files to fix:**
1. `src/adapters/inboxLegacyMapper.ts` — Fix `never` type issues (8 errors)
2. `src/components/agents/ConfigurePermissionsDialog.tsx` — Fix property access on `never` (16 errors)
3. `src/components/campaigns/CampaignsView.tsx` — Fix property access on `never` (44 errors)
4. `src/__tests__/security-and-performance.test.ts` — Fix function argument types (5 errors)

**Strategy:** Add explicit type annotations/casts using `Tables<'tablename'>` from regenerated types or add `as any` on Supabase query results that inference resolves to `never`.

**Verification:** `bun run tsc --noEmit -p tsconfig.app.json` exits 0.

### Step 2 — Fix Unit Test assertions (P0 · estimated 10-15 min)

**Target:** CI Gate + CI/CD Pipeline + Quality Gate ✅  
**Depends on:** Step 1  
**Actions:**
1. Run tests locally: `bun run test`
2. Fix assertion failures — update expected values to match new type shapes
3. Fix security-performance tests that check argument types (already fixed in Step 1)

**Verification:** `bun run test` exits 0.

### Step 3 — Re-run E2E tests (P0 · estimated 5 min)

**Target:** CI/CD Pipeline ✅  
**Depends on:** Step 1 + Step 2  
**Actions:**
1. Push fixes, wait for CI/CD Pipeline to auto-trigger
2. If E2E still fails, download Playwright report and diagnose specific test failures
3. Fix any remaining Playwright test selectors/data dependencies

**Verification:** CI/CD Pipeline E2E job passes.

### Step 4 — Fix Supabase Types generation workflow (P1 · estimated 15-30 min)

**Target:** 🗂️ Generate Supabase Types ✅  
**Actions:**
1. Check if `SUPABASE_DB_URL` secret exists in GitHub repo settings
2. Add secrets: `SUPABASE_DB_URL` (self-hosted PostgreSQL connection string) and `SUPABASE_PROJECT_ID`
3. Update workflow to use `--db-url` flag for self-hosted
4. Or: add Cloudflare Tunnel/CORS proxy for the self-hosted Supabase API

**Verification:** Trigger `workflow_dispatch` on gen-types-zapp workflow → exits 0.

### Step 5 — Node.js 20 deprecation (P2 · optional · estimated 5 min)

**Target:** All workflows (cosmetic)  
**Actions:**
1. Update `actions/checkout@v4` → `actions/checkout@v5` in all workflow files
2. Update `actions/upload-artifact@v4` → `actions/upload-artifact@v5`
3. Update `oven-sh/setup-bun@v2` → latest

**Verification:** No more Node.js 20 deprecation warnings in CI logs.

---

## 5. Time Estimate to 100% Green

| Step | Task | Est. Time | Risk |
|------|------|-----------|------|
| 1 | Fix TypeScript errors | 20-30 min | Low — mechanical type annotations |
| 2 | Fix unit test assertions | 10-15 min | Low — update expected values |
| 3 | Re-run E2E (verify) | 5 min | Medium — may reveal additional failures |
| 4 | Fix gen-types VPS connectivity | 15-30 min | Medium — depends on infra access |
| 5 | Node.js 20 deprecation (optional) | 5 min | None |
| **Total** | | **55 min – 1h 25min** | |

**Optimistic:** ~1 hour  
**Realistic:** ~1.5 hours (including E2E debugging & infra config)  
**Conservative:** ~2.5 hours (if gen-types requires new Cloudflare Tunnel setup)

**Parallelizable:** Steps 1-3 are a chain (must serialize). Step 4 is independent and can run in parallel with Steps 1-3. Step 5 can be done anytime.

---

## 6. Escalation Notes

- The `types.ts` file at 2.8M chars / 515 tables is a massive file that causes slow IDE performance and CI parse times. Consider splitting by schema (public.ts, zapp.ts, evo.ts) and re-exporting.
- The `never` type inference pattern in CampaignsView and ConfigurePermissionsDialog is endemic — 60 TypeScript errors collapsing to a pattern. A global fix `type Row<T> = T extends never ? Record<string, unknown> : T` in a helper type could resolve this systematically.
