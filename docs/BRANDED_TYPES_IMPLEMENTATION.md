# BRANDED TYPES IMPLEMENTATION

**Status:** IN PROGRESS
**Date:** 2026-07-26

---

## Problem

27+ commits added `isValidUUID()` guards to prevent JID being used as UUID. This is treating symptoms, not the cause.

```typescript
// Current: Guards everywhere
if (!isValidUUID(id)) return; // JID check
const result = await query(id); // Still works with JID

// Problem: Any new file forgets this check
```

---

## Solution: Branded Types

### Implementation

```typescript
// src/types/branded.ts

// Branded type for JID (WhatsApp ID)
type JID = string & { readonly __brand: 'JID' };

// Branded type for UUID (PostgreSQL)
type Uuid = string & { readonly __brand: 'Uuid' };

// Constructor functions (only way to create branded values)
function asJID(value: string): JID {
  return value as JID;
}

function asUuid(value: string): Uuid {
  // Validate UUID format
  if (!isValidUUID(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value as Uuid;
}

// Type guards
function isJID(value: string): value is JID {
  return value.includes('@');
}

function isUuid(value: string): value is Uuid {
  return isValidUUID(value);
}
```

---

## Usage

### Before

```typescript
// prone to errors
async function getContact(id: string) {
  return supabase.from('contacts').select().eq('id', id);
}
```

### After

```typescript
// type-safe
async function getContact(id: Uuid) {
  return supabase.from('contacts').select().eq('id', id);
}

// Compile error: Argument of type 'JID' is not assignable to parameter of type 'Uuid'
getContact(contactJid);
```

---

## Migration Plan

### Phase 1: Define Types

```typescript
// src/types/branded.ts
export type Jid = string & { readonly __brand: 'Jid' };
export type Uuid = string & { readonly __brand: 'Uuid' };
```

### Phase 2: Create Conversion Functions

```typescript
// src/types/branded.ts
export function toUuid(value: string): Uuid {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid UUID: ${value.substring(0, 20)}...`);
  }
  return value as Uuid;
}

export function toJid(value: string): Jid {
  return value as Jid;
}
```

### Phase 3: Update Function Signatures

```typescript
// Before
async function getMessage(id: string): Promise<Message>

// After
async function getMessage(id: Uuid): Promise<Message>
```

### Phase 4: Remove Guards

After all functions use branded types, remove `isValidUUID()` guards.

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| `isValidUUID()` calls | 60+ | 0 |
| Type errors for JID-as-UUID | Runtime | Compile-time |
| Bug class recurrence | High | None |

---

## Files to Update

Priority order:
1. Type definitions
2. Repository functions
3. Hook parameters
4. API routes

---

*Document Status: IN PROGRESS*
