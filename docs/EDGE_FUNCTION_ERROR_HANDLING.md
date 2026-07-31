# EDGE FUNCTIONS ERROR HANDLING

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

13 commits fixed error handling in Edge Functions one by one:
- `.ok` checks added
- JSON parsing secured
- `!` operator removed from env vars

---

## Solution: Unified Error Handler

```typescript
// supabase/functions/_shared/error-handler.ts

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function withErrorHandling<T>(
  handler: (req: Request) => Promise<T>
) {
  return async (req: Request): Promise<Response> => {
    try {
      const result = await handler(req);
      return Response.json(result);
    } catch (error) {
      console.error('Edge function error:', error);

      if (error instanceof ValidationError) {
        return Response.json(
          { error: { code: 'VALIDATION_ERROR', message: error.message } },
          { status: 400 }
        );
      }

      if (error instanceof AuthError) {
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: error.message } },
          { status: 401 }
        );
      }

      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 }
      );
    }
  };
}

// Safe JSON parsing
export function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Safe env var getter
export function getEnvVar(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
```

---

## Usage

```typescript
// Before
Deno.serve(async (req) => {
  const data = JSON.parse(await req.text()); // Can throw
  const apiKey = Deno.env.get('API_KEY')!; // Can be undefined

  const res = await fetch(url, { headers: { API_KEY: apiKey } });
  if (!res.ok) { /* handle error */ }

  return new Response(JSON.stringify({ success: true }));
});

// After
const handler = withErrorHandling(async (req) => {
  const data = safeJsonParse(await req.text());
  if (!data) throw new ValidationError('Invalid JSON');

  const apiKey = getEnvVar('API_KEY');
  const res = await fetch(url, { headers: { API_KEY: apiKey } });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  return { success: true };
});

Deno.serve(handler);
```

---

## Lint Rule

```typescript
// src/utils/eslint-rules/no-unsafe-env.ts
export const rule = {
  meta: {
    type: 'problem',
    fixable: 'code',
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === 'MemberExpression' &&
          node.object.object.type === 'Identifier' &&
          node.object.object.name === 'Deno' &&
          node.object.property.type === 'Identifier' &&
          node.object.property.name === 'env' &&
          node.property.type === 'Identifier' &&
          node.parent?.type !== 'CallExpression'
        ) {
          context.report({
            node,
            message: 'Use getEnvVar() instead of Deno.env.get()!',
          });
        }
      },
    };
  },
};
```

---

*Document Status: IN PROGRESS*
