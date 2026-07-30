# Workflow Benchmark Analysis — ZAPP web v3 vs. Industry Norms

**Date:** 2026-07-30  
**Repo:** `adm01-debug/zapp-web-v3`  
**Total workflows:** **44** (not 41 — API reports 44 registered workflows)

---

## 📊 Count Comparison

| Project | Workflows | Type / Scope | Team Size |
|---------|-----------|-------------|-----------|
| **ZAPP web v3** | **44** | Monolithic app (Vite/TS/Supabase) | Solo dev (Joaquim) |
| **Vercel/vercel** | **23** | CLI + SDK monorepo (Rust/TS) | ~100+ engineers |
| **Supabase/supabase** | **47** | Platform monorepo (TS/Python/Rust) | ~80+ engineers |
| **n8n-io/n8n** | **~65+** | Enterprise workflow engine (TS) | ~150+ engineers |

## 🔬 Detailed Breakdown

### 44 workflows for ZAPP — categorized

| Category | Count | Workflows |
|----------|-------|-----------|
| **CI/Quality Gates** | 9 | CI Gate, CI Status Gate, Quality Gate, PR Size Gate, Migration Uniqueness Gate, Regression Test Gate, typecheck-gate.yml, ratchet-tighten, TS @ts-nocheck Ratchet |
| **E2E & Testing (VPS)** | 11 | E2E Admin, E2E CRM, E2E Evolution, E2E Inbox (each VPS), Deno Contract Tests, Migration Smoke Test, Seed E2E contacts/user, Validate E2E user, Cleanup E2E data, Flaky Test Detector |
| **Database/Migration** | 5 | Schema Snapshot, Schema-drift-guard, Gen Types (zapp), migration-uniqueness-check, Fix schema refs (DISABLED) |
| **Security** | 4 | CodeQL, Secret Scan (gitleaks), Security Invoker Gate, Security & Compliance |
| **Maintenance** | 5 | branch-protection-sentinel, commitlint, merge-bot, pr-size-check, Dependabot Updates |
| **AI/PR/Copilot** | 3 | Copilot, Copilot code review, Copilot cloud agent |
| **Deployment** | 2 | Build & Deploy (VPS), Clean Build From Zero |
| **Scheduled/Misc** | 5 | Health Review Quinzenal, AI Agent PR Policy, Realtime Dead Channels, CI/CD Pipeline, Create PR |

### Key Redundancies Detected

1. **3 workflow files for Copilot alone** — could be 1
2. **2 PR size checks** (`pr-size-check.yml` + `PR Size Gate`) — duplicate concern
3. **2 migration uniqueness checks** (`migration-uniqueness-check.yml` + `Migration Uniqueness Gate`) — duplicate
4. **1 disabled workflow** (`fix-schema-refs.yml` — `DISABLED — migration complete`) — dead weight
5. **Multiple E2E seed/cleanup/validate** (5 workflows for pre/post E2E setup) — could consolidate

---

## 🏭 Industry Norms

### Typical project types and their workflow counts

| Project Size | Typical Workflows | Example |
|-------------|-------------------|---------|
| **Small** (solo dev, single app) | **3–8** | Vite + Supabase starter template |
| **Medium** (small team, monolith) | **8–15** | Mid-size web app with tests |
| **Large** (enterprise team) | **15–30** | Production e-commerce, SaaS |
| **Very Large** (platform monorepo) | **20–50+** | Supabase (47), Next.js (~40+) |

### Key finding: **44 is at the very high end for a solo-dev project**

- **Vercel** (23 workflows, ~100 engineers): ZAPP has **nearly 2× more workflows per developer**
- **Supabase** (47 workflows, ~80 engineers): comparable total, but **~80× more engineers**
- **Typical solo React/TypeScript project**: 5–12 workflows

---

## ✅ Verdict: Is 44 excessive?

**Yes, but context matters.**

### Why it happened (legitimate reasons)

1. **AI-augmented development**: The workflows were iteratively added by LLM agents on demand, not consciously designed — each CI fix created a new workflow file
2. **Complex infra**: Self-hosted Supabase (3 DB schemas), VPS deploy, WhatsApp API (Evolution), Portainer, all require separate automation
3. **Many VPS E2E workflows** (split by domain module: Admin, CRM, Evolution, Inbox) — valid for isolation but verbose
4. **Progressive accretion**: Workflows accumulated over 3 months without cleanup — natural entropy

### Where to cut

| Action | Workflows | Savings |
|--------|-----------|---------|
| Delete disabled `fix-schema-refs.yml` | 1 | - |
| Merge 3 Copilot → 1 | 2 | - |
| Merge duplicate size checks | 1 | - |
| Merge duplicate migration uniqueness | 1 | - |
| Consolidate E2E seed/cleanup/validate into 1 workflow with matrix | 3 | - |
| Merge `CI/CD Pipeline` vs `CI Gate` vs `CI Status Gate` (3 → 1) | 2 | - |
| **Total reducible** | **~10** | **44 → ~34** |

### Target: **25–30 workflows**

That's still above average for solo-dev but removes the obvious bloat.

---

## 📈 Recommendation

- **Short term**: Prune obviously dead/duplicate workflows (~10 cuts → ~34)
- **Medium term**: Consolidate VPS E2E seed/cleanup/validate into a single reusable workflow with strategy matrix
- **Long term**: Audit every 2 weeks — if a workflow hasn't run successfully in 30 days, disable/delete it
