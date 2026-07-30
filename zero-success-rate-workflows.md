# 💀 Zero-Success-Rate Workflows

**Repository:** adm01-debug/zapp-web-v3  
**Date:** 2026-07-30  
**Total workflows:** 39 | **Zero-success:** 8 (20.5%)

---

## Confirmed Zero-Success-Rate Workflows

All 8 workflows below have **0% success rate across every single run ever** — they never passed once.

### 1. 🗑️ Cleanup E2E data (VPS)
| Field | Value |
|---|---|
| **File** | `.github/workflows/cleanup-e2e-data.yml` |
| **Workflow ID** | 318917144 |
| **Total runs** | 7 |
| **Breakdown** | 7 failures, 0 success |
| **Triggers** | `workflow_dispatch`, `workflow_call` |
| **Assessment** | E2E cleanup consistently failing. May depend on broken infra that prevents cleanup from completing. |

### 2. ✅ commitlint
| Field | Value |
|---|---|
| **File** | `.github/workflows/commitlint.yml` |
| **Workflow ID** | 320943416 |
| **Total runs** | 2 |
| **Breakdown** | 2 failures, 0 success |
| **Triggers** | File not on `main` branch |
| **Assessment** | May have been superseded by another commit lint check or exists only on feature branches. |

### 3. 🗂️ Generate Supabase Types (zapp)
| Field | Value |
|---|---|
| **File** | `.github/workflows/gen-types-zapp.yml` |
| **Workflow ID** | 313714687 |
| **Total runs** | 17 |
| **Breakdown** | 16 failures, 1 inconclusive, 0 success |
| **Triggers** | Weekly schedule (Mondays 06:00 UTC) |
| **Assessment** | **Scheduled type generation has NEVER succeeded.** Runs every week and burns runner minutes. The DB schema or Supabase connection config is broken for this workflow. Strong deletion candidate. |

### 4. 🧪 E2E Evolution (VPS)
| Field | Value |
|---|---|
| **File** | `.github/workflows/e2e-evolution-vps.yml` |
| **Workflow ID** | 318913756 |
| **Total runs** | 1 |
| **Breakdown** | 1 failure, 0 success |
| **Triggers** | `workflow_dispatch` |
| **Assessment** | Evolution E2E test never passed. Only ran once and failed. |

### 5. 🤖 merge-bot
| Field | Value |
|---|---|
| **File** | `.github/workflows/merge-bot.yml` |
| **Workflow ID** | 321048580 |
| **Total runs** | 2 |
| **Breakdown** | 2 failures, 0 success |
| **Triggers** | File not on `main` branch |
| **Assessment** | Auto-merge bot never succeeded. May be superseded by other merge strategies. |

### 6. 🔥 Migration Smoke Test
| Field | Value |
|---|---|
| **File** | `.github/workflows/migration-smoke-test.yml` |
| **Workflow ID** | 321015843 |
| **Total runs** | **96** |
| **Breakdown** | 94 failures, 2 cancelled, 0 success |
| **Triggers** | PR-based migration testing |
| **Assessment** | **Highest waste — 96 runs, zero passes.** Applies migrations against a fresh Postgres 16, but the test itself has never passed. Massive runner minutes consumed. **Top deletion candidate.** |

### 7. 🔒 migration-uniqueness-check
| Field | Value |
|---|---|
| **File** | `.github/workflows/migration-uniqueness-check.yml` |
| **Workflow ID** | 320944226 |
| **Total runs** | 1 |
| **Breakdown** | 1 failure, 0 success |
| **Triggers** | File not on `main` branch |
| **Assessment** | **Redundant.** Superseded by Migration Uniqueness Gate (`.github/workflows/migration-uniqueness.yml`, ID 320912402) which runs successfully. |

### 8. 📏 pr-size-check
| Field | Value |
|---|---|
| **File** | `.github/workflows/pr-size-check.yml` |
| **Workflow ID** | 320943395 |
| **Total runs** | 2 |
| **Breakdown** | 2 failures, 0 success |
| **Triggers** | File not on `main` branch |
| **Assessment** | **Redundant.** Superseded by PR Size Gate (`.github/workflows/pr-size-gate.yml`, ID 320937472) which runs successfully. |

---

## Recommendations

| Priority | Workflow | Reason |
|---|---|---|
| 🔴 High | **Migration Smoke Test** | 96 wasted runs, heaviest runner-minute consumption |
| 🔴 High | **Generate Supabase Types (zapp)** | 17 failed weekly scheduled runs, keeps wasting resources |
| 🟡 Medium | **Cleanup E2E data (VPS)** | 7 failures, block CI pipeline when called |
| 🟡 Medium | **pr-size-check** | Dead — superseded by working PR Size Gate |
| 🟡 Medium | **migration-uniqueness-check** | Dead — superseded by working Migration Uniqueness Gate |
| 🟢 Low | **commitlint** | Only 2 runs, file not on main branch |
| 🟢 Low | **merge-bot** | Only 2 runs, file not on main branch |
| 🟢 Low | **E2E Evolution (VPS)** | Only 1 run |

---

## Methodology

1. Listed all 39 workflows via `GET /repos/{owner}/{repo}/actions/workflows`
2. For each workflow with runs, fetched all runs (paginated, 100 per page)
3. Calculated success rate = `successes / total_completed_runs * 100`
4. Confirmed zero-success = 0 successes across the entire run history
5. Verified by re-checking with direct `gh api` calls for candidates
