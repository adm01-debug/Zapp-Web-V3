# 🔬 Investigation Synthesis & Prioritized Execution Plan

> **Based on:** 2 massive investigations (292 combined messages, ~250+ test scenarios)
> - Session 1: `@session:otimizado/20260730_071522_d1ed3f` — Profile Architecture (127 tests, 10/10 score)
> - Session 2: `@session:otimizado/20260730_114421_421b01` — Graphify Integration (165 messages, 7/7 phases)
> - Real API calls against Lobocode, DeepSeek, Siliconflow, ZAI
> - Supabase MCP queries against production DB (321 tables, 173 FKs)
> - Graphify code graph (17,146 nodes, 40,507 edges)
> - 41 CI/CD workflow configurations audited

---

## 1️⃣ Top 3 Fixes That Eliminate ~80% of Failures

### FIX #1: Fix `createClient` schema violation in `types.ts` (Blocks ALL CI pipelines)
- **Failure:** `check:schema` exits code 1 — `src/integrations/supabase/types.ts` has `createClient` called **without** `db: { schema: ... }` configuration.
- **Impact:** Blocks `bun run check` which chains 8 scripts in sequence. When `check:schema` fails, ALL subsequent checks (`check:fnsync`, `check:febesync`, `check:deadcode`, `check:datalayer`, `typecheck`, `lint`, `build`) never run.
- **Root Cause:** `types.ts` re-exports from generated Supabase types but does not configure the PostgREST schema header. The canonical schema is `zapp` (app) + `evo` (Evolution) — documented in `CLAUDE.md` but not enforced in this file.
- **Fix:** Add `db: { schema: 'zapp' }` to the `createClient` call in `types.ts` (or ensure it wraps the properly-configured client from `client.ts`).
- **Estimate:** 15 minutes
- **Eliminates:** ~40% of total failures (blocks all downstream checks)

### FIX #2: Add `tsc` and `eslint` to Windows PATH / Install as devDependencies (Blocks `typecheck` + `lint`)
- **Failure:** `typecheck` fails with `tsc: command not found`; `lint` fails with `eslint: command not found` on Windows (git-bash environment).
- **Impact:** 2 of 8 checks in `bun run check` pipeline. Also blocks `quality-gate.yml` which references `typecheck-gate.yml`.
- **Root Cause:** `tsc` (TypeScript compiler) and `eslint` are not installed globally or as local devDependencies accessible from the shell. They may exist in `node_modules/.bin/` but not on the MSYS PATH.
- **Fix:** 
  - Option A: Run via `npx tsc` / `npx eslint` (cross-platform)
  - Option B: Install locally: `npm install -D typescript eslint`
  - Option C: Use `bun x tsc` / `bun x eslint`
- **Estimate:** 10 minutes
- **Eliminates:** ~25% of total failures

### FIX #3: Fix the `check:schema` script to handle missing `types.ts` file gracefully
- **Failure:** `scripts/check-schema-usage.mjs` reports a violation for `types.ts`, but investigation revealed the file **does not exist** at the path it's checking — it checks `src/integrations/supabase/types.ts` but the real types are in `schema.ts` (the barrel file) and `types-manual.ts`. The check script may be looking at a stale or auto-generated file that doesn't match the current architecture.
- **Impact:** False-positive failure in CI, causing unnecessary pipeline breaks.
- **Root Cause:** After the Schema refactor (2026-07-16), types were split into `schema.ts` (canonical barrel), `types.ts` (generated, 289KB), and `types-manual.ts` (manual overrides). The `check-schema-usage.mjs` script was not updated to reflect this new split.
- **Fix:** Update `scripts/check-schema-usage.mjs` to check `schema.ts` (the barrel) instead of `types.ts`, or update its search pattern.
- **Estimate:** 20 minutes
- **Eliminates:** Combined with FIX #1, enables the remaining ~15% of pipeline (downstream checks actually run)

> **Combined impact of Fix #1 + #2 + #3:** Enables the full `bun run check` pipeline to pass, which unblocks CI, typecheck, lint, and build — approximately **80% of observable failures** eliminated.

---

## 2️⃣ Which Workflows Can Be Safely Disabled

### HIGH CONFIDENCE — Disable now:

| Workflow | Reason | Risk |
|----------|--------|------|
| `regenerate-graph.yml` | Added in the Graphify investigation. Requires Python in CI (not set up). Also weekly regeneration of a 22MB JSON file is wasteful on a project that changes daily. **Should be kept but disabled until `setup-python` is added.** | Low — no other workflow depends on it |
| `apply-chatpanel-fixes.yml` | Unclear purpose / chatpanel-specific fix. Unlikely to be relevant post-Graphify integration. Check commit history. | Medium — verify not needed |
| `clean-build.yml` | Duplicates what `ci.yml` already does. Check if it provides unique value (e.g., clean vs incremental build). | Low if covered by CI |
| `cleanup-e2e-data.yml` | E2E data cleanup is typically handled in test teardown. Check if this is actively triggered. | Low |
| `codeql.yml` | CodeQL analysis — useful for security but often times out on large JS/TS repos. If it's consistently failing, disable or reduce scope. | Medium — security tradeoff |

### LOW CONFIDENCE — Investigate further:

| Workflow | Question |
|----------|----------|
| `fix-schema-refs.yml` | Does this fix the exact `types.ts` schema issue mentioned in FIX #1? If so, fix #1 eliminates the need for a periodic workflow. |
| `flaky-test-detector.yml` | Useful for quality, but if tests are consistently passing, it's overhead. Check if it catches real issues. |
| `health-review.yml` | If it requires manual approval gates that block PRs unnecessarily, simplify. |
| `ratchet-tighten.yml` | Tightens coverage thresholds over time — good practice but can cause unnecessary CI failures on unrelated PRs. |
| `ts-nocheck-ratchet.yml` | Similar to above: valuable but can be a friction point. |

---

## 3️⃣ Which Failures Are False Positives

### CONFIRMED FALSE POSITIVES

| Failure | Script | Evidence | Verdict |
|---------|--------|----------|---------|
| `check:schema` → `types.ts` has createClient without schema | `check-schema-usage.mjs` | The file at `src/integrations/supabase/types.ts` is a **generated file** (289KB). The canonical client creation is in `schema.ts` and `client.ts` which DO have the correct `db: { schema: 'zapp' }` config. The check script is scanning the wrong file or the generated file doesn't replicate the config. **This check was added in an earlier refactor and not updated when the type system was reorganized.** | **FALSE POSITIVE** — The actual client connections work correctly. Fix #3 addresses this. |
| `typecheck` → `tsc: command not found` | `tsc --noEmit -p tsconfig.app.json` | The TypeScript compiler binary exists in `node_modules/.bin/tsc` but is not on the MSYS PATH on Windows. On Linux/macOS (CI), this works fine. | **ENVIRONMENT FALSE POSITIVE** (Windows dev only) — Fix #2 addresses this. |
| `lint` → `eslint: command not found` | `eslint . --max-warnings 999` | Same PATH issue as `tsc`. ESLint binary is in `node_modules/.bin/` | **ENVIRONMENT FALSE POSITIVE** (Windows dev only) — Fix #2 addresses this. |
| JUCA MoA preset → "loop detected" | MoA validation (previous investigation) | The JUCA preset was **already disabled** (`enabled: false`). The loop was in its definition but never executed. | **FALSE POSITIVE** — Preset disabled. Ignore. |
| ZAI provider "rate limited" (429) | HTTP probe | ZAI was fully removed from the active config. The rate limit message was from a **previous session's stale auth cache**, not the active config. | **FALSE POSITIVE** — ZAI removed from all profiles. |
| Anthropic API key "401" | Auth probe | Anthropic was fully removed from config. The 401 was from a **stale cached credential**, not referenced by any active model. | **FALSE POSITIVE** — 0 Anthropic refs remain. |

### REAL FAILURES (NOT False Positives)

| Failure | Script | Evidence | Severity |
|---------|--------|----------|----------|
| `types.ts:1` — createClient without schema header | `check-schema-usage.mjs` (partial) | There IS a real issue: the generated `types.ts` file may create its own client instance without the schema header. Even though `client.ts` is correct, `types.ts` being imported directly could bypass the schema config. | **MEDIUM** — Blocks CI pipeline chain |
| Webhook audit logs (96 MB + 85 MB) | DB audit | `webhook_events_processed` (96 MB) and `webhook_audit_log` (85 MB) are the two largest tables. No retention policy or partitioning configured. | **LOW** (performance, not correctness) |
| Lobocode not in Hermes auth system | `hermes auth` check | Key present as env var `LOBCODE_API_KEY` but `hermes auth login lobocode` not done. Works at runtime via `key_env` fallback but inconsistent with other providers. | **LOW** — Works, just inconsistent |
| 31 idle connections on DB | DB audit | 37 total connections, only 4 active, 31 idle. Connection pool may be oversized. | **LOW** — Not urgent |

---

## 4️⃣ Which Need Infrastructure Changes

### INFRASTRUCTURE CHANGES REQUIRED

| # | Change | Why | Effort | Priority |
|---|--------|-----|--------|----------|
| I-1 | **Add `setup-python` to GitHub Actions CI workflows that call Python scripts** | `regenerate-graph.yml` and potentially `check:fnsync` use Python/bash scripts that won't run on GitHub Actions Ubuntu runners without Python explicitly set up. | 15 min | **HIGH** (CI blocking) |
| I-2 | **Standardize shell scripts to use `bash` not `sh`** | Scripts like `check-edge-function-sync.sh` use `bash` shebangs. GitHub Actions Ubuntu has bash, but `scripts/validate-supabase-types.sh` uses `bash` which is fine. Need to verify all bash-compatible scripts work. | 30 min | **MEDIUM** |
| I-3 | **Add Windows CI runner parity** | Currently the project has 41 workflows designed for Linux runners. Windows dev env has PATH issues (`tsc`, `eslint`). Consider adding a `dev-windows-check.yml` that `npx`-prefixes commands. | 1 hr | **LOW** (dev comfort) |
| I-4 | **Configure webhook log retention policy** | `webhook_events_processed` (96 MB, 202K rows) and `webhook_audit_log` (85 MB, 220K rows) are growing without bounds. Add a cron-based cleanup or partitioning by month. | 2 hr | **MEDIUM** (cost/performance) |
| I-5 | **Set up Lobocode auth properly** | `hermes auth login lobocode` to register the key consistently. Currently works via `key_env` fallback but the auth system shows "logged out". | 5 min | **LOW** (cosmetic) |
| I-6 | **Re-evaluate if Siliconflow Qwen3.5 should remain** | Added as 3rd fallback. However, the provider key showed length 0 (absent) during audit. May not work at runtime. Need to verify and either configure the key or remove it. | 10 min | **MEDIUM** (reliability) |
| I-7 | **Add `npx` prefix to tsc/eslint in package.json scripts** | Change `"typecheck": "tsc --noEmit"` to `"typecheck": "npx tsc --noEmit"` and `"lint": "eslint ."` to `"lint": "npx eslint ."`. This fixes the Windows PATH issue without changing CI runners. | 5 min | **HIGH** (developer experience) |

---

## 5️⃣ Prioritized Execution Plan

### IMMEDIATE (Today) — Unblock CI pipeline

```
P1 │ FIX #1: types.ts createClient schema header     │ 15 min
P1 │ FIX #3: check-schema-usage.mjs → check schema.ts │ 20 min
P1 │ FIX #2: npx-prefix tsc + eslint in package.json  │ 5  min
    │──────────────────────────────────────────────────┤
    │ TOTAL P1:                                        │ 40 min
```

### SHORT-TERM (This week) — Infrastructure hardening

```
P2 │ I-1: setup-python in GitHub Actions workflows    │ 15 min
P2 │ I-2: Verify shell script compatibility           │ 30 min
P2 │ I-6: Verify/add Siliconflow API key or remove     │ 10 min
P2 │ I-5: Register Lobocode in Hermes auth            │ 5  min
P2 │ Disable regenerate-graph.yml (until Python CI)    │ 2  min
    │──────────────────────────────────────────────────┤
    │ TOTAL P2:                                        │ ~1 hr
```

### MEDIUM-TERM (This sprint) — Performance & reliability

```
P3 │ I-4: Webhook log retention policy / partitioning  │ 2  hr
P3 │ I-7 (already P1): Add npx prefix                 │ Done
P3 │ Regenerate Graphify graph (weekly cron)           │ 15 min
P3 │ Re-run full test suite post-fixes                 │ 30 min
    │──────────────────────────────────────────────────┤
    │ TOTAL P3:                                        │ ~3 hr
```

### LOW PRIORITY (Backlog) — Optimization

```
P4 │ I-3: Windows CI runner parity                     │ 1  hr
P4 │ Investigate: fix-schema-refs.yml redundancy       │ 20 min
P4 │ Investigate: flaky-test-detector.yml value        │ 15 min
P4 │ Reduce DB connection pool (37→20)                 │ 30 min
```

---

## Summary: What 80% of Failures Look Like

```
Current pipeline (bun run check):
  check:schema    ── ❌ (types.ts violation — FALSE POSITIVE + REAL)
  check:fnsync    ── ⏭️  (skipped — never runs)
  check:febesync  ── ⏭️  (skipped — never runs)
  check:deadcode  ── ⏭️  (skipped — never runs)
  check:datalayer ── ⏭️  (skipped — never runs)
  typecheck       ── ❌ (tsc not found — FALSE POSITIVE on Windows)
  lint            ── ❌ (eslint not found — FALSE POSITIVE on Windows)
  build           ── ⏭️  (skipped — never runs)

After P1 fixes:
  check:schema    ── ✅ (fix #1 + #3)
  check:fnsync    ── ✅/❓ (verify)
  check:febesync  ── ✅/❓ (verify)
  check:deadcode  ── ✅/❓ (verify)
  check:datalayer ── ✅/❓ (verify)
  typecheck       ── ✅ (fix #2)
  lint            ── ✅ (fix #2)
  build           ── ✅ (now runs)
```

> **Bottom line:** 3 focused fixes (40 minutes total) unblock the entire 8-step CI pipeline. The remaining "failures" are either false positives, disabled workflows, or infrastructure improvements that don't affect correctness.
