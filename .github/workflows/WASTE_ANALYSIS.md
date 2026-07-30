# Workflow Waste Analysis — All 41 Workflows

Generated: 2026-07-30
Repo: adm01-debug/zapp-web-v3 (private)
Runner cost: $0.008/min (ubuntu-latest Linux)

## Summary

| Metric | Value |
|--------|-------|
| Total monthly runner minutes | **734 min** |
| Total monthly cost | **$5.89** |
| **Wasted minutes/mo** | **433 min (59%)** |
| **Wasted cost/mo** | **$3.46 (59%)** |
| Workflows with zero runs | 15 of 41 |
| Workflows with active runs | 26 of 41 |

> **Bottom line:** Nearly 60% of all runner minutes are pure waste — redundant push-trigger executions that duplicate PR checks on merge to main. Removing redundant push triggers on the top 5 workflows alone would save **380 min/mo ($3.04/mo)**.

---

## Top 5 Most Wasteful Workflows

### 1. Quality Gate — 137.7 min/mo wasted ($1.10)
| Metric | Value |
|--------|-------|
| Monthly runner minutes | **188.6 min** ($1.51) |
| Runs/month | 33.3 (73% push, 27% PR) |
| Avg duration | 339s (5.7 min) |
| **Waste** | **137.7 min/mo (73%)** |
| **Fix** | **Remove `push: [main, master]`** — PR trigger already runs on every merge target. The `push` on main executes the exact same checks on the same code. |

### 2. CodeQL — 99.1 min/mo wasted ($0.79)
| Metric | Value |
|--------|-------|
| Monthly runner minutes | **135.8 min** ($1.09) |
| Runs/month | 33.3 (73% push, 27% PR) |
| Avg duration | 245s (4 min) |
| **Waste** | **99.1 min/mo (73%)** |
| **Fix** | **Remove `push: [main]`** — PR + weekly schedule covers all security scanning needs. Push on main after merge is redundant. |

### 3. CI/CD Pipeline — 92.1 min/mo wasted ($0.74)
| Metric | Value |
|--------|-------|
| Monthly runner minutes | **126.2 min** ($1.01) |
| Runs/month | 33.3 (73% push, 27% PR) |
| Avg duration | 227s (3.8 min) |
| **Waste** | **92.1 min/mo (73%)** |
| **Fix** | **Remove `push: [main, develop]`** — PR trigger already covers the same checks. If `ci.yml` is a required status check, consider splitting the required gate into a lightweight status-only workflow. |

### 4. CI Gate — 43.5 min/mo wasted ($0.35)
| Metric | Value |
|--------|-------|
| Monthly runner minutes | **43.5 min** ($0.35) |
| Runs/month | 33.3 (100% push) |
| Avg duration | 130s (2.2 min) |
| **Waste** | **43.5 min/mo (100%)** |
| **Note** | This workflow's sole job is posting a `ci` commit status for branch protection. Every push runs the full 130-second check even though it only needs to run once per PR. |
| **Fix** | Make it only run on `pull_request` + `workflow_dispatch`. The branch protection `ci` status suffices from PR runs. |

### 5. AI Agent PR Policy — 7.3 min/mo wasted ($0.06)
| Metric | Value |
|--------|-------|
| Monthly runner minutes | **7.3 min** ($0.06) |
| Runs/month | 33.3 (100% push) |
| Avg duration | 13s |
| **Waste** | **7.3 min/mo (100%)** |
| **Note** | Current YAML only defines `pull_request` + `workflow_dispatch`, but historical runs show 100% push events. If current YAML is correct, waste should be 0 going forward. |
| **Fix** | Keep current YAML (already fixed). This will self-resolve. |

---

## Full Ranking (All 41 Workflows)

Ranked by **Waste Ratio** = (monthly_mins × redundancy%) / value_factor

| Rank | Workflow | Min/mo | Waste/min | Waste $ | Waste Ratio |
|------|----------|--------|-----------|---------|-------------|
| 1 | Quality Gate | 188.6 | 137.7 | $1.10 | 34.411 |
| 2 | CodeQL | 135.8 | 99.1 | $0.79 | 24.778 |
| 3 | CI/CD Pipeline | 126.2 | 92.1 | $0.74 | 23.026 |
| 4 | CI Gate | 43.5 | 43.5 | $0.35 | 10.873 |
| 5 | AI Agent PR Policy | 7.3 | 7.3 | $0.06 | 3.649 |
| 6 | 📸 Schema Snapshot | 23.9 | 7.2 | $0.06 | 3.584 |
| 7 | Security & Compliance | 17.2 | 12.6 | $0.10 | 3.138 |
| 8 | Migration Smoke Test | 27.0 | 8.1 | $0.06 | 2.699 |
| 9 | schema-drift-guard | 10.0 | 8.1 | $0.06 | 2.699 |
| 10 | Secret Scan (gitleaks) | 6.4 | 6.4 | $0.05 | 2.133 |
| 11 | Guard — Realtime Dead Channels | 7.3 | 3.9 | $0.03 | 1.290 |
| 12 | 🦕 Deno Contract Tests | 16.8 | 3.7 | $0.03 | 1.232 |
| 13 | Migration Uniqueness Gate | 4.7 | 2.8 | $0.02 | 0.940 |
| 14 | E46 — Regression Test Gate | 2.7 | 0.8 | $0.01 | 0.405 |
| 15 | Fix schema refs (DISABLED) | 0.1 | 0.0 | $0.00 | 0.001 |
| 16-41 | All others | 0-68.7 | 0.0 | $0.00 | 0.000 |

---

## Workflows by Cost Category

### 💰 Top 5 by Total Cost
| Workflow | Cost/mo | % of Total |
|----------|---------|------------|
| Quality Gate | $1.51 | 25.6% |
| CodeQL | $1.09 | 18.5% |
| CI/CD Pipeline | $1.01 | 17.1% |
| 🚀 Build & Deploy | $0.55 | 9.3% |
| CI Gate | $0.35 | 5.9% |

### 🔴 Zero-runs (no value delivered, but also no cost)
15 workflows have never consumed a runner minute:

| Workflow | Reason |
|----------|--------|
| E2E Admin (VPS) | manual dispatch only, never triggered |
| Seed E2E user/contacts | manual/workflow_call only |
| Validate E2E user | manual/workflow_call only |
| Clean Build From Zero | weekly schedule, never matched |
| Flaky Test Detector | 3 runs ever, 0 in 90d |
| 🕸️ Regenerate Knowledge Graph | recently added, 0 runs ever |
| commitlint, merge-bot, migration-uniqueness-check, pr-size-check, Create PR | exist on API but not on default branch |
| ts-nocheck-ratchet, typecheck-gate | on disk but not registered on default branch |
| Fix schema refs | self-disabled, migration complete |

---

## Waste Reduction Opportunities

### Immediate (remove redundant push triggers)
| Workflow | Saving | Effort |
|----------|--------|--------|
| Quality Gate | 137.7 min/mo | 1 line change |
| CodeQL | 99.1 min/mo | 1 line change |
| CI/CD Pipeline | 92.1 min/mo | 1 line change |
| CI Gate | 43.5 min/mo | 1 line change |
| Security & Compliance | 12.6 min/mo | 1 line change |
| Secret Scan (gitleaks) | 6.4 min/mo | 1 line change |
| schema-drift-guard | 8.1 min/mo | 1 line change |
| Migration Uniqueness Gate | 2.8 min/mo | 1 line change |
| Guard — Realtime Dead Channels | 3.9 min/mo | 1 line change |
| Migration Smoke Test | 8.1 min/mo | 1 line change |
| Deno Contract Tests | 3.7 min/mo | 1 line change |
| **Total** | **~418 min/mo** | **11 edits** |

### Short-term (code quality improvements)
- **Quality Gate** is the #1 cost driver at 5.7 min/run. Adding `bun cache` (already noted in recent commit) should help. Investigate why it takes 3x longer than CI/CD Pipeline (3.8 min).
- **CodeQL** at 4 min/run is slow due to deep code analysis — acceptable.

### Cleanup (remove dead workflows)
The following files exist on disk but have no run history on the default branch. Either delete them or move to a `/archive/` folder:
- `commitlint.yml`, `merge-bot.yml`, `migration-uniqueness-check.yml`, `pr-size-check.yml` (API-only, not on main)
- `ts-nocheck-ratchet.yml`, `typecheck-gate.yml` (on disk, never registered on default branch)
