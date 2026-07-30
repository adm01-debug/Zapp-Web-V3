# CI Gates Redundancy Analysis

> Generated: comparing `ci-gate.yml`, `quality-gate.yml`, `ci.yml`, `typecheck-gate.yml`

## Individual Infrastructure Steps

| Step | ci-gate.yml | quality-gate.yml | ci.yml | typecheck-gate.yml |
|------|:-----------:|:----------------:|:------:|:------------------:|
| Checkout | ✅ | ✅ | ✅ (×6 jobs) | ✅ |
| Setup Bun | ✅ | ✅ | ✅ (×6 jobs) | ✅ |
| Install dependencies | ✅ | ✅ | ✅ (×6 jobs) | ✅ |
| Cache Bun dependencies | ❌ | ✅ | ❌ | ❌ |

## Checks / Scripts

Below is every distinct check, mapped to which workflow(s) run it. **Checks marked ⚠️ are duplicated across ≥2 workflows.**

| # | Check / Step | Script / Command | ci-gate.yml | quality-gate.yml | ci.yml | typecheck-gate.yml |
|---|-------------|-----------------|:-----------:|:----------------:|:------:|:------------------:|
| 1 | **⚠️ Lockfile consistency** | inline `git diff` + `jq` comparison | ✅ | ❌ | ✅ (job:lockfile) | ❌ |
| 2 | **⚠️ TypeScript ratchet (blocking)** | `scripts/check-tsc-ratchet.mjs` | ✅ | ✅ | ✅ (job:quality) | ❌ |
| 3 | **⚠️ ts-nocheck drift gate** | `scripts/check-ts-nocheck.mjs` | ✅ | ❌ | ✅ (job:quality) | ✅ |
| 4 | **⚠️ Schema usage guardrail (zapp/evo)** | `scripts/check-schema-usage.mjs` | ✅ | ✅ | ❌ | ❌ |
| 5 | **⚠️ Supabase cast safety (SUP-001..006)** | `scripts/lint-supabase-casts.mjs` | ✅ | ✅ | ❌ | ❌ |
| 6 | **⚠️ Unit tests** | `bun run test` / `npm run test` | ✅ | ✅ | ✅ (job:test) | ❌ |
| 7 | **⚠️ Upload coverage report** | `actions/upload-artifact@v4` | ✅ | ❌ | ✅ (job:test) | ❌ |
| 8 | **⚠️ Build for production** | `bunx vite build` / `bun run build` | ✅ | ❌ | ✅ (job:build) | ✅ |
| 9 | ESLint diagnostics (advisory) | `npm run lint` / `bunx eslint .` | ❌ | ✅ | ✅ (job:quality) | ❌ |
| 10 | Refactor guards (dead code + data layer) | `scripts/check-dead-code.mjs` + `scripts/check-data-layer.mjs` | ❌ | ✅ | ❌ | ❌ |
| 11 | Migration linter | `scripts/lint-migrations.mjs` | ❌ | ✅ | ❌ | ❌ |
| 12 | RLS coverage audit (E34) | `scripts/audit-rls-coverage.mjs --check` | ❌ | ✅ | ❌ | ❌ |
| 13 | Schema access simulation (~300 cenários) | `scripts/simulate-schema-access.mjs` | ❌ | ✅ | ❌ | ❌ |
| 14 | **⚠️ `tsc --noEmit` (app tsconfig)** | `bunx tsc --noEmit -p tsconfig.app.json` | ❌ | ✅ (advisory) | ❌ (uses ratchet only) | ✅ (advisory, continue-on-error) |
| 15 | `tsc --noEmit` (node tsconfig) | `bunx tsc --noEmit -p tsconfig.node.json` | ❌ | ❌ | ❌ | ✅ |
| 16 | Cluster typecheck ratchet — blocking (crm-sales, queues, observability) | `scripts/check-cluster-typecheck.mjs --cluster` | ❌ | ✅ | ❌ | ❌ |
| 17 | Cluster typecheck ratchet — advisory (inbox-core) | `scripts/check-cluster-typecheck.mjs --cluster inbox-core` | ❌ | ✅ (continue-on-error) | ❌ | ❌ |
| 18 | Supabase types freshness | `scripts/check-types-freshness.mjs` | ❌ | ✅ | ❌ | ❌ |
| 19 | **⚠️ Coverage threshold/ratchet** | inline / `scripts/check-coverage-ratchet.mjs` | ❌ | ✅ | ✅ (job:test) | ❌ |
| 20 | Fuzzing Tests (advisory) | `npm run test:fuzz` | ❌ | ✅ (continue-on-error) | ❌ | ❌ |
| 21 | **⚠️ Install Playwright Browsers** | `bunx playwright install --with-deps` | ❌ | ✅ | ✅ (jobs:e2e,a11y) | ❌ |
| 22 | **⚠️ E2E Tests** | `npm run test:e2e` / `bun run test:e2e` | ❌ | ✅ | ✅ (job:e2e) | ❌ |
| 23 | Performance Budget Gate | `npm run perf:budget` | ❌ | ✅ (continue-on-error) | ❌ | ❌ |
| 24 | Design-system diagnostics | `scripts/check-design-system.ts --ci` | ❌ | ❌ | ✅ (job:quality) | ❌ |
| 25 | Supabase schema coverage gate | `scripts/check-types-schemas.mjs` | ❌ | ❌ | ✅ (job:quality, ×2 runs) | ❌ |
| 26 | Auto-repair types | `scripts/repair-types-schemas.mjs` | ❌ | ❌ | ✅ (job:quality, conditional) | ❌ |
| 27 | Publish schema status report | `actions/upload-artifact@v4` | ❌ | ❌ | ✅ (job:quality) | ❌ |
| 28 | Publish types:repair log | `actions/upload-artifact@v4` | ❌ | ❌ | ✅ (job:quality, conditional) | ❌ |
| 29 | TypeScript check — chat components (blocking, strict) | `tsgo --noEmit` + grep | ❌ | ❌ | ✅ (job:quality) | ❌ |
| 30 | Upload build artifacts | `actions/upload-artifact@v4` | ❌ | ❌ | ✅ (job:build) | ❌ |
| 31 | Report bundle size | `du` + `find` | ❌ | ❌ | ✅ (job:build) | ❌ |
| 32 | Upload Playwright report | `actions/upload-artifact@v4` | ❌ | ❌ | ✅ (job:e2e) | ❌ |
| 33 | Accessibility regression (axe) | `bun run test:a11y` | ❌ | ❌ | ✅ (job:a11y) | ❌ |
| 34 | Upload a11y Playwright report | `actions/upload-artifact@v4` | ❌ | ❌ | ✅ (job:a11y) | ❌ |
| 35 | Dependency audit (blocking on CRITICAL) | `bun audit --audit-level=critical` | ❌ | ❌ | ✅ (job:security) | ❌ |
| 36 | Check for obvious secrets in code | `grep` for secrets patterns | ❌ | ❌ | ✅ (job:security) | ❌ |

## Summary of Duplicated Checks

### 🔴 HIGH — Identical check, same script, blocking in 2+ workflows

| Check | Runs In | Total Runs |
|-------|---------|:----------:|
| **TypeScript ratchet** (`scripts/check-tsc-ratchet.mjs` — blocking) | ci-gate, quality-gate, ci.yml | **3×** |
| **ts-nocheck drift gate** (`scripts/check-ts-nocheck.mjs` — blocking) | ci-gate, ci.yml, typecheck-gate | **3×** |
| **Unit tests** (`bun run test` / `npm run test` — blocking) | ci-gate, quality-gate, ci.yml | **3×** |
| **Build for production** (`bunx vite build` — blocking) | ci-gate, ci.yml, typecheck-gate | **3×** |
| **Schema usage guardrail** (`scripts/check-schema-usage.mjs` — blocking) | ci-gate, quality-gate | **2×** |
| **Supabase cast safety** (`scripts/lint-supabase-casts.mjs` — blocking) | ci-gate, quality-gate | **2×** |
| **Lockfile consistency** (inline git diff + jq — blocking) | ci-gate, ci.yml | **2×** |
| **Coverage ratchet/threshold** | quality-gate, ci.yml | **2×** |
| **E2E Tests** | quality-gate, ci.yml | **2×** |
| **Upload coverage report** | ci-gate, ci.yml | **2×** |
| **Install Playwright Browsers** | quality-gate, ci.yml | **2×** |

### 🟡 MEDIUM — Same check, different intent (advisory vs blocking)

| Check | Details |
|-------|---------|
| **`tsc --noEmit -p tsconfig.app.json`** | quality-gate = advisory (continue-on-error), typecheck-gate = advisory (continue-on-error). Both explicitly say "blocking ratchet runs elsewhere". Truly redundant — typecheck-gate duplicates what quality-gate already does. |

### 🟢 LOW — Shared infrastructure, not business logic

| Check | Notes |
|-------|-------|
| Checkout, Setup Bun, Install dependencies | Inevitable in every CI workflow; not "duplicated logic". |

## Key Findings

1. **`ci-gate.yml` is a strict subset of `ci.yml`'s jobs.** Every check in ci-gate also runs in ci.yml (lockfile, TS ratchet, ts-nocheck, unit tests, build, coverage upload). The only difference is ci-gate adds schema-usage and supabase-casts — but those already run in quality-gate.yml.

2. **`typecheck-gate.yml` runs nothing unique.** Its app typecheck (advisory) duplicates quality-gate's. Its node typecheck is the sole unique check, but it's a 1-line `tsc --noEmit` that could be folded anywhere. Its `@ts-nocheck` guard and build smoke-test are both duplicated in ci-gate and ci.yml.

3. **`quality-gate.yml` runs the most checks (15+),** but 7 of them are duplicated elsewhere.

4. **The "blocking ratchet" pattern** (`check-tsc-ratchet.mjs`) runs in **3 different workflows**, costing ~30s each time. It only needs to run once per commit.

5. **Redundant total CI runtime:** Every PR that triggers all workflows (they share triggers) runs:
   - 3× `bun install` (actually 14× across all jobs, but some are sequential)
   - 3× TypeScript ratchet
   - 3× ts-nocheck gate
   - 3× unit tests
   - 3× production build

## Recommendation

| Action | Workflow | Rationale |
|--------|----------|-----------|
| 🗑️ **Delete** | `ci-gate.yml` | All its checks already run in `ci.yml` and/or `quality-gate.yml`. Its header explicitly says it exists solely to satisfy the `ci` required status check — now that `ci.yml`'s `lockfile` job provides that same context, this workflow is obsolete. |
| 🗑️ **Delete** | `typecheck-gate.yml` | Its app typecheck is advisory and duplicated in quality-gate. Its node typecheck can be added to quality-gate or ci.yml. Its `@ts-nocheck` guard and build smoke test are already in ci.yml. Zero unique value. |
| 🔧 **Consolidate** | Move checks from quality-gate into ci.yml's jobs to stop duplicating work (e.g., schema-usage, cast-safety, RLS audit, migration lint can live in ci.yml's `quality` job). |

After elimination, only **1 workflow** (`ci.yml`) would be needed, with `quality-gate.yml` optionally kept as a "deep diagnostics" superset that reuses ci.yml's results.
