# Security Workflows Audit

Audit date: 2026-07-30
Audited by: Hermes Agent (subagent)
Scope: 6 security-related GitHub Actions workflows in `.github/workflows/`

---

## 1. `security.yml` — "Security & Compliance"

**Triggers:** push (main/master), PR (main/master), schedule (Mon 06:00 UTC), workflow_dispatch

**Jobs:**
- **gitleaks** (advisory, `continue-on-error: true`): Runs `gitleaks/gitleaks-action@v3`
- **dependency-audit** (advisory): Runs `npm audit --audit-level=high`, also checks for non-standard lockfile URLs

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | Mostly. Requires `GITLEAKS_LICENSE` secret; if absent the gitleaks step fails silently (advisory). The dependency audit always exits 0. |
| Blocks legitimate commits? | ❌ No — both jobs are advisory only (`continue-on-error: true` or `exit 0`). |
| Redundant? | ⚠️ **YES — gitleaks is duplicated.** `gitleaks.yml` runs the same tool as a HARD gate on the same triggers. The advisory gitleaks here adds CI cost (~1-2 min) with no value. |
| Per-push vs schedule-only? | **Should remove the push/PR triggers and keep only schedule + dispatch.** The dep audit is low-urgency and advisory; running it on every push wastes CI minutes. Schedule (weekly) + manual dispatch is adequate. |

**Issues:**
1. **Duplicated gitleaks** — `security.yml` and `gitleaks.yml` both run gitleaks on every push/PR with overlapping scope. Consolidate by removing the gitleaks job from this workflow.
2. **GITLEAKS_LICENSE dependency** — The `gitleaks/gitleaks-action@v3` requires a license for full functionality without false-positive rate limits. If unset, the step may be degraded.
3. **Advisory-only on PRs wastes CI minutes** — every PR pays ~2-3 min for an advisory check that `gitleaks.yml` already runs as a hard gate.

---

## 2. `gitleaks.yml` — "Secret Scan (gitleaks)"

**Triggers:** push (main/master), PR (main/master)

**Jobs:**
- **Detect secrets** (hard gate, `continue-on-error: false`): Downloads gitleaks 8.21.2, runs `gitleaks detect --exit-code=1`. On push scans `$BEFORE..HEAD`; on PR scans `origin/base_ref...HEAD`. Reports results as SARIF upload.

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | **Minor cosmetic bug, functionally OK.** The force-push branch assigns to an unused variable (`LOG_OPTS`) but passes `--log-opts="HEAD"` directly — harmless, just dead code. Main push and PR paths are correct. |
| Blocks legitimate commits? | ⚠️ **Yes, but that's the point.** Uses `--exit-code=1` which fails on any secret detection. This could false-positive if the `.gitleaks.toml` allowlist is incomplete. Current allowlist covers historical JWT commits + regexes — looks reasonable. |
| Redundant? | ⚠️ **YES — gitleaks is duplicated in `security.yml`.** This is the authoritative (hard gate) version. |
| Per-push vs schedule-only? | **Keep on every push/PR** — secrets must be caught before merge. No change needed here. |

**Issues:**
1. **Dead code on force-push path** — `LOG_OPTS` variable assigned but never used. Low severity.
2. **Duplicated with `security.yml`** — should be the sole gitleaks runner. Remove gitleaks from `security.yml`.
3. **Hard-pinned version (8.21.2)** — no auto-update mechanism. Gitleaks releases new rules regularly; stale versions may miss new patterns.

---

## 3. `codeql.yml` — "CodeQL"

**Triggers:** push (main), PR (main), schedule (Mon 09:00 UTC)

**Jobs:**
- **analyze** (advisory, `continue-on-error: true`): Initializes CodeQL with `security-extended` queries for JavaScript/TypeScript, autobuilds, runs analysis.

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | ✅ Yes. Standard CodeQL setup with `security-extended` query pack. |
| Blocks legitimate commits? | ❌ No — `continue-on-error: true`, results are advisory only. |
| Redundant? | ❌ No — CodeQL is unique. The `quality-gate.yml` has complementary security scripts (RLS audit, schema access sim) but nothing that duplicates CodeQL's taint/vulnerability analysis. |
| Per-push vs schedule-only? | **⚠️ Should be schedule-only.** CodeQL is resource-heavy (CodeQL analysis actions consume GitHub-hosted runner minutes at premium rate). Since it's advisory on PRs, running it on every push/PR is wasteful. The Monday schedule is sufficient for a weekly vulnerability scan. Keep `workflow_dispatch` for on-demand. |

**Issues:**
1. **Premature optimization?** — CodeQL on every push costs ~$0.008/min × 5-15 min = significant monthly cost for an advisory check. Move to schedule-only.
2. **Single language matrix** — Only `javascript-typescript`, which is correct for this project, but if TypeScript analysis is the goal, consider the `typescript` language explicitly for stricter type-based queries.
3. **No SARIF upload** — Unlike `gitleaks.yml`, the CodeQL results aren't explicitly uploaded; but CodeQL's analyze action uploads results to GitHub's code scanning dashboard by default (via `github/codeql-action/analyze@v4`).

---

## 4. `branch-protection-sentinel.yml` — "Branch Protection Sentinel"

**Triggers:** PR (main/master, paths: `src/**`, `supabase/functions/**`), schedule (daily 06:00 UTC), workflow_dispatch

**Jobs:**
- **check-quality** (PR only, blocking): Checks for new `console.log` and `as any` in changed `.ts`/`.tsx` files. Exits 1 on violations.
- **verify-branch-protection** (schedule/dispatch only, advisory): Calls GitHub API to verify branch protection rules on main (`allow_force_pushes`, `dismiss_stale_reviews`, `enforce_admins`, `required_status_checks`). Always exits 0.

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | ⚠️ **Partially.** The `check-quality` job works but has fragile grep pipelines. The `verify-branch-protection` syntax is correct (hexdump confirmed `${{ secrets.GITHUB_TOKEN }}` was just a rendering artifact). |
| Blocks legitimate commits? | ⚠️ **Yes, both checks can false-positive.** `console.log` check excludes `validationLogger` but a legitimate debug log with a different logger would still be blocked. `as any` check could block legitimate type escapes (allows comment-based opt-out). |
| Redundant? | ⚠️ **Partially.** The `console.log`/`as any` checks are **code quality, not security** — they don't belong in a "security" audit. They're unique to this workflow but arguably belong in `quality-gate.yml` or similar. |
| Per-push vs schedule-only? | **Keep PR trigger for quality checks** (they're meaningful per-PR). **Schedule-only for branch-protection verification is correct** (daily might be overkill — weekly is sufficient since branch protection rarely changes). |

**Issues:**
1. **Misclassified checks** — `console.log` and `as any` linting are code-quality concerns, not security. They bloat a "Branch Protection Sentinel" workflow.
2. **Daily schedule is excessive** — Branch protection config rarely changes. Weekly is sufficient for the verification job.
3. **Fragile grep patterns** — The multi-pipe grep pipelines for detecting `console.log` and `as any` can miss edge cases (multiline adds, string literals containing "as any", `console.log` inside template literals).
4. **No path filter on PR quality check** — The `check-quality` job should skip if no `.ts`/`.tsx` files changed (currently it runs on every PR touching `src/**` or `supabase/functions/**`, even if only CSS/markdown files changed).

---

## 5. `security-invoker-gate.yml` — "Guard — Security Invoker"

**Triggers:** PR (paths: `supabase/migrations/**`, `src/integrations/supabase/**`), schedule (Mon 08:00 UTC)

**Jobs:**
- **check-security-invoker** (blocking): Queries postgres-meta to find views in `public`, `zapp`, `evo` schemas without `security_invoker=true`, and functions in `zapp`/`evo` executable by `anon`. Exits 1 on violations.

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | ⚠️ **Silent-skip bug.** If `ZAPP_META_URL` or `ZAPP_META_TOKEN` secrets aren't configured, the job prints "Secrets not configured — skipping live check" and exits 0. **No warning annotation is emitted** — the check silently passes. In forks or CI environments where secrets are absent, security-invoker violations would merge unnoticed. |
| Blocks legitimate commits? | ✅ Yes, and correctly so — views without `security_invoker` are a security gap (allow direct table access bypassing RLS). Functions executable by `anon` are also genuine security concerns. |
| Redundant? | ❌ No — this is the only workflow checking `security_invoker` and `anon` function privileges. The RLS coverage audit in `quality-gate.yml` checks a different thing (whether tables have RLS enabled, not whether views use `security_invoker`). |
| Per-push vs schedule-only? | **Current triggers are optimal.** Runs on PR only when relevant paths change (efficient), plus a weekly schedule as a safety net. No changes needed. |

**Issues:**
1. **Silent skip when secrets missing** — Should emit a `::warning::` annotation when the check is skipped, so reviewers know the gate is inactive. Currently only prints to stdout which isn't surfaced in the GitHub UI.
2. **Error doesn't list violating objects** — The error message says "X views without security_invoker found!" but doesn't list `schema.view` names. Developers must run the SQL manually to find and fix violations.
3. **Hard-coded schemas** — Only checks `public`, `zapp`, `evo`. New schemas (e.g., `bpm`, `vendas`, `financeiro`) would be missed.

---

## 6. `ai-agent-pr-policy.yml` — "AI Agent PR Policy"

**Triggers:** push (main, develop)

**Jobs:**
- **check-direct-push** (blocking): Checks if any non-merge commits in the push were authored by known AI agents (claude, copilot, lovable, github-actions, dependabot, noreply@anthropic.com, noreply@github.com). Fails with `::error::` if any found.

**Assessment:**
| Criterion | Verdict |
|---|---|
| Works correctly? | ✅ Yes. Uses `git log --no-merges` to isolate direct commits, checks email and name with `grep -qi` (case-insensitive, substring match). Force-push edge case handled (exits 0). |
| Blocks legitimate commits? | ⚠️ **By design yes, but could false-positive.** The substring grep means a human named "Claudemir" (containing "claude") or email "dependabot-support@..." would be caught. Low probability but nonzero. |
| Redundant? | ❌ No — unique workflow. No other check enforces the "AI agents must use PRs" policy. |
| Per-push vs schedule-only? | **Keep on every push** — that's its entire purpose. No change. |

**Issues:**
1. **False-positive risk with substring matching** — `grep -qi "claude"` matches "claudemir", "claudia", etc. Could use word-boundary matching (`\bclaude\b`) for author names, but email matching is usually fine with substring.
2. **`dependabot` in AI_AUTHORS list** — Dependabot creates PRs, not direct pushes, so this is likely harmless in practice. But if a `dependabot[bot]` account ever pushed directly (misconfig), it would correctly be blocked.
3. **Doesn't check `lovable` push properly** — Lovable's Lovable.dev platform may push directly to branches from its web UI. The policy correctly blocks this.
4. **`github-actions` inclusion** — Blocks the `github-actions[bot]` user from pushing directly. This is correct for the policy but means any auto-merge or admin script using `GITHUB_TOKEN` for direct pushes would be blocked.

---

## Cross-Cutting Findings

### Redundancy

| Workflow | Redundant with | Action |
|---|---|---|
| `security.yml` (gitleaks job) | `gitleaks.yml` | Remove gitleaks job from `security.yml` |
| `security.yml` (dep audit) | `ci.yml`'s "Dependency audit" job | Both do `npm audit` — consolidate |
| `branch-protection-sentinel.yml` (quality checks) | None directly, but misclassified | Move `console.log`/`as any` checks to `quality-gate.yml` |

### Efficiency Recommendations

| Workflow | Current Runs | Recommended |
|---|---|---|
| `codeql.yml` | Every push/PR + weekly | **Schedule-only** (weekly) + dispatch |
| `security.yml` | Every push/PR + weekly | Schedule-only (weekly) after removing gitleaks, consolidate dep audit with `ci.yml` |
| `branch-protection-sentinel.yml` (verify job) | Daily | **Weekly** + dispatch (branch protection rarely changes) |

### Priority Fixes

1. **HIGH** — Remove gitleaks job from `security.yml` (duplicate, wastes CI minutes)
2. **MEDIUM** — Add `::warning::` annotation in `security-invoker-gate.yml` when secrets are missing (silent skip)
3. **MEDIUM** — Change `codeql.yml` to schedule-only (advisory check, expensive on every push)
4. **LOW** — Fix unused variable in `gitleaks.yml` force-push path (cosmetic)
5. **LOW** — Improve `branch-protection-sentinel.yml` path filters and grep patterns
6. **LOW** — Add word-boundary matching to `ai-agent-pr-policy.yml` to reduce false-positive risk
