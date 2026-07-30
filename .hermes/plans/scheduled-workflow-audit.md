# Audit: Schedule-Driven Workflows

**Repo:** `adm01-debug/zapp-web-v3`
**Date:** 2026-07-30
**Auditor:** Scheduled Workflow Audit Agent

---

## Summary

| Workflow | Cron | Schedule Runs | Last Run | Status | Category |
|---|---|---|---|---|---|
| 📸 Schema Snapshot | Sun 04:00 UTC | 0 | Never | Schedule never fired (277 push/dispatch runs from earlier config) | STALE |
| Health Review Quinzenal | 1st/15th 09:00 UTC | 0 | Never | Created Jul 26 — next fire Aug 1 | STALE |
| Clean Build From Zero | Sat 04:00 UTC | 0 | Never | 0 total runs ever — never fired | STALE |
| Flaky Test Detector | Mon-Fri 03:00 UTC | 3 | Jul 30 ✅ | All 3 schedule runs passed | WORKING |
| Cleanup E2E data (VPS) | Daily 07:00 UTC | 7 | Jul 30 ❌ | All 7 failed at "Configurar SSH" step | SILENTLY_BROKEN |
| Branch Protection Sentinel | Daily 06:00 UTC | 3 | Jul 30 ❌ | Fails at branch protection API call (permissions) | SILENTLY_BROKEN |
| CodeQL | Mon 09:00 UTC | 10 | Jul 27 ✅ | All schedule runs passed | WORKING |
| E2E Inbox (VPS) | Daily 09:00 UTC | 3 | Jul 30 ❌ | All 3 failed at "Configurar SSH" step (first job) | SILENTLY_BROKEN |
| 🗂️ Generate Supabase Types | Mon 06:00 UTC | 0 | Never | 0 schedule runs; 16 manual dispatch all failed | STALE |
| Security & Compliance | Mon 06:00 UTC | 9 | Jul 27 ❌ | Latest failed; earlier ones passed. Failure at `bun install` | SILENTLY_BROKEN |
| Security Invoker Gate | Mon 08:00 UTC | 2 | Jul 27 ✅ | Both scheduled runs passed | WORKING |
| 🕸️ Regenerate Knowledge Graph | Mon 08:00 UTC | — | — | **Not committed yet** — file is untracked in local main branch | NEVER_ACTIVATED |

---

## Detailed Findings

### WORKING (3)
1. **Flaky Test Detector** — Runs weekdays at 03:00 UTC. 3/3 schedule runs succeeded. Produces test-results artifacts. **Healthy.**
2. **CodeQL** — Runs Mondays at 09:00 UTC. 10/10 schedule runs succeeded. Weekly deep security scan. **Healthy.**
3. **Security Invoker Gate** — Runs Mondays at 08:00 UTC. 2/2 schedule runs succeeded. Validates SECURITY INVOKER on views. **Healthy.**

### SILENTLY_BROKEN (4)
1. **Cleanup E2E data (VPS)** — Daily at 07:00 UTC. **All 7 schedule runs failed** at the "Configurar SSH" step (step 2). Likely causes: missing/expired VPS_SSH_KEY secret, wrong VPS_SSH_HOST, or SSH connectivity issue to the VPS. Since the workflow has `workflow_call` and is meant to be called by E2E flows too, this GC job is silent-failing — the E2E users data is not being cleaned up on schedule.

2. **Branch Protection Sentinel** — Daily at 06:00 UTC. Fails at the "Check branch protection via GitHub API" step. The `curl` call to `/repos/…/branches/main/protection` fails, probably because the GITHUB_TOKEN on schedule events lacks `administration: read` permission (the token has fewer permissions than on PR events). The error was observed on all 3 recent schedule runs.

3. **E2E Inbox (VPS)** — Daily at 09:00 UTC. **All 3 schedule runs failed** at the "Configurar SSH" step in the first job (`validate-user`). Same SSH failure pattern as cleanup-e2e-data. The subsequent E2E test jobs are skipped. The VPS SSH secret is broken or misconfigured.

4. **Security & Compliance** — Weekly Monday 06:00 UTC. The Jul 27 schedule run failed at the "Install dependencies" step (`bun install`), breaking the dependency audit. Previous runs (Jul 20, 13, 6) all succeeded. The failure could be a transient network issue or a new broken dependency.

### STALE (4)
1. **📸 Schema Snapshot** — Weekly Sunday 04:00 UTC. **0 scheduled runs ever.** The workflow has 277 successful runs from push events (likely from before the schedule was added or from a different workflow configuration). The current `on:` only includes `schedule` and `workflow_dispatch`. Since the schedule was committed Jul 28 and the last Sunday was Jul 26, the cron has never had a chance to fire on the current configuration.

2. **Health Review Quinzenal** — 1st and 15th of each month at 09:00 UTC. **0 scheduled runs ever.** Created Jul 26, 2026. The next scheduled fire is Aug 1. The 346 runs it has are all from `pull_request` events — the `pr-check` job just echoes a skip message. Cannot yet assess if the schedule works.

3. **Clean Build From Zero** — Weekly Saturday 04:00 UTC. **0 runs total — never fired.** Created Jul 27 (Monday). The next scheduled fire is Aug 1 (Saturday). Cannot yet assess.

4. **🗂️ Generate Supabase Types** — Weekly Monday 06:00 UTC. **0 schedule runs ever.** All 16 runs are manual (workflow_dispatch) and all failed. The workflow requires `ZAPP_META_URL` and `ZAPP_META_TOKEN` secrets which are not configured, so even manual runs produce a warning and exit 0. But the exit code analysis shows failures — possibly the bun setup step failing on schedule runs due to different environment? Since there are 0 schedule runs, we can't tell.

### NEVER_ACTIVATED (1)
1. **🕸️ Regenerate Knowledge Graph (Graphify)** — Weekly Monday 08:00 UTC. **File is untracked** (`git status: ?? regenerate-graph.yml`) on main branch. Never committed or pushed to GitHub. Does not exist on remote. The workflow **cannot fire** until committed and merged.

---

## Recommendations

1. **Fix VPS SSH secrets** (affects cleanup-e2e-data + e2e-inbox-vps): Renew or update `VPS_SSH_KEY`, verify `VPS_SSH_HOST` and `VPS_SSH_USER` in repository secrets. Both VPS-touching scheduled workflows are 100% broken on schedule.

2. **Fix Branch Protection Sentinel permissions**: The schedule-run GITHUB_TOKEN lacks `administration: read`. Either use a PAT with sufficient scope, or add the `administration: read` permission at the job level:
   ```yaml
   verify-branch-protection:
     permissions:
       administration: read
   ```

3. **Investigate Security workflow bun install failure**: Re-run the schedule once and check if it was a transient issue or a persistent lockfile problem.

4. **Commit regenerate-graph.yml**: The file is ready but never pushed. It has both push and schedule triggers — just commit and push.

5. **Configure ZAPP_META secrets** for gen-types-zapp: Add `ZAPP_META_URL` and `ZAPP_META_TOKEN` to enable automatic type regeneration.

6. **Monitor new schedules** (schema-snapshot, clean-build, health-review): Check after their first scheduled fire that they produce the expected outputs.
