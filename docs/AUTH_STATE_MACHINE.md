# AUTH BOOTSTRAP STATE MACHINE

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

19 commits adjusted auth timeout (8s→4s→fast-fail→optimistic). The code is:
- Timeouts stacked on each other
- No clear state transitions
- Hard to reason about

---

## Solution: State Machine

```typescript
// src/lib/authMachine.ts

type AuthState = 
  | 'idle'
  | 'booting'
  | 'authenticating'
  | 'authenticated'
  | 'anonymous'
  | 'offline'
  | 'error';

interface AuthContext {
  state: AuthState;
  user: User | null;
  error: Error | null;
  lastChecked: Date | null;
}

type AuthEvent =
  | { type: 'CHECK' }
  | { type: 'CHECK_SUCCESS'; user: User }
  | { type: 'CHECK_FAILED'; error: Error }
  | { type: 'GO_OFFLINE' }
  | { type: 'GO_ONLINE' }
  | { type: 'RESET' };

// State transitions
const authMachine: StateMachine<AuthState, AuthEvent, AuthContext> = {
  initial: 'idle',

  states: {
    idle: {
      on: { CHECK: 'booting' }
    },

    booting: {
      on: {
        CHECK_SUCCESS: 'authenticated',
        CHECK_FAILED: 'error',
        GO_OFFLINE: 'offline',
        TIMEOUT: 'anonymous'
      }
    },

    authenticated: {
      on: {
        CHECK: 'booting',
        GO_OFFLINE: 'offline'
      }
    },

    anonymous: {
      on: {
        CHECK: 'booting'
      }
    },

    offline: {
      on: {
        GO_ONLINE: 'booting'
      }
    },

    error: {
      on: {
        RESET: 'idle',
        CHECK: 'booting'
      }
    }
  }
};
```

---

## Hook Implementation

```typescript
// src/hooks/useAuthState.ts

export function useAuthState() {
  const [context, dispatch] = useReducer(authReducer, { state: 'idle' });

  const check = useCallback(async () => {
    dispatch({ type: 'CHECK' });

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        dispatch({ type: 'CHECK_SUCCESS', user });
      } else {
        dispatch({ type: 'CHECK_FAILED', error: new Error('No user') });
      }
    } catch (error) {
      dispatch({ type: 'CHECK_FAILED', error });
    }
  }, []);

  // ... rest of implementation
}
```

---

## State Diagram

```
     ┌───────┐
     │ idle  │
     └───┬───┘
         │ CHECK
         ▼
    ┌─────────┐
───►│ booting │
    └────┬────┘
         │
    ┌────┼────┬──────────┐
    ▼    ▼    ▼          ▼
┌────────┐    ┌─────┐  ┌──────────┐
│authen-│    │error│  │ anonymous│
│ticated│    └─────┘  └──────────┘
└────────┘
```

---

*Document Status: IN PROGRESS*
