# Service Layer Pattern Guide

## Overview

This guide explains the standardized service layer pattern used in this application. The pattern consists of three layers:

1. **Repository** - Direct data access to Supabase
2. **Service** - Business logic and validation
3. **Hooks** - React integration (queries and mutations)

## Architecture

```
Components/Pages
      ↓
   Hooks (useContactsList, useCreateContact)
      ↓
Factories (createListQuery, createCreateMutation)
      ↓
   Service (contactsService)
      ↓
Repository (contactsRepository)
      ↓
  Supabase
```

## Layer Responsibilities

### 1. Repository Layer (`contactsRepository.ts`)

**Responsibility**: Direct data access. ONLY talks to Supabase.

**Rules**:
- No business logic
- No validation
- No dependencies on other services
- Can be easily mocked for testing

**Example**:
```typescript
export const contactsRepository = {
  list: async (filters?) => { /* Supabase query */ },
  create: async (contact) => { /* Supabase insert */ },
  update: async (id, updates) => { /* Supabase update */ },
  delete: async (id) => { /* Supabase delete */ },
};
```

### 2. Service Layer (`contactsService.ts`)

**Responsibility**: Business logic and validation.

**Rules**:
- Calls repository for data
- Validates inputs
- Applies business rules
- Transforms data if needed
- Throws meaningful errors

**Example**:
```typescript
export const contactsService = {
  create: async (contact) => {
    // Validation
    if (!contact.name) throw new Error('Name required');
    if (!isValidEmail(contact.email)) throw new Error('Invalid email');
    
    // Business logic
    const created = await contactsRepository.create({
      ...contact,
      name: contact.name.trim(),
    });
    
    return created;
  },
};
```

### 3. Hooks Layer (`useContactsQueries.ts`, `useContactsMutations.ts`)

**Responsibility**: React Query integration. Caching, invalidation, UI state.

**Rules**:
- Uses factories for consistency
- Calls service, not repository
- Manages query/mutation state
- Handles cache invalidation
- Returns React Query hooks

**Example - Queries**:
```typescript
export const useContactsList = (filters?) => {
  return createListQuery(
    queryKeys.contacts.list(filters),
    () => contactsService.list(filters),
    { staleTime: 30_000 }
  );
};
```

**Example - Mutations**:
```typescript
export const useCreateContact = () => {
  return createCreateMutation(
    (contact) => contactsService.create(contact),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contact created!',
    }
  );
};
```

## Usage in Components

### Bad ❌ (Before)
```typescript
function ContactList() {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    supabase
      .from('contacts')
      .select('*')
      .then(({ data }) => setContacts(data));
  }, []);

  return <div>{contacts.map(c => <div>{c.name}</div>)}</div>;
}
```

### Good ✅ (After)
```typescript
function ContactList() {
  const { data: contacts = [], isLoading } = useContactsList();

  if (isLoading) return <Skeleton />;
  
  return <div>{contacts.map(c => <div>{c.name}</div>)}</div>;
}

function ContactForm() {
  const { mutate: createContact } = useCreateContact();

  const handleSubmit = (data) => {
    createContact(data); // Toast + cache invalidation automatic
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## Creating a New Service

### Step 1: Create Repository

`src/services/myfeature/myfeatureRepository.ts`:

```typescript
import { createService } from '@/services/api/genericService';

export interface MyItem {
  id: string;
  name: string;
  // ... other fields
}

const baseService = createService<MyItem>('my_table');

export const myfeatureRepository = {
  list: (filters?) => baseService.list(filters),
  get: (id) => baseService.get(id),
  create: (item) => baseService.create(item),
  update: (id, updates) => baseService.update(id, updates),
  delete: (id) => baseService.delete(id),
  // Add domain-specific methods here
};
```

### Step 2: Create Service

`src/services/myfeature/myfeatureService.ts`:

```typescript
import { myfeatureRepository } from './myfeatureRepository';

export const myfeatureService = {
  list: (filters?) => {
    // Validation, business logic
    return myfeatureRepository.list(filters);
  },
  
  create: (item) => {
    if (!item.name) throw new Error('Name required');
    return myfeatureRepository.create(item);
  },
  
  // ... other methods with validation
};
```

### Step 3: Create Query Hooks

`src/services/myfeature/useMyfeatureQueries.ts`:

```typescript
import { createListQuery } from '@/services/api';
import { queryKeys } from '@/services/api';
import { myfeatureService } from './myfeatureService';

export const useMyfeatureList = (filters?) => {
  return createListQuery(
    queryKeys.myfeature.list(filters),
    () => myfeatureService.list(filters)
  );
};
```

### Step 4: Create Mutation Hooks

`src/services/myfeature/useMyfeatureMutations.ts`:

```typescript
import { createCreateMutation } from '@/services/api';
import { queryKeys } from '@/services/api';
import { myfeatureService } from './myfeatureService';

export const useCreateMyfeature = () => {
  return createCreateMutation(
    (item) => myfeatureService.create(item),
    {
      invalidateKey: queryKeys.myfeature.lists(),
    }
  );
};
```

### Step 5: Create Index

`src/services/myfeature/index.ts`:

```typescript
export { myfeatureRepository } from './myfeatureRepository';
export { myfeatureService } from './myfeatureService';
export { useMyfeatureList, /* ... */ } from './useMyfeatureQueries';
export { useCreateMyfeature, /* ... */ } from './useMyfeatureMutations';
```

## Query Keys Pattern

Query keys must be standardized to enable cache invalidation.

**Location**: `src/services/api/queryKeys.ts`

**Pattern**:
```typescript
export const queryKeys = {
  myfeature: {
    all: () => ['myfeature'],
    lists: () => [...queryKeys.myfeature.all(), 'list'],
    list: (filters?) => [...queryKeys.myfeature.lists(), filters],
    details: () => [...queryKeys.myfeature.all(), 'detail'],
    detail: (id) => [...queryKeys.myfeature.details(), id],
  },
};
```

## Error Handling

### In Service
```typescript
export const contactsService = {
  create: async (contact) => {
    if (!contact.name) {
      throw new Error('Name is required'); // Clear error message
    }
    
    try {
      return await contactsRepository.create(contact);
    } catch (error) {
      // Log, transform, or re-throw
      console.error('Failed to create contact', error);
      throw new Error('Failed to create contact. Please try again.');
    }
  },
};
```

### In Hook
```typescript
export const useCreateContact = () => {
  return createCreateMutation(
    (contact) => contactsService.create(contact),
    {
      invalidateKey: queryKeys.contacts.lists(),
      onSuccessMessage: 'Contact created successfully!',
      onErrorMessage: 'Failed to create contact. Please try again.', // Shown to user
    }
  );
};
```

## Testing

Each layer can be tested independently:

```typescript
// Test Repository with mocked Supabase
it('should list contacts', async () => {
  const mockSupabase = { from: jest.fn() };
  const result = await contactsRepository.list();
  expect(result).toEqual([...]);
});

// Test Service with mocked Repository
it('should validate email on create', async () => {
  const mockRepo = { create: jest.fn() };
  await expect(
    contactsService.create({ name: 'John', email: 'invalid' })
  ).rejects.toThrow('Invalid email');
});

// Test Hook with mocked Service
it('should show success message on create', async () => {
  const mockToast = jest.fn();
  const { result } = renderHook(() => useCreateContact());
  // ...
});
```

## Migration Guide

### For Existing Hooks

If you have existing hooks that directly access Supabase:

1. Create a repository layer
2. Create a service layer with validation
3. Create standardized query/mutation hooks
4. Update components to use new hooks
5. Delete old hooks

Example migration:

```typescript
// OLD useContacts.ts (761 lines of mixed concerns)
export const useContacts = () => {
  const [data, setData] = useState();
  // ... 760 lines of Supabase queries, validations, mutations, state...
};

// NEW split into:
// - contactsRepository.ts (data access)
// - contactsService.ts (business logic)
// - useContactsQueries.ts (read hooks)
// - useContactsMutations.ts (write hooks)
```

## Benefits

✅ **Testability**: Each layer can be tested independently
✅ **Reusability**: Services can be used in multiple places
✅ **Consistency**: Standardized patterns across features
✅ **Maintainability**: Clear separation of concerns
✅ **Scalability**: Easy to add new features
✅ **Error Handling**: Centralized validation and error messages
✅ **Cache Management**: Consistent cache invalidation strategy
✅ **Type Safety**: Full TypeScript support

## Common Patterns

### Conditional Query
```typescript
export const useContactIfExists = (id?: string) => {
  return useContact(id, { enabled: !!id }); // Only runs if ID exists
};
```

### Dependent Query
```typescript
export const useContactWithCompany = (contactId?: string) => {
  const { data: contact } = useContact(contactId);
  const { data: company } = useCompany(contact?.company_id, {
    enabled: !!contact?.company_id, // Only runs if contact has company_id
  });
  
  return { contact, company };
};
```

### Parallel Queries
```typescript
export const useContactDetails = (id: string) => {
  const contactQuery = useContact(id);
  const historyQuery = useContactHistory(id);
  
  return {
    contact: contactQuery.data,
    history: historyQuery.data,
    isLoading: contactQuery.isLoading || historyQuery.isLoading,
  };
};
```

## Rules Summary

| Layer | Can access | Cannot access | Responsibility |
|-------|-----------|---------------|-----------------|
| Component | Hooks | Supabase, Service | Display data, handle UI |
| Hooks | Service, queryKeys | Supabase, Repository | Caching, invalidation |
| Service | Repository | Supabase | Validation, business logic |
| Repository | Supabase | Service, Hooks | Data access only |

---

**Questions?** Check existing services like `src/services/contacts/` for complete examples.
