# Quality Gate — Deep Audit Fix Plan

**File:** `.github/workflows/quality-gate.yml`  
**Audited:** 2026-07-30  
**Jobs:** 1 (`quality-gate`)  
**Steps:** 21  

---

## Summary of Findings

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 **Critical** | 3 | Bug causes silent false-pass; shallow checkout breaks git diff; lockfile drift |
| 🟠 **High** | 2 | Wasted CI time (fuzzing, Playwright browsers) |
| 🟡 **Medium** | 3 | Missing safeguards, no concurrency group, no timeout |
| 🔵 **Low** | 1 | Redundant push trigger (documented, not fixed here) |

---

## 🔴 CRITICAL — Fix Immediately

### 1. Step 12: Cluster typecheck ratchet — blocking loses information on first failure

**Bug:** If `--cluster crm-sales` exits non-zero, the step aborts immediately and `--cluster queues` and `--cluster observability` never run. Only the first failure is reported.

**Fix adopted from Step 5 (Refactor guards):** Capture each exit code separately so all three clusters are checked and reported.

**Exact patch (Step 99-103):**
```yaml
      - name: Cluster typecheck ratchet — blocking (crm-sales, queues, observability)
        run: |
          set +e
          node scripts/check-cluster-typecheck.mjs --cluster crm-sales
          status_sales=$?
          node scripts/check-cluster-typecheck.mjs --cluster queues
          status_queues=$?
          node scripts/check-cluster-typecheck.mjs --cluster observability
          status_obs=$?
          if [ "$status_sales" -ne 0 ] || [ "$status_queues" -ne 0 ] || [ "$status_obs" -ne 0 ]; then
            echo "::error title=Cluster typecheck::One or more cluster ratchets failed — check output above."
            exit 1
          fi
```

---

### 2. Step 1+6: Shallow checkout breaks `git diff HEAD~1` in Migration Linter

**Bug:** `actions/checkout@v4` uses default `fetch-depth: 1` (shallow clone). On `push` events for the first commit (or when `HEAD~1` doesn't exist in the shallow history), `git diff --name-only "$base"...HEAD` silently fails and the `|| true` mask makes the migration check skip entirely.

**Fix:** Add `fetch-depth: 0` to checkout. Also use `github.event.before` for push events instead of `HEAD~1`.

**Exact patch — Step 1 (checkout), lines 19-22:**
```yaml
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          fetch-depth: 0
```

**Exact patch — Step 6 (migration linter), line 66:**
```yaml
            base="${{ github.event.before || 'HEAD~1' }}"
```
This uses the actual previous commit SHA from the push event, falling back to `HEAD~1` for PRs where `github.event.before` is the merge-base.

---

### 3. Step 3: `bun install` without `--frozen-lockfile` allows lockfile drift

**Issue:** Running `bun install` without `--frozen-lockfile` can silently update `bun.lock` if the lockfile is out of sync with `package.json`. CI should never modify the lockfile.

**Fix:** Add `--frozen-lockfile` flag.

**Exact patch (line 29):**
```yaml
      - name: Install dependencies
        run: bun install --frozen-lockfile
```

> **Note:** If the project's private registry (Lovable GAR) is unavailable in CI, `--frozen-lockfile` will fail outright. The better pattern is the one used by `ci-gate.yml`: a separate lockfile verification step that compares dependency fields. However, adding that is scope creep — `--frozen-lockfile` forces correctness and surfaces issues early.

---

## 🟠 HIGH — Optimize & Fix Wasted CI Time

### 4. Step 18: Fuzzing Tests always fails in CI (no supabase local)

**Issue:** `npm run test:fuzz -- --runs 20 --baseUrl http://localhost:54321/functions/v1` targets the Supabase local dev CLI which is never running in GitHub Actions. The `continue-on-error: true` masks it, but it wastes ~30-60s of CI time on every run printing failure noise.

**Fix:** Add a connectivity guard before running fuzzing. Skip when supabase local is unavailable.

**Exact patch (lines 127-129):**
```yaml
      - name: Fuzzing Tests (advisory — skip when no supabase local)
        run: |
          if ! curl -sf http://localhost:54321 > /dev/null 2>&1; then
            echo "::warning::Supabase local not available in CI — fuzzing skipped."
            exit 0
          fi
          npm run test:fuzz -- --runs 20 --baseUrl http://localhost:54321/functions/v1
        continue-on-error: true
```

---

### 5. Step 19: Playwright installs all browsers (slow)

**Issue:** `bunx playwright install --with-deps` downloads Chromium + Firefox + WebKit (several hundred MB each). The E2E config only uses Chromium (`playwright.config.ts` only has a `chromium` project).

**Fix:** Specify `chromium` only. Also consider using `playwright-install-action` with caching.

**Exact patch (line 132):**
```yaml
      - name: Install Playwright Browsers
        run: bunx playwright install chromium --with-deps
```

---

## 🟡 MEDIUM — Missing Safeguards & Housekeeping

### 6. Step 10: Schema access simulation missing blocking/advisory label

**Issue:** Step name says "~300 cenários" but doesn't clarify whether it's blocking or advisory. No `continue-on-error`. If it's intended to be blocking, the label is missing. If advisory, it needs `continue-on-error`.

**Fix:** Add explicit label. The step name implies it should be **blocking** (schema access violations should fail CI).

**Exact patch (line 86-87):**
```yaml
      - name: Schema access simulation (~300 cenários — blocking)
        run: node scripts/simulate-schema-access.mjs
```

---

### 7. Step 15: Supabase types freshness labeled "advisory" but has no `continue-on-error`

**Issue:** The step name says "(advisory se secrets ausentes)". The script (`check-types-freshness.mjs`) handles missing secrets gracefully (exit 0 with warning). However, if the VPS meta endpoint is reachable but returns an error (network timeout, 5xx), the script exits with code 1, which **fails the workflow** despite being labeled advisory.

**Fix:** Add `continue-on-error: true` to align behavior with the label.

**Exact patch (lines 112-116):**
```yaml
      - name: Supabase types freshness (advisory — non-blocking)
        continue-on-error: true
        env:
          ZAPP_META_URL: ${{ secrets.ZAPP_META_URL }}
          ZAPP_META_TOKEN: ${{ secrets.ZAPP_META_TOKEN }}
        run: node scripts/check-types-freshness.mjs
```

---

### 8. Missing `concurrency` group (like `ci.yml` and `ci-gate.yml` have)

**Issue:** Multiple pushes to the same branch run all simultaneously. The `ci.yml` and `ci-gate.yml` workflows both have:
```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Fix:** Add concurrency group to cancel redundant runs.

**Exact patch — add after `on:` block (before `jobs:`, around line 9):**
```yaml
concurrency:
  group: quality-gate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

---

### 9. Missing `timeout-minutes` on the job

**Issue:** The job has no timeout. With E2E tests and fuzzing (currently always failing), a hung test could run for 6 hours (GitHub default).

**Fix:** Add a 30-minute timeout (generous for all checks).

**Exact patch — add to job definition (line 11):**
```yaml
    timeout-minutes: 30
```

---

## 🔵 LOW — Cleanup & Documentation

### 10. Redundant `push [main, master]` trigger

**Issue:** As documented in `ANALYSIS_WORKFLOWS.md`, the `push` trigger on main/master is redundant with the `pull_request` trigger. PR checks already run the same steps. However, if this workflow provides the required `quality-gate` status check context for branch protection, the push trigger may be needed.

**Recommendation:** Remove `push` if not required for branch protection. If uncertain, keep as-is — ANALYSIS_WORKFLOWS.md already documents it as redundant but non-harmful.

---

## Consolidated Patch — The Whole File

Below is every change described above, applied to the original. Apply these patches to `quality-gate.yml`:

### Patch 1 — Concurrency + timeout (lines 9-17 area)
After line 9 (before `jobs:`), insert:
```yaml
concurrency:
  group: quality-gate-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

```

On line 11, change:
```yaml
    runs-on: ubuntu-latest
```
to:
```yaml
    runs-on: ubuntu-latest
    timeout-minutes: 30
```

### Patch 2 — Checkout with fetch-depth (lines 19-21)
```yaml
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          fetch-depth: 0
```

### Patch 3 — Install with frozen-lockfile (line 29)
```yaml
      - name: Install dependencies
        run: bun install --frozen-lockfile
```

### Patch 4 — Migration linter base SHA (line 66)
Change:
```
            base="HEAD~1"
```
to:
```
            base="${{ github.event.before || 'HEAD~1' }}"
```

### Patch 5 — Cluster typecheck blocking — capture each exit code
Replace lines 99-103 entirely with:
```yaml
      - name: Cluster typecheck ratchet — blocking (crm-sales, queues, observability)
        run: |
          set +e
          node scripts/check-cluster-typecheck.mjs --cluster crm-sales
          status_sales=$?
          node scripts/check-cluster-typecheck.mjs --cluster queues
          status_queues=$?
          node scripts/check-cluster-typecheck.mjs --cluster observability
          status_obs=$?
          if [ "$status_sales" -ne 0 ] || [ "$status_queues" -ne 0 ] || [ "$status_obs" -ne 0 ]; then
            echo "::error title=Cluster typecheck::One or more cluster ratchets failed — check output above."
            exit 1
          fi
```

### Patch 6 — Label schema access simulation (line 86-87)
Change line 86 to:
```yaml
      - name: Schema access simulation (~300 cenários — blocking)
```

### Patch 7 — Types freshness advisory with continue-on-error (lines 112-116)
Replace with:
```yaml
      - name: Supabase types freshness (advisory — non-blocking)
        continue-on-error: true
        env:
          ZAPP_META_URL: ${{ secrets.ZAPP_META_URL }}
          ZAPP_META_TOKEN: ${{ secrets.ZAPP_META_TOKEN }}
        run: node scripts/check-types-freshness.mjs
```

### Patch 8 — Fuzzing skip guard (line 127-129)
Replace with:
```yaml
      - name: Fuzzing Tests (advisory — skip when no supabase local)
        run: |
          if ! curl -sf http://localhost:54321 > /dev/null 2>&1; then
            echo "::warning::Supabase local not available in CI — fuzzing skipped."
            exit 0
          fi
          npm run test:fuzz -- --runs 20 --baseUrl http://localhost:54321/functions/v1
        continue-on-error: true
```

### Patch 9 — Playwright chromium only (line 132)
Change to:
```yaml
      - name: Install Playwright Browsers
        run: bunx playwright install chromium --with-deps
```

---

## Blocking vs Advisory Classification (After Fixes)

| Step | Status | Rationale |
|------|--------|-----------|
| Checkout | Blocking | Infra — must succeed for anything to run |
| Setup Bun | Blocking | Infra — must succeed for anything to run |
| Install dependencies | Blocking | Infra — must succeed for everything else |
| Lint | **Advisory** | `exit 0` + warning — pre-existing debt |
| Refactor guards | **Advisory** | `exit 0` + warning — cleanup debt |
| Migration linter | **Blocking** | Fails on new migration violations |
| RLS coverage audit | **Blocking** | Fails when RLS is missing |
| Schema usage guardrail | **Blocking** | Fails on schema misuse |
| Supabase cast safety | **Blocking** | Fails on unsafe casts |
| Schema access simulation | **Blocking** | Fails on access violations |
| Type Check (CI) | **Advisory** | `exit 0` + warning — private registry mismatch |
| Cluster typecheck (blocking) | **Blocking** | Now correctly fails on any cluster violation |
| Cluster typecheck (advisory) | **Advisory** | `continue-on-error: true` |
| TypeScript Ratchet | **Blocking** | Fails when error count grows |
| Types freshness | **Advisory** | `continue-on-error: true` (fixed) |
| Unit & Integration Tests | **Blocking** | Fails on test regression |
| Coverage ratchet | **Advisory** | `continue-on-error: true` |
| Fuzzing Tests | **Advisory** | `continue-on-error: true` (now also skips gracefully when unavailable) |
| Install Playwright | **Blocking** | Infra — must succeed for E2E |
| E2E Tests | **Blocking** | Fails on E2E regression |
| Performance Budget | **Advisory** | `continue-on-error: true` |

**Total: 21 steps → 12 blocking, 9 advisory** (after fixes, 2 advisory steps improved).
