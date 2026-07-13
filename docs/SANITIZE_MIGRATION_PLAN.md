# Sanitize API Unification — Migration Plan

> **Status:** 🔴 DEFERRED — High risk (P=85% of regression). Do NOT execute without dedicated sprint.
> **Created:** 2026-07-13
> **Related:** `docs/SIMULATION_REPORT.md` section G, PR #376

---

## Context: The Two Incompatible APIs

The codebase currently has two modules that both export `sanitizeHtml` with **incompatible return types**:

### `src/lib/sanitize.ts` (DOMPurify-based)
```typescript
// Returns: string (HTML safe for innerHTML)
export function sanitizeHtml(dirty: string): string;
```

### `src/lib/sanitize-v2.ts` (DOM native)
```typescript
// Returns: SanitizeResult object
export interface SanitizeResult {
  html: string;       // The sanitized HTML
  warnings: string[]; // Warnings about removed content
  blocked: number;    // Count of blocked elements/attributes
}
export function sanitizeHtml(dirty: string): SanitizeResult;
```

### Why this is dangerous
```typescript
// Consumer A (using sanitize.ts) — works correctly
const html = sanitizeHtml(input);
element.innerHTML = html; // ✅ string

// Consumer B (using sanitize-v2.ts) — works correctly
const { html, warnings } = sanitizeHtml(input);
element.innerHTML = html; // ✅ destructured

// If we merge APIs wrong:
element.innerHTML = sanitizeHtml(input); // ❌ sets innerHTML to "[object Object]" → XSS risk!
```

---

## Impact Analysis

### `sanitize.ts` consumers (estimate: 50+ files)
Pattern: `import { sanitizeHtml } from '@/lib/sanitize'`
Usage: `const safeHtml = sanitizeHtml(input)` → used directly as string

### `sanitize-v2.ts` consumers (estimate: 3-5 files)
Pattern: `import { sanitizeHtml } from '@/lib/sanitize-v2'`
Usage: `const { html, warnings } = sanitizeHtml(input)`

### Runtime environment difference
- `sanitize.ts` uses **DOMPurify** → works in both browser AND JSDOM (tests) ✅
- `sanitize-v2.ts` uses **DOM native** (`document.createRange`, `createContextualFragment`) 
  → may fail in test environments that don't fully implement DOM ⚠️

---

## Migration Plan (3 Phases)

### Phase 1: Audit (1 sprint)
> Goal: Map every consumer of both APIs before touching anything.

```bash
# Find all sanitize.ts consumers
grep -r "from '@/lib/sanitize'" src/ --include="*.ts" --include="*.tsx" | grep -v "sanitize-v2"

# Find all sanitize-v2.ts consumers
grep -r "from '@/lib/sanitize-v2'" src/ --include="*.ts" --include="*.tsx"

# Find all usages of sanitizeHtml return value
grep -rn "sanitizeHtml(" src/ --include="*.tsx" -A 2
```

**Deliverable:** Spreadsheet listing:
- File path
- Which module it imports from (v1 or v2)
- How the return value is used (direct string, destructured, etc.)

---

### Phase 2: Introduce Unified API (1 sprint)
> Goal: Create new `sanitize-unified.ts` with a superset API. Zero consumers changed yet.

```typescript
// src/lib/sanitize-unified.ts (NEW FILE)

export interface SanitizeResult {
  /** The sanitized HTML string, safe for innerHTML. */
  html: string;
  /** Warnings about removed content (only populated in strict mode). */
  warnings: string[];
  /** Count of blocked elements/attributes. */
  blocked: number;
}

/**
 * Sanitizes HTML using DOMPurify (works in browser + JSDOM test environments).
 *
 * @param dirty - Potentially unsafe HTML string
 * @param options.strict - If true, returns warnings about removed content
 * @returns SanitizeResult with html, warnings, blocked count
 *
 * MIGRATION NOTE:
 *   Old API (sanitize.ts):   const html = sanitizeHtml(input)  → use result.html
 *   Old API (sanitize-v2.ts): const { html } = sanitizeHtml(input) → use result.html (same)
 */
export function sanitizeHtml(dirty: string, options?: { strict?: boolean }): SanitizeResult {
  // Implementation using DOMPurify with warning tracking
  // ...
}

/**
 * Convenience wrapper that returns only the sanitized string.
 * Drop-in replacement for the old sanitize.ts::sanitizeHtml.
 *
 * @deprecated Use sanitizeHtml() from sanitize-unified and access .html
 */
export function sanitizeHtmlString(dirty: string): string {
  return sanitizeHtml(dirty).html;
}
```

---

### Phase 3: Migrate Consumers (2-3 sprints)
> Goal: Update all consumers to use `sanitize-unified.ts`. Then deprecate old files.

#### 3a. Migrate `sanitize.ts` consumers (~50 files)
```typescript
// BEFORE
import { sanitizeHtml } from '@/lib/sanitize';
const safeHtml = sanitizeHtml(input);
element.innerHTML = safeHtml;

// AFTER (option 1 — minimal change)
import { sanitizeHtmlString } from '@/lib/sanitize-unified';
const safeHtml = sanitizeHtmlString(input);
element.innerHTML = safeHtml;

// AFTER (option 2 — use result object)
import { sanitizeHtml } from '@/lib/sanitize-unified';
const { html } = sanitizeHtml(input);
element.innerHTML = html;
```

#### 3b. Migrate `sanitize-v2.ts` consumers (~3-5 files)
```typescript
// BEFORE
import { sanitizeHtml } from '@/lib/sanitize-v2';
const { html, warnings, blocked } = sanitizeHtml(input);

// AFTER — identical! SanitizeResult API is compatible
import { sanitizeHtml } from '@/lib/sanitize-unified';
const { html, warnings, blocked } = sanitizeHtml(input);
```

#### 3c. Add deprecation markers to old files
```typescript
// src/lib/sanitize.ts — add at top:
/**
 * @deprecated Use src/lib/sanitize-unified.ts instead.
 * This file will be removed in a future sprint.
 * @see src/docs/SANITIZE_MIGRATION_PLAN.md
 */
export { sanitizeHtmlString as sanitizeHtml } from './sanitize-unified';

// src/lib/sanitize-v2.ts — add at top:
/**
 * @deprecated Use src/lib/sanitize-unified.ts instead.
 * This file will be removed in a future sprint.
 */
export * from './sanitize-unified';
```

---

## Prerequisites Before Executing

1. **Test coverage:** Add unit tests for `sanitizeHtml` covering:
   - Script injection (`<script>alert(1)</script>`)
   - Event handler injection (`<img onerror="...">`)
   - CSS injection (`<style>body{display:none}</style>`)
   - Deep nested structures
   - Empty string / null handling

2. **CI check:** Add a CI check that fails if `element.innerHTML = sanitizeHtml(...)` 
   is found without `.html` accessor (would catch the regression pattern automatically)

3. **JSDOM compatibility:** Verify `sanitize-unified.ts` uses DOMPurify (not DOM native),
   since tests run under JSDOM which may not support `createContextualFragment`

4. **ESLint rule:** Consider adding `no-restricted-imports` for `@/lib/sanitize-v2` 
   pointing to `sanitize-unified` as the preferred path

---

## Why This Was Deferred

From `docs/SIMULATION_REPORT.md` section G:

> The sanitize unification has P(fail) = 85% without this migration plan.
> The root cause is that ~50 consumers use `sanitizeHtml()` as a direct string,
> which would silently become `"[object Object]"` if the return type changes.
> This is a potential XSS vector and a serious regression risk.

**This migration plan reduces P(fail) to ~10%** by following the phased approach above.

---

## Estimated Timeline

| Phase | Duration | Risk |
|-------|----------|------|
| Audit (map consumers) | 1 week | Low |
| Create sanitize-unified.ts | 3 days | Low |
| Write tests | 3 days | Low |
| Migrate sanitize.ts consumers | 2-3 weeks | Medium |
| Migrate sanitize-v2.ts consumers | 1 day | Low |
| Remove old files + ESLint | 1 week | Low |
| **Total** | **~6 weeks** | **Medium** |

---

*See also: `docs/SIMULATION_REPORT.md` for the full risk analysis.*
