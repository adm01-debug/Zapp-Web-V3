# GOD FILE DECOMPOSITION

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

Large files that are impossible to test:

| File | Size | Problem |
|------|------|---------|
| `useExternalApiManagement.ts` | 53 KB | Too large |
| `useEvolutionApiManagement.ts` | 50 KB | Too large |
| `useEmailManagement.ts` | 44 KB | Too large |
| `useAudioManagement.ts` | 36 KB | Too large |

---

## Solution: Decompose by Responsibility

### Before (God File)

```typescript
// useExternalApiManagement.ts (53 KB)
export function useExternalApiManagement() {
  // All functionality mixed together
  const [state, setState] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Evolution API
  const sendMessage = async () => { /* 200 lines */ };
  const getInstanceStatus = async () => { /* 100 lines */ };
  const createInstance = async () => { /* 150 lines */ };

  // Email
  const sendEmail = async () => { /* 100 lines */ };
  const getEmailStatus = async () => { /* 80 lines */ };

  // More...

  return { /* everything */ };
}
```

### After (Decomposed)

```
src/
├── features/
│   ├── evolution/
│   │   ├── useEvolutionApi.ts       # Core API
│   │   ├── useEvolutionInstance.ts   # Instance management
│   │   └── useEvolutionMessage.ts    # Message sending
│   ├── email/
│   │   ├── useEmailApi.ts           # Core API
│   │   ├── useEmailSend.ts          # Send operations
│   │   └── useEmailStatus.ts        # Status checking
│   └── shared/
│       ├── useApiClient.ts           # HTTP client
│       └── useApiError.ts            # Error handling
```

---

## Migration Steps

### Step 1: Identify Responsibilities

```typescript
// In useExternalApiManagement.ts, identify:
const responsibilities = [
  'Evolution API',
  'Email API',
  'Shared HTTP',
  'Error Handling',
  'State Management',
];
```

### Step 2: Extract to Modules

```typescript
// src/features/evolution/useEvolutionApi.ts
export function useEvolutionApi() {
  const client = useApiClient('evolution');

  const sendMessage = async (params: SendMessageParams) => {
    return client.post('/message/send', params);
  };

  // ... rest
}
```

### Step 3: Create Facade

```typescript
// src/hooks/useExternalApiManagement.ts
// DEPRECATED: Use individual feature hooks instead

import { useEvolutionApi } from '@/features/evolution/useEvolutionApi';
import { useEmailApi } from '@/features/email/useEmailApi';

export function useExternalApiManagement() {
  const evolution = useEvolutionApi();
  const email = useEmailApi();

  return {
    // Evolution
    sendMessage: evolution.sendMessage,
    getInstanceStatus: evolution.getInstanceStatus,

    // Email
    sendEmail: email.send,
    getEmailStatus: email.getStatus,
  };
}
```

---

## Size Limits

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Max lines per file | 500 | ESLint |
| Max file size | 15 KB | CI check |

```yaml
# ESLint rule
max-lines-per-file: [error, 500]
```

---

*Document Status: IN PROGRESS*
