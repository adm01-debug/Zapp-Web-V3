---
name: zapp-web-v3-conventions
description: Development conventions and patterns for zapp-web-v3. TypeScript project with conventional commits.
---

# Zapp Web V3 Conventions

> Generated from [adm01-debug/zapp-web-v3](https://github.com/adm01-debug/zapp-web-v3) on 2026-08-03

## Overview

This skill teaches Claude the development patterns and conventions used in zapp-web-v3.

## Tech Stack

- **Primary Language**: TypeScript
- **Architecture**: feature-based module organization
- **Test Location**: colocated
- **Test Framework**: vitest

## When to Use This Skill

Activate this skill when:
- Making changes to this repository
- Adding new features following established patterns
- Writing tests that match project conventions
- Creating commits with proper message format

## Commit Conventions

Follow these commit message conventions based on 66 analyzed commits.

### Commit Style: Conventional Commits

### Prefixes Used

- `fix`
- `feat`
- `docs`

### Message Guidelines

- Average message length: ~78 characters
- Keep first line concise and descriptive
- Use imperative mood ("Add feature" not "Added feature")


*Commit message example*

```text
fix(ci): add INV-1 exclusion for useRetryMetrics + clarify migration comment (M-4)
```

*Commit message example*

```text
docs(audit): merge PLANO_IMPLEMENTACAO — Blocos 1-6 detalhados + Bloco 7 completo (155 achados)
```

*Commit message example*

```text
security: R28f — workspace isolation and security fixes for 6 SECURITY DEFINER functions (#706)
```

*Commit message example*

```text
feat(db): M-9 — security corrections C1-C4 (fail-closed, degraded guard, evo→zapp policy)
```

*Commit message example*

```text
chore: F1-01 delete temp file, F1-02 add Python artifacts to .gitignore
```

*Commit message example*

```text
docs(qa): auditoria honesta dos blocos 1-2 — 45% das etapas ficaram parciais ou não feitas
```

*Commit message example*

```text
fix(db): M-5 — realtime publication: add 9 remaining gap tables to supabase_realtime
```

*Commit message example*

```text
fix(db): M-6 — add 16 remaining subscription tables to supabase_realtime
```

## Architecture

### Project Structure: Single Package

This project uses **feature-based** module organization.

### Source Layout

```
src/
├── features/
├── hooks/
├── lib/
├── pages/
├── test/
```

### Configuration Files

- `.github/workflows/db-invariants.yml`

### Guidelines

- Group related code by feature/domain
- Each feature folder should be self-contained
- Shared utilities go in a common/shared folder

## Code Style

### Language: TypeScript

### Naming Conventions

| Element | Convention |
|---------|------------|
| Files | snake_case |
| Functions | camelCase |
| Classes | PascalCase |
| Constants | SCREAMING_SNAKE_CASE |

### Import Style: Path Aliases (@/, ~/)

### Export Style: Named Exports


*Preferred import style*

```typescript
// Use path aliases for imports
import { Button } from '@/components/Button'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
```

*Preferred export style*

```typescript
// Use named exports
export function calculateTotal() { ... }
export const TAX_RATE = 0.1
export interface Order { ... }
```

## Testing

### Test Framework: vitest

### File Pattern: `*.test.ts`

### Test Types

- **Unit tests**: Test individual functions and components in isolation

### Mocking: vi.mock


*Test file structure*

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFunction', () => {
  it('should return expected result', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })
})
```

## Error Handling

### Error Handling Style: Error Boundaries

React **Error Boundaries** are used for graceful UI error handling.


## Common Workflows

These workflows were detected from analyzing commit patterns.

### Database Migration

Database schema changes with migration files

**Frequency**: ~25 times per month

**Steps**:
1. Create migration file
2. Update schema definitions
3. Generate/update types

**Files typically involved**:
- `migrations/*`

**Example commit sequence**:
```
fix(ci): add INV-1 exclusion for useRetryMetrics + clarify migration comment (M-4)
docs(audit): merge PLANO_IMPLEMENTACAO — Blocos 1-6 detalhados + Bloco 7 completo (155 achados)
docs(audit): RELATORIO_EXECUCAO_ANALISE — expandir Blocos 1-6 (155 achados listados, paridade com Bloco 7)
```

### Feature Development

Standard feature implementation workflow

**Frequency**: ~16 times per month

**Steps**:
1. Add feature implementation
2. Add tests for feature
3. Update documentation

**Files typically involved**:
- `src/features/admin/hooks/*`
- `src/features/inbox/hooks/*`
- `src/features/contacts/hooks/*`
- `**/api/**`

**Example commit sequence**:
```
fix(ci): add INV-1 exclusion for useRetryMetrics + clarify migration comment (M-4)
docs(audit): merge PLANO_IMPLEMENTACAO — Blocos 1-6 detalhados + Bloco 7 completo (155 achados)
docs(audit): RELATORIO_EXECUCAO_ANALISE — expandir Blocos 1-6 (155 achados listados, paridade com Bloco 7)
```


## Best Practices

Based on analysis of the codebase, follow these practices:

### Do

- Use conventional commit format (feat:, fix:, etc.)
- Keep feature code co-located in feature folders
- Write tests using vitest
- Follow *.test.ts naming pattern
- Use snake_case for file names
- Prefer named exports

### Don't

- Don't use long relative imports (use aliases)
- Don't write vague commit messages
- Don't skip tests for new features
- Don't deviate from established patterns without discussion

---

*This skill was auto-generated by [ECC Tools](https://ecc.tools). Review and customize as needed for your team.*
