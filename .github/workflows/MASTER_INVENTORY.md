# Master Inventory — All GitHub Workflows

> **Generated:** 2026-07-30
> **Scope:** All `.github/workflows/*.yml` files across all local repos
> **Total: 69 workflow files** across 6 repo directories

---

## 1. Desktop/zapp-web-v3 (main working copy) — 34 workflows

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | ai-agent-pr-policy.yml | AI Agent PR Policy | pull_request, workflow_dispatch | 1 | 2 |
| 2 | branch-protection-sentinel.yml | Branch Protection Sentinel | pull_request, schedule, workflow_dispatch | 2 | 4 |
| 3 | check-realtime-dead-channels.yml | Guard — Realtime Dead Channels | pull_request, push | 1 | 4 |
| 4 | ci-gate.yml | CI Gate | push, pull_request | 1 | 12 |
| 5 | ci-status-gate.yml | CI Status Gate | push, pull_request, workflow_dispatch | 1 | 1 |
| 6 | ci.yml | CI/CD Pipeline | push, pull_request | 7 | 44 |
| 7 | clean-build.yml | Clean Build From Zero | schedule, workflow_dispatch | 1 | 9 |
| 8 | cleanup-e2e-data.yml | Cleanup E2E data (VPS) | workflow_dispatch, workflow_call, schedule | 1 | 4 |
| 9 | codeql.yml | CodeQL | push, pull_request, schedule | 1 | 4 |
| 10 | create-pr.yml | Create PR | workflow_call | 1 | 5 |
| 11 | deno-contract-tests.yml | 🦕 Deno Contract Tests — Edge Functions | push, pull_request | 1 | 4 |
| 12 | deploy-vps.yml | 🚀 Build & Deploy — ZAPP web v3 | push, workflow_dispatch | 2 | 7 |
| 13 | e2e-admin-vps.yml | E2E Admin (VPS) | workflow_dispatch | 2 | 11 |
| 14 | e2e-crm-vps.yml | E2E CRM (VPS) | pull_request, workflow_dispatch | 4 | 12 |
| 15 | e2e-evolution-vps.yml | E2E Evolution (VPS) | workflow_dispatch | 2 | 11 |
| 16 | e2e-inbox-vps.yml | E2E Inbox (VPS) | pull_request, workflow_dispatch, schedule | 4 | 12 |
| 17 | flaky-test-detector.yml | Flaky Test Detector | schedule, workflow_dispatch | 1 | 7 |
| 18 | gen-types-zapp.yml | 🗂️ Generate Supabase Types (zapp) | schedule, workflow_dispatch | 1 | 4 |
| 19 | health-review.yml | Health Review Quinzenal | pull_request, schedule, workflow_dispatch | 2 | 4 |
| 20 | migration-smoke-test.yml | Migration Smoke Test | pull_request, push | 1 | 8 |
| 21 | migration-uniqueness.yml | Migration Uniqueness Gate | pull_request, push | 1 | 2 |
| 22 | pr-size-gate.yml | PR Size Gate | pull_request | 1 | 1 |
| 23 | quality-gate.yml | Quality Gate | push, pull_request | 1 | 22 |
| 24 | ratchet-tighten.yml | ratchet-tighten | push | 1 | 2 |
| 25 | regenerate-graph.yml | 🕸️ Regenerate Knowledge Graph (Graphify) | schedule, workflow_dispatch, push | 1 | 6 |
| 26 | regression-test-gate.yml | E46 — Regression Test Gate | pull_request | 1 | 3 |
| 27 | schema-drift.yml | schema-drift-guard | pull_request, push, workflow_dispatch | 2 | 5 |
| 28 | schema-snapshot.yml | 📸 Schema Snapshot | schedule, workflow_dispatch | 1 | 3 |
| 29 | security-invoker-gate.yml | Guard — Security Invoker | pull_request, schedule | 1 | 3 |
| 30 | security.yml | Security & Compliance | push, pull_request, schedule, workflow_dispatch | 2 | 7 |
| 31 | seed-e2e-contacts.yml | Seed E2E contacts (VPS) | workflow_dispatch, workflow_call | 1 | 7 |
| 32 | seed-e2e-user.yml | Seed E2E user (VPS) | workflow_dispatch, workflow_call | 1 | 8 |
| 33 | typecheck-gate.yml | Typecheck Gate | push, pull_request | 1 | 7 |
| 34 | validate-e2e-user.yml | Validate E2E user (VPS) | workflow_dispatch, workflow_call | 1 | 4 |

## 2. repos/zapp-web-v3 (original clean copy) — 16 workflows

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | apply-chatpanel-fixes.yml | Apply ChatPanel Fixes | workflow_dispatch | 1 | 3 |
| 2 | apply-types-patch.yml | Apply types.ts patch (whatsapp_connections) | workflow_dispatch | 1 | 6 |
| 3 | branch-protection-sentinel.yml | Branch Protection Sentinel | pull_request | 1 | 3 |
| 4 | check-realtime-dead-channels.yml | Guard — Realtime Dead Channels | pull_request, push | 1 | 4 |
| 5 | ci.yml | CI/CD Pipeline | push, pull_request | 7 | 38 |
| 6 | codeql.yml | CodeQL | push, pull_request, schedule | 1 | 4 |
| 7 | deno-contract-tests.yml | Deno Contract Tests | push, pull_request | 1 | 7 |
| 8 | deploy-vps.yml | Deploy VPS | workflow_dispatch | 2 | 6 |
| 9 | fix-schema-refs.yml | Fix schema references | workflow_dispatch | 1 | 3 |
| 10 | gen-types-zapp.yml | Regenerate Supabase types (zapp + evo) | workflow_dispatch | 1 | 10 |
| 11 | quality-gate.yml | Quality Gate | push, pull_request | 1 | 18 |
| 12 | ratchet-tighten.yml | ratchet-tighten | push | 1 | 2 |
| 13 | schema-drift.yml | schema-drift-guard (manual) | workflow_dispatch | 1 | 3 |
| 14 | schema-snapshot.yml | schema-snapshot | push, workflow_dispatch | 1 | 9 |
| 15 | security-invoker-gate.yml | Guard — Security Invoker | pull_request, schedule | 1 | 3 |
| 16 | security.yml | Security & Compliance | push, pull_request, schedule, workflow_dispatch | 2 | 7 |

## 3. departamento-pessoal-v2 — 5 workflows

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | branch-protection.yml | Protect Main Branch | workflow_dispatch | 1 | 1 |
| 2 | ci.yml | Continuous Integration & Delivery | workflow_dispatch, push, pull_request | 4 | 16 |
| 3 | deploy.yml | Manual & Preview Deploy | workflow_dispatch, pull_request | 1 | 6 |
| 4 | e2e.yml | E2E Tests (Playwright) | pull_request, push | 1 | 10 |
| 5 | security.yml | Security Scan & Code Quality | workflow_dispatch, push, pull_request, schedule | 1 | 6 |

## 4. Fator-X-V2 — 3 workflows

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | ci.yml | Nexus CI | push, pull_request | 9 | 47 |
| 2 | codeql.yml | CodeQL | push, pull_request, schedule | 1 | 4 |
| 3 | release-drafter.yml | release-drafter | push, pull_request | 1 | 1 |

## 5. promo-champions-v2.1 — 10 workflows

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | codeql.yml | CodeQL Security Analysis | workflow_dispatch, schedule | 1 | 3 |
| 2 | cron-monitoring.yml | Cron Monitoring Regression | pull_request, push, schedule, workflow_dispatch | 1 | 5 |
| 3 | edge-functions-bundle.yml | Edge Functions Bundle Check | push, pull_request | 1 | 6 |
| 4 | edge-functions-request-id.yml | Edge Functions X-Request-Id Lint | push, pull_request | 1 | 4 |
| 5 | enterprise-quality.yml | Enterprise Quality Assurance | push, pull_request | 2 | 15 |
| 6 | generate-audit-pdf.yml | Generate Audit PDF | push, workflow_dispatch | 1 | 4 |
| 7 | lint.yml | CI | push, pull_request | 1 | 8 |
| 8 | pr-checks.yml | PR Checks | pull_request | 6 | 30 |
| 9 | qa-exhaustive.yml | QA Exhaustive (Weekly) | schedule, workflow_dispatch | 1 | 20 |
| 10 | quote-to-sale-e2e.yml | Quote-to-Sale Guard Rails | pull_request, workflow_dispatch | 3 | 15 |

## 6. supabase-full-mcp-server — 1 workflow

| # | File | Name | Trigger(s) | Jobs | Steps |
|---|------|------|-----------|------|-------|
| 1 | ci.yml | CI | push, pull_request | 2 | 15 |

---

## Grand Totals

| Repository | Workflows | Jobs | Steps |
|------------|-----------|------|-------|
| Desktop/zapp-web-v3 | 34 | 53 | 249 |
| repos/zapp-web-v3 | 16 | 24 | 126 |
| departamento-pessoal-v2 | 5 | 8 | 39 |
| Fator-X-V2 | 3 | 11 | 52 |
| promo-champions-v2.1 | 10 | 18 | 110 |
| supabase-full-mcp-server | 1 | 2 | 15 |
| **TOTAL** | **69** | **116** | **591** |

## Trigger Distribution (across all repos)

| Trigger | Count |
|---------|-------|
| pull_request | 41 |
| workflow_dispatch | 41 |
| push | 37 |
| schedule | 22 |
| workflow_call | 5 |

## Notes

- **Desktop/zapp-web-v3** is the main working copy (heavily modified from repos copy)
- **repos/zapp-web-v3** is the original/clean copy; 3 unique files not in Desktop: `apply-chatpanel-fixes.yml`, `apply-types-patch.yml`, `fix-schema-refs.yml`
- Files `fix-schema-refs.yml` and `gitleaks.yml` that appeared in earlier `ls -la` listings were since deleted from Desktop
- Files `ts-nocheck-ratchet.yml` and `gitleaks.yml` were present earlier and then removed
