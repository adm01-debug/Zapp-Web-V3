# BRANCH PROTECTION CONFIGURATION

**Status:** ENABLED ✅
**Date:** 2026-07-26
**Branch:** main

---

## Configuration Applied

| Setting | Value | Status |
|---------|-------|--------|
| Required Status Checks | `ci` | ✅ |
| Strict Mode | true (pass on first try) | ✅ |
| Required Approving Reviews | 1 | ✅ |
| Dismiss Stale Reviews | true | ✅ |
| Enforce Admins | true | ✅ |
| Allow Force Pushes | false | ✅ |
| Allow Deletions | false | ✅ |
| Required Linear History | false | ⚠️ Optional |

---

## What This Means

### ✅ Protected Actions
- Direct pushes to `main` are **BLOCKED**
- Merges without PR approval are **BLOCKED**
- Force pushes to `main` are **BLOCKED**
- Branch deletion is **BLOCKED**

### ⏳ Allowed Actions
- Create branches from `main`
- Open PRs against `main`
- Push to feature branches
- Fork and contribute via PR

---

## Required Workflow for Development

### Before (NOT ALLOWED anymore):
```bash
git commit -m "fix: some fix"
git push origin main  # ❌ BLOCKED!
```

### After (REQUIRED):
```bash
git checkout -b fix/my-fix
git commit -m "fix: some fix"
git push origin fix/my-fix
# Then open PR and get 1 approval
# CI must pass (status check: ci)
# Then merge via PR
```

---

## CI/CD Integration

The `ci` workflow must pass for PRs to be merged. Ensure:
1. CI workflow runs on PRs against `main`
2. All critical tests are in the `ci` workflow
3. CI is stable (no flaky tests blocking merges)

---

## Migration for Existing Workflows

### Lovable/Agent Commits
Agents that commit directly to `main` need to be updated:
- Create branch: `git checkout -b agent/fix`
- Commit: `git commit -m "fix: ..."`
- Push branch: `git push origin agent/fix`
- Open PR automatically (configure agent for this)

### Manual Commits
```bash
# Instead of committing to main:
git checkout -b feature/my-feature
git commit -m "feat: my feature"
git push origin feature/my-feature
# Create PR via GitHub UI
```

---

## Verification Commands

```bash
# Check protection status
gh api repos/adm01-debug/zapp-web-v3/branches/main/protection --jq '.required_pull_request_reviews'

# Expected output:
# {
#   "required_approving_review_count": 1,
#   "dismiss_stale_reviews": true
# }

# Test that direct push is blocked
git push origin main
# Should return: error: GH006: Protected branch update failed
```

---

*Document Status: ACTIVE — Branch protection enforced*
