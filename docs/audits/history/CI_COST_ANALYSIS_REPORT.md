# CI Resource Consumption Analysis — adm01-debug/zapp-web-v3

**Analysis period:** 3 days (Jul 28–30, 2026) — 1,000 runs analyzed  
**Total workflows:** 47 (30 with recent runs, 17 with no runs)  
**Runner type:** All on `ubuntu-latest` (GitHub-hosted, private repo: $0.008/min)

---

## 1. Runner Minutes per Failing Workflow

| Rank | Workflow | Runs | Fail | Fail% | Wasted(min) | /day | /mo(est) |
|-----:|----------|-----:|-----:|------:|------------:|-----:|---------:|
| 1 | CI/CD Pipeline | 63 | 42 | 66.7% | 155.2 | 51.7 | 1,552.2 |
| 2 | 🚀 Build & Deploy — ZAPP web v3 | 45 | 39 | 86.7% | 76.2 | 25.4 | 762.0 |
| 3 | Quality Gate | 63 | 47 | 74.6% | 73.9 | 24.6 | 738.6 |
| 4 | Secret Scan (gitleaks) | 62 | 35 | 56.5% | 38.7 | 12.9 | 387.3 |
| 5 | CI Gate | 63 | 40 | 63.5% | 37.9 | 12.6 | 379.2 |
| 6 | Typecheck Gate | 52 | 9 | 17.3% | 9.9 | 3.3 | 98.7 |
| 7 | Migration Smoke Test | 13 | 13 | 100% | 9.6 | 3.2 | 95.7 |
| 8 | 🗂️ Generate Supabase Types (zapp) | 5 | 5 | 100% | 2.0 | 0.7 | 19.8 |
| 9 | Security & Compliance | 63 | 5 | 7.9% | 1.6 | 0.5 | 15.6 |
| 10–20 | Other (10 workflows) | — | — | — | 2.5 | — | 25.2 |
| | **TOTAL** | **1,000** | **~350** | | **407.5** | **135.8** | **~4,075** |

---

## 2. Top 5 Most Expensive Failures

### #1 — CI/CD Pipeline (38.1% of waste)
| Metric | Value |
|--------|-------|
| Runner minutes wasted | 155.2 min (3 days) |
| Daily waste | 51.7 min/day → 1,552.2 min/month |
| Failure rate | 66.7% (42/63 runs) |
| Avg failed run | 3.7 min |
| Failing jobs | **Unit tests** + **E2E tests** |
| Monthly cost | **~$12.42** |
| Annual cost | **~$149.01** |

### #2 — 🚀 Build & Deploy — ZAPP web v3 (18.7% of waste)
| Metric | Value |
|--------|-------|
| Runner minutes wasted | 76.2 min (3 days) |
| Daily waste | 25.4 min/day → 762.0 min/month |
| Failure rate | 86.7% (39/45 runs) |
| Avg failed run | 1.95 min |
| Monthly cost | **~$6.10** |
| Annual cost | **~$73.15** |

### #3 — Quality Gate (18.1% of waste)
| Metric | Value |
|--------|-------|
| Runner minutes wasted | 73.9 min (3 days) |
| Daily waste | 24.6 min/day → 738.6 min/month |
| Failure rate | 74.6% (47/63 runs) |
| Avg failed run | 1.57 min |
| Failing jobs | **Unit & Integration Tests** |
| Monthly cost | **~$5.91** |
| Annual cost | **~$70.91** |

### #4 — Secret Scan (gitleaks) (9.5% of waste)
| Metric | Value |
|--------|-------|
| Runner minutes wasted | 38.7 min (3 days) |
| Daily waste | 12.9 min/day → 387.3 min/month |
| Failure rate | 56.5% (35/62 runs) |
| Avg failed run | 1.11 min |
| Failing jobs | **Detect secrets** |
| Monthly cost | **~$3.10** |
| Annual cost | **~$37.18** |

### #5 — CI Gate (9.3% of waste)
| Metric | Value |
|--------|-------|
| Runner minutes wasted | 37.9 min (3 days) |
| Daily waste | 12.6 min/day → 379.2 min/month |
| Failure rate | 63.5% (40/63 runs) |
| Avg failed run | 0.95 min |
| Failing jobs | **Unit tests** |
| Monthly cost | **~$3.03** |
| Annual cost | **~$36.40** |

---

## 3. Potential Savings

| Scenario | Monthly Savings | Annual Savings | Waste Eliminated |
|----------|---------------:|---------------:|-----------------:|
| **Fix Top 5** | **~$30.55/mo** | **~$366.65/yr** | **93.7%** |
| Fix tests only (CI/CD + CI Gate + Quality Gate) | ~$21.36/mo | ~$256.32/yr | 65.5% |
| Fix everything | ~$32.60/mo | ~$391.20/yr | 100% |

### Cross-cutting insight:
**CI/CD Pipeline, CI Gate, and Quality Gate ALL fail on the same unit tests.**  
A single fix (the failing test suite) eliminates 65.5% of all CI waste across 3 workflows simultaneously.

---

## 4. Disable vs Fix Recommendations

### 🔧 FIX: CI/CD Pipeline
- **Why:** Primary CI workflow — runs on every push/PR. Essential signal for code quality.
- **Cost impact:** $12.42/mo wasted — low absolute cost, high developer friction.
- **Action:** Fix failing unit tests and E2E tests. These are the root cause blocking 3 workflows.

### 🔧 FIX or MERGE: Quality Gate
- **Why:** Runs **the same tests** as CI/CD Pipeline + CI Gate. Redundant.
- **Options:**
  1. Fix tests (fixes all 3)
  2. Merge into CI/CD Pipeline, remove duplicate
  3. Make it depend on CI/CD Pipeline success (`needs: ci-pipeline`)
- **Action:** Remove duplication or make sequential (gate after CI passes).

### 🔧 FIX or MERGE: CI Gate
- **Why:** Exists only for branch protection status check. Same test failures.
- **Action:** If test suite is fixed, this passes. Consider merging into CI/CD Pipeline.

### 🔧 FIX: Secret Scan (gitleaks) — **56.5% failure rate**
- **Why:** Either actual secrets are being committed (security risk!) or false positives.
- **Action:** Investigate immediately. If real secrets: fix the leak. If false positives: tune `.gitleaks.toml`.
- **Do not disable** — this is a security control.

### 🔧 INVESTIGATE: Build & Deploy — **86.7% failure rate**
- **Why:** Sometimes succeeds (13.3%), mostly fails quickly (1.95 min avg). Likely infrastructure dependency issue (DB, VPS SSH, Docker registry).
- **Action:** Check failure logs. If transient infra issue, consider `workflow_dispatch`-only trigger until stable.
- **Note:** Each successful deploy costs 3.45 min (likely the actual build+push+deploy).

### 🗑️ DELETE: Intentionally Disabled Workflows
These 3 workflows are intentionally broken (`exit 1`) and only trigger via `workflow_dispatch`. They cost $0 but clutter the UI:

| Workflow | Reason Disabled |
|----------|----------------|
| Apply ChatPanel Fixes | Script missing (`scripts/migrate-chatpanel.mjs` doesn't exist) |
| Add zapp+evo schema stubs | Schemas now generated natively in types.ts |
| Apply types.ts patch | Types now generated via Supabase MCP |

**Action:** Delete these 3 YAML files from `.github/workflows/`.

### 👀 MONITOR: Typecheck Gate
- Now passing **82.7%** of runs (only 9/52 failed). Improvement trend — continue monitoring.

### 👀 REVIEW: Workflows with Zero Runs
17 workflows had zero runs in the 3-day window. Most are PR-only, scheduled cron, or manual dispatch. Review:

| Workflow | Likely Trigger |
|----------|---------------|
| E2E Admin/Evolution (VPS) | PR / manual |
| Seed/Validate/Cleanup E2E | PR / manual |
| Schema Snapshot | Scheduled |
| Copilot / Copilot code review / Copilot cloud agent | Manual / scheduled |
| Fix schema references | Manual |
| Dependabot Updates | Scheduled |
| PR Size Check, Commitlint, Merge Bot | PR |
| Clean Build From Zero | Manual |

---

## Summary

| | Value |
|--|-------|
| **Current monthly waste** | **~$32.60/mo** (~4,075 min) |
| **Current annual waste** | **~$391.20/yr** |
| **Savings from fixing top 5** | **~$30.55/mo** (~$366.65/yr) |
| **Savings from just fixing tests** | **~$21.36/mo** (~$256.32/yr) |
| **Quick cleanup (delete dead workflows)** | **$0 (de-clutter only)** |

**Bottom line:**  
- The absolute dollar waste is modest (~$33/mo) — GitHub Actions cost is not the emergency here.
- **Developer productivity** is the real cost: failed runs block PRs, queue builds, and waste dev attention.
- **Fixing the failing unit tests** is the single highest-leverage action — it unblocks 3 workflows at once.
- **3 disabled workflows** should be deleted (pure clutter).
- **Gitleaks 56% failure rate** may indicate actual secret leaks — investigate urgently.
