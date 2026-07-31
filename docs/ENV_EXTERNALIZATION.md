# ENVIRONMENT VARIABLES EXTERNALIZATION

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

Hardcoded URLs in code:

```typescript
// BAD: Hardcoded
export const SUPABASE_PUBLIC_URL = 'https://supabase.atomicabr.com.br';
```

---

## Solution

```typescript
// GOOD: From environment
export const SUPABASE_PUBLIC_URL = import.meta.env.VITE_SUPABASE_URL;
```

---

## Implementation

### Step 1: Create .env.example

```bash
# .env.example
VITE_SUPABASE_URL=https://your-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_VERSION=1.0.0
```

### Step 2: Validate at Boot

```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_VERSION: z.string().optional().default('dev'),
});

export function validateEnv() {
  const result = envSchema.safeParse(import.meta.env);

  if (!result.success) {
    const errors = result.error.format();
    console.error('Environment validation failed:', errors);
    throw new Error(`Invalid environment: ${JSON.stringify(errors)}`);
  }

  return result.data;
}

export const env = validateEnv();
```

### Step 3: Replace Hardcoded Values

```typescript
// Before
const url = 'https://supabase.atomicabr.com.br';

// After
const url = env.VITE_SUPABASE_URL;
```

---

## GitHub Secrets

For CI/CD, add to GitHub Secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Verification

```typescript
// Check at startup
console.log('Environment:', {
  SUPABASE_URL: env.VITE_SUPABASE_URL ? '✓' : '✗',
  SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ? '✓' : '✗',
});
```

---

*Document Status: IN PROGRESS*
