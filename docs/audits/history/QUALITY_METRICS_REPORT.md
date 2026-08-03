# Code Quality Metrics Report — zapp-web-v3-fix

**Generated:** 2026-07-28  
**Scope:** `src/` + `supabase/functions/` (excluding `node_modules`, `.git`, `dist`)

---

## 1. Lines of Code per Module

| Module | LOC | Source Files |
|--------|----:|-------------:|
| `src/components` | 99,066 | 535 |
| `src/features` | 98,636 | 551 |
| `src/hooks` | 53,066 | 261 |
| `supabase/functions` | 42,128 | 179 |
| `src/lib` | 37,312 | 111 |
| `src/pages` | 26,316 | 149 |
| `src/integrations` | 13,926 | 27 |
| `src/services` | 4,659 | 41 |
| `src/utils` | 2,011 | 11 |
| `src/shared` | 1,782 | 3 |
| `src/types` | 1,477 | 9 |
| `src/adapters` | 1,560 | 3 |
| `src/data` | 923 | 1 |
| **TOTAL** | **~382,862** | **~1,881** |

### Top Sub-Modules by Size

| Sub-Module | LOC | Notes |
|-----------|----:|-------|
| `src/features/inbox` | 71,734 | Largest single module — 18.7% of codebase |
| `src/features/admin` | 14,892 | |
| `src/components/ui` | 10,256 | UI component library |
| `src/components/settings` | 9,956 | |
| `src/components/contacts` | 8,835 | |
| `src/components/team-chat` | 7,573 | |
| `src/components/dashboard` | 5,367 | |
| `supabase/functions/_shared` | 12,334 | Shared utilities for edge functions |
| `supabase/functions/ai-router` | 4,195 | Single huge function file |

---

## 2. Files >500 Lines (Refactoring Candidates)

**Count:** 40 files exceed 500 lines (excluding test files that were legitimately long).

### Top 15 Heaviest Production Files

| File | LOC | Risk |
|------|----:|------|
| `src/integrations/supabase/types.ts` | 9,407 | **Auto-generated** DB types — exempt |
| `supabase/functions/ai-router/index.ts` | 4,195 | 🚨 Critical — massive monolithic router |
| `src/hooks/useEvolutionApiManagement.ts` | 1,609 | 🟡 Large hook |
| `src/features/admin/hooks/useAdminManagement.ts` | 1,270 | 🟡 Large hook |
| `src/hooks/useEmailManagement.ts` | 1,231 | 🟡 Large hook |
| `src/hooks/useAudioManagement.ts` | 1,161 | 🟡 Large hook |
| `src/hooks/useExternalApiManagement.ts` | 1,144 | 🟡 Large hook |
| `src/lib/realtime/crossTabDedupe.ts` | 953 | 🟡 Complex realtime logic |
| `src/features/inbox/components/chat/ChatInputArea.tsx` | 844 | 🟡 Chat UI component |
| `src/features/dashboard/hooks/useDashboardVisualizationManagement.ts` | 827 | 🟡 Large hook |
| `src/hooks/useExternalEvolution.ts` | 826 | 🟡 Large hook |
| `src/components/team-chat/TeamChatPanel.tsx` | 814 | 🟡 Component |
| `src/pages/admin/AdminAutomationsPage.tsx` | 790 | 🟡 Page component |
| `src/pages/admin/Connections.tsx` | 777 | 🟡 Page component |
| `src/features/inbox/hooks/useInboxFilters.ts` | 723 | 🟡 Hook |

---

## 3. Files with >10 Imports (High Coupling)

**Count:** 282 files have >10 import statements.

### Top 15 Most Coupled Files

| File | Import Count |
|------|------------:|
| `src/features/inbox/components/ChatPanel.tsx` | 50 |
| `src/components/connections/ConnectionsView.tsx` | 33 |
| `src/features/inbox/components/chat/useChatPanel.ts` | 32 |
| `src/features/inbox/components/contact-details/ContactAccordionSections.tsx` | 31 |
| `src/components/settings/SettingsView.tsx` | 30 |
| `src/features/admin/components/AdminView.tsx` | 29 |
| `src/components/dashboard/DashboardView.tsx` | 29 |
| `src/components/team-chat/TeamChatPanel.tsx` | 28 |
| `src/hooks/useExternalApiManagement.ts` | 27 |
| `src/features/inbox/components/RealtimeInboxView.tsx` | 26 |
| `src/features/inbox/components/chat/ChatInputArea.tsx` | 26 |
| `src/features/inbox/components/ConversationListSidebar.tsx` | 25 |
| `src/pages/admin/RateLimitDashboard.tsx` | 23 |
| `src/features/inbox/components/chat/ChatInputToolbars.tsx` | 22 |
| `src/components/team-chat/TeamChatInputArea.tsx` | 22 |

---

## 4. Duplicate Code Blocks (≥10 Identical Non-Comment Lines)

**Cross-file duplicate blocks:** 3,027

### Files With Most Duplicate Blocks

| File | Duplicate Blocks |
|------|----------------:|
| `src/hooks/useEmailManagement.ts` | 563 |
| `src/hooks/useEmail.ts` | 355 |
| `src/hooks/useExternalEvolution.ts` | 276 |
| `src/pages/admin/AdminAutomationsPage.tsx` | 264 |
| `src/hooks/useExternalApiManagement.ts` | 260 |
| `src/features/inbox/components/conversation-list/ConversationItem.tsx` | 210 |

### Worst Cross-File Duplication Clusters

- **8 files** share identical blocks: SLA dashboard, HMAC audit, Ops logs/metrics, Evolution API logs, Admin alert history — these share 4+ consecutive identical blocks suggesting copy-paste of entire sections.
- **7 files** (`ai-*` edge functions) share ~20 identical consecutive blocks — all AI functions duplicate setup boilerplate (auth, CORS, Supabase client init).
- **6 files** share identical blocks between `ConversationItem`, `ConversationItemCompact`, `ConversationItemComfortable` — these are variant components with substantial copy-paste.
- **5 files** across `voice-changer`, `audio-meme`, `text-to-audio` components share identical UI helper blocks.

---

## 5. TODO/FIXME/HACK Comments

| Marker | Count | Severity |
|--------|------:|----------|
| `TODO` | 23 | Medium |
| `FIXME` | 0 | None found |
| `HACK` | 0 | None found |
| `XXX` | 7 | Low (mostly inline notes) |

### Notable TODOs

- `src/lib/types/branded.ts:29` — Branded types (`Jid`, `Uuid`) marked for "Phase 2" tightening with opaque types
- `src/features/inbox/components/team-chat/__tests__/team-chat-exhaustive-audit.test.ts` — Several skipped tests with TODO annotations awaiting refactors
- `src/integrations/supabase/schema.ts` — Comment instructing all code to import from schema types (migration in progress)

---

## 6. Console.log Statements

**Total console.log outside test/util files:** 252

### Top Offenders

| File | Console.log Count |
|------|------------------:|
| `scripts/validate-all-fixes-exhaustive.ts` | 21 |
| `scripts/run-200-simulations.ts` | 20 |
| `scripts/validate-auth-webhook-realtime.ts` | 17 |
| `scripts/validate-rls-policies.ts` | 16 |
| `scripts/validate-query-performance.ts` | 13 |
| `scripts/stress-test.ts` | 13 |
| `scripts/generate-coverage-report.ts` | 13 |
| `scripts/stress-test-200.ts` | 12 |
| `scripts/validate-qa-fixes.ts` | 11 |
| `scripts/test-realtime-websocket.ts` | 11 |
| `supabase/functions/_test/integration-tests.ts` | 10 |
| `supabase/functions/_shared/evolution-webhook-handlers.ts` | 7 |

**Assessment:** Most console.log usage is in scripts — which is acceptable. However, 7 instances in `supabase/functions/_shared/evolution-webhook-handlers.ts` are production edge function code that should use structured logging.

---

## 7. Test Coverage Ratio

### Per-Module Test Ratios

| Module | Source Files | Test Files | Ratio |
|--------|-------------:|-----------:|------:|
| `src/utils` | 11 | 11 | **100.0%** |
| `src/lib` | 111 | 99 | **89.2%** |
| `src/hooks` | 261 | 114 | 43.7% |
| `supabase/functions` | 179 | 51 | 28.5% |
| `src/features` | 551 | 79 | 14.3% |
| `src/integrations` | 27 | 4 | 14.8% |
| `src/components` | 535 | 68 | 12.7% |
| `src/services` | 41 | 2 | 4.9% |
| `src/pages` | 149 | 2 | **1.3%** |
| `src/types` | 9 | 0 | **0.0%** |
| **TOTAL** | **1,881** | **384** | **20.3%** |

### Critical Gaps

- **`src/pages`**: Only 2 test files for 149 source files (1.3%) — pages are almost entirely untested
- **`src/components`**: 12.7% coverage — UI components have minimal test coverage
- **`src/services`**: 4.9% coverage — service layer largely untested
- **`src/features`**: 14.3% — feature-level code has sparse tests

---

## 8. Deprecated Patterns

| Pattern | Count | Notes |
|---------|------:|-------|
| Class components (`extends Component`) | 8 | 6 are legit (ErrorBoundary × 2, UI primitives × 4 wrapper types). Only 2 real class components: `ErrorBoundary`, `SectionErrorBoundary`, `ErrorBoundaryWithRetry` |
| `var` declarations | 27 | Mostly in edge functions (`supabase/functions/mcp/index.ts` — 5 vars), some false positives in comments/strings |
| `==` (non-strict equality) | 28 | Mostly `x == null` pattern (accepted idiom for null+undefined checks). A few genuine `==` comparisons in `evolution-webhook`, `email-track-pixel` |

**Assessment:** The codebase generally follows modern patterns. Class components are limited to error boundaries (acceptable). The `== null` pattern is intentional and standard. No pattern indicates systemic tech debt from deprecated syntax.

---

## Summary Dashboard

| Metric | Value | Risk |
|--------|-------|------|
| Total LOC | ~383K | — |
| Files >500 LOC | 40 | 🟡 |
| Files >10 imports | 282 | 🟡 |
| Cross-file duplicate blocks | 3,027 | 🔴 |
| Active TODOs | 23 | 🟢 |
| Console.log in production code | ~7 prod + ~245 scripts | 🟢 |
| Overall test ratio | 20.3% | 🔴 |
| Class components | 2 real | 🟢 |
| `var` usage | 27 (mostly edge fn) | 🟡 |
| `==` strictness violations | ~28 (mostly `== null`) | 🟢 |

### Top 3 Action Items

1. **Deduplicate AI edge functions** — 7+ AI functions copy identical 50+ line boilerplate blocks (auth, CORS, Supabase client). Extract to `_shared/ai-setup.ts`.
2. **Split `ai-router/index.ts` (4,195 lines)** — The largest production file is a monolith that repeats the same dispatch patterns 6+ times internally.
3. **Split oversized hooks** — `useEvolutionApiManagement`, `useAdminManagement`, `useEmailManagement`, `useAudioManagement`, `useExternalApiManagement` all exceed 1,100 lines. Extract into composable sub-hooks.
