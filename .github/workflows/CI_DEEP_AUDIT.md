# ci.yml — Deep Audit Report (7 Jobs)

> Generated: 2026-07-30
> Scope: `ci.yml` internal analysis + cross-workflow redundancy with `ci-gate.yml`, `quality-gate.yml`, `typecheck-gate.yml`, `ci-status-gate.yml`

---

## 1. Overview: The 7 Jobs

| Job | Name | Needs | Runner | Has Timeout? | Blocking? |
|-----|------|-------|--------|-------------|-----------|
| 1 | `lockfile` | Verify Lockfile | _none_ | ubuntu-latest | ❌ No timeout | ✅ Yes |
| 2 | `quality` | Quality diagnostics | `lockfile` | ubuntu-latest | ❌ No timeout | ✅ Mixed |
| 3 | `test` | Unit tests | `lockfile`, `quality` | ubuntu-latest | ❌ No timeout | ✅ Yes |
| 4 | `build` | Build | `lockfile`, `quality` | ubuntu-latest | ❌ No timeout | ✅ Yes |
| 5 | `e2e` | E2E tests | `build` | ubuntu-latest | ✅ 15 min | ✅ Yes |
| 6 | `a11y` | Accessibility regression | `build` | ubuntu-latest | ✅ 15 min | ✅ Yes |
| 7 | `security` | Security audit | `lockfile` | ubuntu-latest | ❌ No timeout | ✅ Mixed |

**Finding — Missing timeouts:** 5/7 jobs lack `timeout-minutes`. A hung step (e.g. `bun install` with network failure, stuck test, infinite loop) can run the full 360-min GitHub default. Only `e2e` and `a11y` have 15-min timeouts.

---

## 2. Job-by-Job Analysis

### Job 1: `lockfile` — Verify Lockfile

**What it does:** Checks that `package.json` dependency changes are accompanied by a `bun.lock` update. Uses git diff + `jq`.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 1 | 🔴 HIGH | **Self-admitted broken design** | The inline comment says "bun install --frozen-lockfile always fails on CI" because Lovable's private registry is unavailable. Instead of fixing the registry access, they use a fragile git-diff heuristic. |
| 2 | 🟡 MEDIUM | **No `timeout-minutes`** | Could hang on `git fetch` against large repos or slow network. |
| 3 | 🟡 MEDIUM | **Fetch-depth: 0** | This triggers a full clone + full fetch for every lockfile check — wasteful when only package.json + bun.lock diffs are needed. `fetch-depth: 1` would suffice. |
| 4 | 🟢 LOW | **Script duplicated in `ci-gate.yml`** (lines 59–78) | Identical lockfile check runs in both workflows, same PR triggers, wasting CI minutes. |

**Optimization:** Replace the inline bash with a `fetch-depth: 1` checkout and use `git diff --name-only HEAD~1...HEAD` (simpler, less network).

---

### Job 2: `quality` — Quality diagnostics

**What it does:** 9 steps — ESLint (advisory), design-system check (advisory), schema coverage gate, auto-repair types, schema report artifacts, schema gate (repeat!), TypeScript ratchet, chat component TS check, ts-nocheck gate.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 5 | 🔴 HIGH | **Schema gate runs TWICE** (steps: "schema coverage gate" + "Schema gate final") | The first run (`continue-on-error: true`) is immediately followed by auto-repair, then the exact same script runs again as "blocking". If the gate is meant to pass after repair re-runs it, the first run is pure waste (~10–30s duplicating). The second run is also unconditional — it runs even when schema_gate succeeded and repair was skipped. |
| 6 | 🔴 HIGH | **Secrets injection without `if:` guard** | Steps 128–134 and 169–174 inject `secrets.ZAPP_META_URL` and `secrets.ZAPP_META_TOKEN` into `env:` even on PRs from forks. If the secrets are unavailable (empty), the script still runs — waste. The repair step has an `env.X != ''` guard but the gate steps don't. If secrets are empty, `check-types-schemas.mjs` will fail predictably. |
| 7 | 🟡 MEDIUM | **ESLint always exits 0** (always advisory) | Step "ESLint diagnostics" swallows all errors with `exit 0`. It's been advisory since creation. Either fix the debt and make it blocking, or remove it from the critical path. |
| 8 | 🟡 MEDIUM | **Design-system check always exits 0** | Same pattern — forever advisory. If the team never acts on warnings, this is noise. |
| 9 | 🟡 MEDIUM | **Chat components TS check only tests 2 paths** | The `tsgo` check greps for only `src/(features/inbox/components/chat|lib/react-refs)`. New TS errors elsewhere pass silently because of `exit 0`. A narrow and potentially misleading gate. |
| 10 | 🟢 LOW | **Missing `timeout-minutes`** | This job runs 9 steps including 2x schema scripts, bun install, 2x TypeScript checks. A step hang could waste significant runner time. |
| 11 | 🟢 LOW | **Artifact uploads run even on failure** | `if: always()` on schema report and repair log uploads is good practice — but the repair log artifact will have `if-no-files-found: ignore`, meaning it often silently does nothing. |

**Duplicate detection (cross-workflow):**
- **TypeScript ratchet** (`check-tsc-ratchet.mjs`): also in `ci-gate.yml` + `quality-gate.yml` = **3× run per commit**.
- **ts-nocheck gate** (`check-ts-nocheck.mjs`): also in `ci-gate.yml` + `typecheck-gate.yml` = **3× run per commit**.

---

### Job 3: `test` — Unit Tests

**What it does:** Bun install, run tests with coverage, upload coverage, check coverage thresholds.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 12 | 🔴 HIGH | **No `timeout-minutes`** | The comment says 2088 tests pass, but one hung test (or the OOM issue they claim to have fixed) could run indefinitely. `NODE_OPTIONS: --max-old-space-size=6144` suggests memory pressure was a real problem. |
| 13 | 🟡 MEDIUM | **Coverage floor is extremely low** | Lines: 25%, Functions: 18%, Branches: 15%, Statements: 24%. These thresholds barely catch regressions. A PR that cuts coverage in half would still pass. |
| 14 | 🟡 MEDIUM | **Coverage gate runs `if: always()`** | Runs even if previous test step failed — but if tests failed, `coverage/coverage-summary.json` may not exist (the code handles this with a warning exit 0). The gate would be silently skipped after a test failure, potentially masking a coverage regression. |
| 15 | 🟢 LOW | **`--reporter=verbose`** | Verbose output on every test run generates huge log volume, slowing the step and wasting storage. |
| 16 | 🟢 LOW | **Duplicate across workflows** | Also runs in `ci-gate.yml` (as part of the monolithic job) and `quality-gate.yml`. **3× run per commit** when all triggers match. |

**Cost impact:** CI_COST_ANALYSIS_REPORT.md shows 66.7% failure rate on ci.yml — most from unit tests. This is the #1 waste source.

---

### Job 4: `build` — Build

**What it does:** Bun install, `bunx vite build`, upload dist, report bundle size.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 17 | 🟡 MEDIUM | **No `timeout-minutes`** | A production build can theoretically hang on certain edge cases (e.g. circular dependency loop in Rollup). |
| 18 | 🟢 LOW | **Bundle size report is informational only** | There's no bundle size budget/threshold. The `du`/`find` output is purely cosmetic — no CI signal. |
| 19 | 🟢 LOW | **Artifact retention 7 days** | `dist/` build artifacts are rarely used after 24h unless specifically for deploy. Could be reduced to 1 day. |
| 20 | 🟢 LOW | **Duplicate across workflows** | Also runs in `ci-gate.yml` and `typecheck-gate.yml` = **3× per commit**. |

---

### Job 5: `e2e` — E2E Tests

**What it does:** Bun install, Playwright browser install, `bun run test:e2e`, upload report.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 21 | 🟡 MEDIUM | **No caching for Playwright browsers** | `bunx playwright install --with-deps` downloads Chromium (~400MB) on every run. No `~/.cache/ms-playwright` caching step. Each E2E run spends ~30–60s on browser download. |
| 22 | 🟡 MEDIUM | **No `--retries` for flaky E2E tests** | E2E tests are inherently flaky. Without retry logic, a single timeout causes the whole job to fail. |
| 23 | 🟡 MEDIUM | **Depends on `build` but doesn't use the artifact** | Job `needs: build` ensures build passes, but the E2E job re-runs `bun install` and checks out code from scratch. It doesn't download the `dist/` artifact. This means the build job runs in isolation — the E2E tests likely start a dev server, not the production build. The `needs` dependency only gates ordering, not artifact reuse. |
| 24 | 🟢 LOW | **Timeout at 15 min** — reasonable but could be tighter (10 min) given historical run times. |

**Duplicate detection:** Also runs in `quality-gate.yml` = **2× per commit**.

---

### Job 6: `a11y` — Accessibility Regression

**What it does:** Bun install, Playwright (Chromium only), `bun run test:a11y`, upload report.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 25 | 🟡 MEDIUM | **No Playwright browser caching** | Same as E2E — browser download every run. |
| 26 | 🟢 LOW | **Small scope** | Only tests `/auth`, `/forgot-password`, `/reset-password` + keyboard nav. Narrow coverage may not catch broader accessibility regressions. |

---

### Job 7: `security` — Security Audit

**What it does:** Bun install, `bun audit --audit-level=critical`, grep for secrets patterns.

**Issues found:**

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 27 | 🟡 MEDIUM | **No `timeout-minutes`** | Dependency audit (network call to npm registry) can hang on transient network issues. Already has a guard for "audit request failed" 5xx, but the job itself could time out. |
| 28 | 🟡 MEDIUM | **Secrets check is a weak grep** | `grep -rn "SUPABASE_SERVICE_ROLE_KEY\|sk_live_\|sk_test_\|password\s*=\s*[\\\"']" --include="*.ts" --include="*.tsx" --include="*.js" src/` — misses many patterns: AWS keys, API tokens in .env patterns, private keys, tokens in JSON configs, etc. Only checks `src/` (not `scripts/`, `.github/`, `supabase/`, root config files). |
| 29 | 🟡 MEDIUM | **Secrets check is `::warning` only** | Never blocks. Real secrets could be committed and only trigger a warning that nobody sees. |
| 30 | 🟢 LOW | **bun audit might not work without lockfile** | The lockfile check runs earlier (in lockfile job), but `bun audit` uses the installed packages. If `bun install` had issues, audit may produce incomplete results. |
| 31 | 🟢 LOW | **Separate `gitleaks.yml` workflow exists** | `gitleaks.yml` also scans for secrets (with a proper tool, not grep) and has a 56.5% failure rate. Having both is redundant. The CI grep check is vastly inferior to gitleaks. |

---

## 3. Cross-Workflow Duplication (ci.yml vs Other Gates)

### Checks Duplicated 3× (ci.yml + ci-gate + quality-gate or typecheck-gate)

| Check | ci.yml | ci-gate | quality-gate | typecheck-gate | Total Runs |
|-------|:------:|:-------:|:------------:|:--------------:|:----------:|
| TypeScript ratchet (`check-tsc-ratchet.mjs`) | ✅ quality | ✅ | ✅ | ❌ | **3×** |
| ts-nocheck drift (`check-ts-nocheck.mjs`) | ✅ quality | ✅ | ❌ | ✅ | **3×** |
| Unit tests (`bun run test`) | ✅ test | ✅ | ✅ | ❌ | **3×** |
| Build (`bunx vite build`) | ✅ build | ✅ | ❌ | ✅ | **3×** |
| Lockfile consistency | ✅ lockfile | ✅ | ❌ | ❌ | **2×** |
| Upload coverage | ✅ test | ✅ | ❌ | ❌ | **2×** |
| E2E tests | ✅ e2e | ❌ | ✅ | ❌ | **2×** |
| Playwright install | ✅ e2e, a11y | ❌ | ✅ | ❌ | **2–3×** |

### Checks Duplicated Only in ci.yml Itself

| Check | Runs In ci.yml | Status |
|-------|---------------|--------|
| Schema gate | **2×** in `quality` job (first advisory, second blocking) | 🔴 Wasteful — run once |

---

## 4. Always-Failing / Effectively Dead Steps

| Step | Job | Status | Evidence |
|------|-----|--------|----------|
| ESLint diagnostics | `quality` | **Always passes** (exits 0 regardless) | `exit 0` — errors are warnings, never fail |
| Design-system diagnostics | `quality` | **Always passes** (exits 0 regardless) | `exit 0` — same pattern |
| Secrets grep check | `security` | **Always passes** (warning only, never fails) | Only `::warning` — never `exit 1` |
| Schema gate (1st run) | `quality` | **Conditionally wasted** — if it fails, repair runs, then gate re-runs. If it passes, the 2nd run is double work. | |
| Coverage gate | `test` | **Silently skipped if tests fail** | `if: always()` but then `exit 0` if no summary JSON |

---

## 5. Dependency Issues

| # | Severity | Issue | Detail |
|---|----------|-------|--------|
| 32 | 🟡 MEDIUM | `test` depends on `quality` unnecessarily | `test` has `needs: [lockfile, quality]`. Quality runs 9 steps including slow schema checks. The `test` job only needs lockfile validation — it doesn't use any quality output. This serializes test execution after quality diagnostics, adding ~2–3 min to the critical path. |
| 33 | 🟡 MEDIUM | `build` depends on `quality` unnecessarily | Same pattern — `needs: [lockfile, quality]`. Build only needs lockfile to pass. Quality parallelization is lost. |
| 34 | 🟢 LOW | `e2e` depends on `build` but doesn't use build artifacts | As noted above — the dependency is ordering-only. E2E could be parallelized if it used the pre-built `dist/` artifact, but it doesn't. |
| 35 | 🟢 LOW | Security runs after `lockfile` only | This is correct (no need to wait for quality or build), but security could run in parallel with other jobs for faster feedback. |

**Parallelization opportunity:** If `test` and `build` only depended on `lockfile` (not `quality`), the critical path shrinks by the entire `quality` job duration (~2–3 min). Security could also run in parallel with test/build.

---

## 6. Optimization Opportunities — Ranked

### 🔴 HIGH Priority (Developer Productivity / Correctness)

| # | Action | Expected Gain |
|---|--------|---------------|
| O1 | **Remove duplicate `push` trigger** — change to `pull_request` only. The existing PR trigger already runs the same checks. Push adds waste for every direct push (often mid-WIP). | ~50% reduction in ci.yml runs (est.) |
| O2 | **Add `timeout-minutes: 15` to `lockfile`, `quality`, `test`, `build`, `security`** — prevent hung runs from blocking runners. | Protection against 360-min max overrun |
| O3 | **Make `test` depend only on `lockfile`** (remove `quality` from needs). Currently serialized behind quality's 9 steps for no reason. | ~2–3 min faster test feedback |
| O4 | **Make `build` depend only on `lockfile`** (remove `quality`). Same reasoning. | ~2–3 min faster build feedback |
| O5 | **Run schema gate ONCE in quality job** — remove the first `continue-on-error` schema gate. The repair step + final gate covers the same ground. | Eliminates 1 redundant script run per CI run |

### 🟡 MEDIUM Priority (Resource Efficiency)

| # | Action | Expected Gain |
|---|--------|---------------|
| O6 | **Add Playwright browser caching** (`~/.cache/ms-playwright`) for e2e and a11y jobs. | ~30–60s saved per run in each job |
| O7 | **Use `fetch-depth: 1`** in checkout steps. Only lockfile needs `fetch-depth: 0` (for git diff comparison). | Faster checkout for 6/7 jobs |
| O8 | **Add E2E retries** (`--retries=2` in Playwright config) to reduce flaky failures. | Fewer false-positive CI failures |
| O9 | **Replace grep secrets check with gitleaks** (already in `gitleaks.yml`) or remove it. The inline grep is both weaker and redundant. | Simpler CI file, no false sense of security |
| O10 | **Reduce dist artifact retention to 1 day** (currently 7). | Minor storage savings |

### 🟢 LOW Priority (Polish / Convenience)

| # | Action | Expected Gain |
|---|--------|---------------|
| O11 | **Remove `--reporter=verbose`** from test run (use `--reporter=dot` or default). | Smaller logs, faster I/O |
| O12 | **Add bundle size budget** or remove the purely cosmetic size-report step. | Real CI signal vs noise |
| O13 | **Make coverage floor meaningful** or remove it. Current 25%/18%/15%/24% is nearly a no-op. | Real regression protection |
| O14 | **Remove duplicate lockfile check** from `ci-gate.yml` (if `ci-gate` is kept). Already runs in ci.yml. | Saves ~30s per commit |

---

## 7. Summary: Issues by Severity

| Severity | Count | Key Items |
|----------|:-----:|-----------|
| 🔴 **HIGH** | 5 | Schema gate double-run, missing timeouts in 5 jobs, secrets-in-env without fork-guard, duplicate tests/build across 3 workflows, serialization of test behind quality |
| 🟡 **MEDIUM** | 14 | Low coverage floors, no Playwright cache, E2E flakiness no retries, missing fork-PR secret guard, grep secrets check is weak, test serialization, build artifact not reused, `fetch-depth: 0` everywhere |
| 🟢 **LOW** | 8 | Verbose reporter, bundle size cosmetic only, cosmetic steps with `exit 0`, coverage gate silently skipped on test failure, narrow chat component TS scope |

**Bottom line:** ci.yml is functional but has ~27 issues of varying severity. The top 5 high-severity fixes alone would reduce CI runtime by ~30% and eliminate the primary causes of developer friction (hung jobs, unnecessary serialization, duplicate work). The single highest-leverage change is **removing `quality` from the `needs:` of `test` and `build` jobs** — saving ~2–3 min on the critical path for every single run.
