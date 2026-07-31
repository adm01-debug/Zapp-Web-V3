# CODE QUALITY IMPROVEMENTS

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Issue 1: Module-Level Mutable State

### Problem

```typescript
// BAD: Module-level mutable state
let _discardedEventCount = 0;

export function useSomeFeature() {
  useEffect(() => {
    if (condition) {
      _discardedEventCount++; // Mutates global state
    }
  }, []);
}
```

### Solution

```typescript
// GOOD: Proper state management
export function useSomeFeature() {
  const [metrics, setMetrics] = useState({ discarded: 0 });

  useEffect(() => {
    if (condition) {
      setMetrics(prev => ({ ...prev, discarded: prev.discarded + 1 }));
    }
  }, []);

  return metrics;
}
```

---

## Issue 2: eslint-disable exhaustive-deps

### Problem

```typescript
// BAD: eslint-disable without justification
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  fetchData(params); // params destructured, not in deps
}, []);
```

### Solution

```typescript
// GOOD: Proper memoization
const params = useMemo(() => ({ id, type }), [id, type]);

useEffect(() => {
  fetchData(params);
}, [params]); // params is stable reference
```

---

## ESLint Rules

```json
// .eslintrc
{
  "rules": {
    "react-hooks/exhaustive-deps": "error",
    "no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

---

## Issue 3: Emoji Assets Optimization

### Problem

```
src/assets/emojis/
├── emoji1.png (175 KB)
├── emoji2.png (150 KB)
├── emoji3.png (120 KB)
...
Total: 1.5 MB of PNG files
```

### Solution

```typescript
// Option 1: Use emoji strings instead
const emoji = '😀'; // Zero bytes, native support

// Option 2: Convert to WebP
// 175 KB PNG → ~15 KB WebP (90% reduction)

// Option 3: Use CDN
// Serve from CDN instead of bundling
```

### Implementation

```typescript
// Replace imports
// Before
import happyEmoji from '@/assets/emojis/happy.png';

// After
const HAPPY_EMOJI = '😀'; // Native emoji

// Or use a CDN
const getEmojiUrl = (emoji: string) => 
  `https://cdn.example.com/emoji/${emoji}.webp`;
```

---

## Summary

| Issue | Fix | Priority |
|-------|-----|----------|
| Module mutable state | Use proper state | High |
| eslint-disable | Memoize properly | High |
| Emoji assets (1.5 MB) | Use native/CSS | Medium |

---

*Document Status: IN PROGRESS*
