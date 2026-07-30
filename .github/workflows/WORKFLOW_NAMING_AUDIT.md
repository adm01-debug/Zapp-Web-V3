# Workflow Naming Audit — `zapp-web-v3/.github/workflows/`

**Date:** 2026-07-30  
**Files audited:** 35 workflow YAML files  

---

## 1. All 35 Workflows — Filename vs Display Name

| # | Filename | Display Name | Trigger |
|---|----------|-------------|---------|
| 1 | `ai-agent-pr-policy.yml` | AI Agent PR Policy | push |
| 2 | `branch-protection-sentinel.yml` | Branch Protection Sentinel | pull_request, schedule, workflow_dispatch |
| 3 | `check-realtime-dead-channels.yml` | **Guard —** Realtime Dead Channels | pull_request, push |
| 4 | `ci.yml` | CI/CD Pipeline | push, pull_request |
| 5 | `ci-gate.yml` | CI Gate | push, pull_request |
| 6 | `ci-status-gate.yml` | CI Status Gate | push, pull_request, workflow_dispatch |
| 7 | `clean-build.yml` | Clean Build From Zero | schedule, workflow_dispatch |
| 8 | `cleanup-e2e-data.yml` | Cleanup E2E data (VPS) | workflow_dispatch, workflow_call, schedule |
| 9 | `codeql.yml` | CodeQL | push, pull_request, schedule |
| 10 | `create-pr.yml` | Create PR | workflow_call |
| 11 | `deno-contract-tests.yml` | 🦕 Deno Contract Tests — Edge Functions | push, pull_request |
| 12 | `deploy-vps.yml` | 🚀 Build & Deploy — ZAPP web v3 | push, workflow_dispatch |
| 13 | `e2e-admin-vps.yml` | E2E Admin (VPS) | workflow_dispatch |
| 14 | `e2e-crm-vps.yml` | E2E CRM (VPS) | pull_request, workflow_dispatch |
| 15 | `e2e-evolution-vps.yml` | E2E Evolution (VPS) | workflow_dispatch |
| 16 | `e2e-inbox-vps.yml` | E2E Inbox (VPS) | pull_request, workflow_dispatch, schedule |
| 17 | `flaky-test-detector.yml` | Flaky Test Detector | schedule, workflow_dispatch |
| 18 | `gen-types-zapp.yml` | 🗂️ Generate Supabase Types (zapp) | schedule, workflow_dispatch |
| 19 | `health-review.yml` | Health Review **Quinzenal** | pull_request, schedule, workflow_dispatch |
| 20 | `migration-smoke-test.yml` | Migration Smoke Test | pull_request, push |
| 21 | `migration-uniqueness.yml` | Migration Uniqueness **Gate** | pull_request, push |
| 22 | `pr-size-gate.yml` | PR Size Gate | pull_request |
| 23 | `quality-gate.yml` | Quality Gate | push, pull_request |
| 24 | `ratchet-tighten.yml` | **ratchet-tighten** | push |
| 25 | `regenerate-graph.yml` | 🕸️ Regenerate Knowledge Graph (Graphify) | schedule, workflow_dispatch, push |
| 26 | `regression-test-gate.yml` | **E46 —** Regression Test Gate | pull_request |
| 27 | `schema-drift.yml` | **schema-drift-guard** | pull_request, push, workflow_dispatch |
| 28 | `schema-snapshot.yml` | 📸 Schema Snapshot | schedule, workflow_dispatch |
| 29 | `security.yml` | Security **& Compliance** | push, pull_request, schedule, workflow_dispatch |
| 30 | `security-invoker-gate.yml` | **Guard —** Security Invoker | pull_request, schedule |
| 31 | `seed-e2e-contacts.yml` | Seed E2E contacts (VPS) | workflow_dispatch, workflow_call |
| 32 | `seed-e2e-user.yml` | Seed E2E user (VPS) | workflow_dispatch, workflow_call |
| 33 | `ts-nocheck-ratchet.yml` | TypeScript @ts-nocheck Ratchet | pull_request |
| 34 | `typecheck-gate.yml` | Typecheck Gate | push, pull_request |
| 35 | `validate-e2e-user.yml` | Validate E2E user (VPS) | workflow_dispatch, workflow_call |

---

## 2. Findings

### 🔴 Issue A — Gate/Guard Naming Mismatch (3 workflows)

The project mixes two spatial metaphors ("Gate" = entry check, "Guard" = ongoing watchdog) without a consistent rule:

| Filename | Display Name | Problem |
|----------|-------------|---------|
| `check-realtime-dead-channels.yml` | **Guard —** Realtime Dead Channels | "Guard" in display name but not in filename |
| `migration-uniqueness.yml` | Migration Uniqueness **Gate** | "Gate" in display name but not in filename |
| `schema-drift.yml` | **schema-drift-guard** | "guard" in display name but not in filename |

Bonus confusion: `security-invoker-gate.yml` uses "gate" in **filename** but "Guard" in its **display name**. The term is swapped.

**Recommendation:** Choose one term and apply it consistently in both filename and display name. "Gate" implies blocking entry (PR gate). "Guard" implies monitoring/detecting over time. Several "Gate" workflows are basically "Guard" workflows and vice versa.

---

### 🔴 Issue B — All-Lowercase Slug Names (2 workflows)

| Filename | Display Name | Problem |
|----------|-------------|---------|
| `ratchet-tighten.yml` | **ratchet-tighten** | No Title Case |
| `schema-drift.yml` | **schema-drift-guard** | No Title Case, also reveals the "guard" mismatch above |

Every other workflow uses Title Case / mixed case. These two look like internal slugs leaked into the display name.

---

### 🔴 Issue C — VPS Suffix Inconsistency (5 workflows)

Some add `(VPS)` to the display name, some put `-vps` in the filename, and `deploy-vps.yml` does neither:

| Filename | Display Name | Has `(VPS)` in name? | Has `vps` in filename? |
|----------|-------------|---------------------|----------------------|
| `cleanup-e2e-data.yml` | Cleanup E2E **data (VPS)** | ✅ Yes | ❌ No |
| `seed-e2e-contacts.yml` | Seed E2E **contacts (VPS)** | ✅ Yes | ❌ No |
| `seed-e2e-user.yml` | Seed E2E **user (VPS)** | ✅ Yes | ❌ No |
| `validate-e2e-user.yml` | Validate E2E **user (VPS)** | ✅ Yes | ❌ No |
| `deploy-vps.yml` | 🚀 Build & Deploy — ZAPP web v3 | ❌ No | ✅ Yes |

**Recommendation:** Standardize: either all get `-vps` in filename, or all get `(VPS)` in name. The seed/validate/cleanup workflows should probably include `-vps` in filename to match `e2e-*-vps.yml`.

---

### 🔴 Issue D — "E46" Cryptic Prefix

`regression-test-gate.yml` → `"E46 — Regression Test Gate"`

The **"E46"** prefix is opaque to anyone not familiar with internal ticket numbering (or BMW chassis codes). It provides zero semantic information about the workflow's purpose.

**Recommendation:** Either remove the prefix or replace with something meaningful (e.g. `"[Advisory] Regression Test Gate"` or simply `"Regression Test Gate"`).

---

### 🟡 Issue E — Language Mixing

`health-review.yml` → `"Health Review **Quinzenal**"`

"Quinzenal" is Portuguese for "bi-weekly". All other 34 workflow names are in English. This breaks the language convention.

**Recommendation:** Rename to `"Health Review (Biweekly)"` or `"Biweekly Health Review"`.

---

### 🟡 Issue F — Emoji Inconsistency (5 out of 35)

5 workflows have emojis in their name (🦕, 🚀, 🗂️, 🕸️, 📸); 30 do not. Some are visually helpful (🕸️ = graph), others are purely decorative.

If emojis are wanted, apply consistently or not at all. A convention like "only scheduled/infrequent workflows get emojis, PR-gate workflows don't" would be reasonable.

---

### 🟡 Issue G — Case Inconsistency in Seed/Cleanup/Validate Names

The E2E seed/validate workflows use inconsistent casing:
- `e2e-admin-vps.yml` → "E2E **A**dmin (VPS)" ← Title Case
- `e2e-crm-vps.yml` → "E2E **C**RM (VPS)" ← Title Case  
- `seed-e2e-contacts.yml` → "Seed E2E **c**ontacts (VPS)" ← lowercase
- `seed-e2e-user.yml` → "Seed E2E **u**ser (VPS)" ← lowercase
- `validate-e2e-user.yml` → "Validate E2E **u**ser (VPS)" ← lowercase
- `cleanup-e2e-data.yml` → "Cleanup E2E **d**ata (VPS)" ← lowercase

**Recommendation:** Make the second word consistent — either all Title Case (`"Cleanup E2E Data (VPS)"`) or all lowercase.

---

### 🟡 Issue H — Name/Function Mismatch Concerns

1. **`ci.yml` → "CI/CD Pipeline"** vs **`ci-gate.yml` → "CI Gate"**  
   Both do lockfile verification + TypeScript checks + schema guards + builds. The `ci.yml` is massive (399 lines) and heavily overlaps with `ci-gate.yml`. Either `ci.yml` is redundant, or the names don't reflect the division of responsibility. No "CD" (continuous deployment) logic was found in `ci.yml`.

2. **`security.yml` → "Security & Compliance"**  
   Currently runs gitleaks + npm audit. No compliance-specific checks exist (no SOC2, HIPAA, LGPD, or policy scanning). Name overpromises.

3. **`regression-test-gate.yml` → "E46 — Regression Test Gate"**  
   Only checks that `fix:` PRs include test changes. It does not actually **run** any regression tests. Name implies test execution, not just PR title scanning.

4. **`check-realtime-dead-channels.yml` → "Guard — Realtime Dead Channels"**  
   Checks subscriptions to views (which can't emit WAL). Name is accurate and descriptive — this is a good pattern others should follow.

---

### 🔵 Issue I — Confusable Name Clusters

- **CI cluster:** `ci.yml` / `ci-gate.yml` / `ci-status-gate.yml` — hard to tell which does what without reading each. `ci-status-gate.yml` just posts a status token (bypass), while the other two run actual checks.
- **TypeScript cluster:** `typecheck-gate.yml` / `ts-nocheck-ratchet.yml` — both about TypeScript enforcement, unclear boundary.
- **Security cluster:** `security.yml` / `security-invoker-gate.yml` — one about secrets/vulns, one about view permissions. Generic "Security" prefix hides their different focuses.
- **Migration cluster:** `migration-smoke-test.yml` / `migration-uniqueness.yml` — names are clear enough individually but `migration-uniqueness.yml` hides the "Gate" nature in the display name only.

---

### 🔵 Issue J — Recently Removed Orphaned Workflows

Two files listed in the earlier directory listing were removed before the audit:
- `fix-schema-refs.yml` — was named "Fix schema references (DISABLED — migration complete)". Good that it was removed.
- `gitleaks.yml` — this functionality was folded into `security.yml`. Good consolidation but the old file was left around until now.

The count went from 37 → 35 between directory listings during this session.

---

## 3. Summary Statistics

| Metric | Value |
|--------|-------|
| Total workflow files | 35 |
| Gate/Guard naming mismatch (name vs file) | 3 |
| All-lowercase display names | 2 |
| Emoji in display name | 5 |
| VPS suffix inconsistency | 5 |
| Language mixing (Portuguese/English) | 1 |
| Cryptic/opaque prefixes | 1 (E46) |
| Exact duplicate names | 0 |
| Files removed during audit | 2 |

## 4. Top 5 Recommendations (by impact)

1. **Standardize Gate/Guard** — Pick one concept per workflow, make filename and display name agree.
2. **Fix all-lowercase names** — `ratchet-tighten` and `schema-drift-guard` should use Title Case.
3. **Resolve CI workflow overlap** — `ci.yml` and `ci-gate.yml` appear to duplicate work; clarify or merge.
4. **Fix VPS naming** — Add `-vps` to filenames missing it (seed/validate/cleanup) or remove `(VPS)` from display names of those that have it.
5. **Clean up language and prefixes** — "Quinzenal" → English; "E46" → clear label or remove.
