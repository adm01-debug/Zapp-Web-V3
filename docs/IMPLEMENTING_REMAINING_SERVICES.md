# Guide: Implementing Remaining Services

This document provides a quick reference for implementing the remaining 4 domain services using the established patterns.

## Completed Services (6/10)
✅ Contacts  
✅ Connections  
✅ Users  
✅ Messages  
✅ Queues  
✅ Settings  

## Remaining Services (4/10)
- [ ] Automations
- [ ] Analytics  
- [ ] Admin
- [ ] (One more to identify based on queryKeys)

---

## Template: Quick Service Implementation

Each service requires 5 files following this structure:

### 1. Repository (`xxxRepository.ts`)
```typescript
import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

export interface XxxItem {
  id: string;
  name: string;
  account_id: string;
  created_at: string;
  updated_at: string;
}

const baseService = createService<XxxItem>('table_name');

export const xxxRepository = {
  list: (filters?: Partial<XxxItem> & QueryParams) =>
    baseService.list(filters),
  get: (id: string) =>
    baseService.get(id),
  search: (query: string) =>
    baseService.search(query),
  create: (data: Partial<XxxItem>) =>
    baseService.create(data),
  update: (id: string, updates: Partial<XxxItem>) =>
    baseService.update(id, updates),
  delete: (id: string) =>
    baseService.delete(id),
  subscribe: (callback: (item: XxxItem) => void) =>
    baseService.subscribe(callback),
};
```

### 2. Service (`xxxService.ts`)
```typescript
import { xxxRepository, type XxxItem } from './xxxRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

export const xxxService = {
  list: async (filters?: Partial<XxxItem> & QueryParams): Promise<ListResponse<XxxItem>> => {
    return xxxRepository.list(filters);
  },

  get: async (id: string): Promise<XxxItem | null> => {
    if (!id) throw new Error('ID is required');
    return xxxRepository.get(id);
  },

  create: async (data: Partial<XxxItem>): Promise<XxxItem> => {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Name is required');
    }
    return xxxRepository.create({
      ...data,
      name: data.name.trim(),
    });
  },

  update: async (id: string, updates: Partial<XxxItem>): Promise<XxxItem> => {
    if (!id) throw new Error('ID is required');
    return xxxRepository.update(id, updates);
  },

  delete: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('ID is required');
    return xxxRepository.delete(id);
  },

  onItemChange: (callback: (item: XxxItem) => void) => {
    return xxxRepository.subscribe(callback);
  },
};
```

### 3. Query Hooks (`useXxxQueries.ts`)
```typescript
import { useQueryClient } from '@tanstack/react-query';
import {
  createListQuery,
  createDetailQuery,
  createSearchQuery,
  queryKeys,
} from '@/services/api';
import { xxxService, type XxxItem } from './index';
import type { QueryParams } from '@/services/api/types';

export const useXxxList = (filters?: Partial<XxxItem> & QueryParams) => {
  return createListQuery(
    queryKeys.xxx.list(filters),
    () => xxxService.list(filters),
    { staleTime: 30_000 }
  );
};

export const useXxx = (id?: string) => {
  return createDetailQuery(
    queryKeys.xxx.detail(id || ''),
    () => xxxService.get(id!),
    !!id,
    { staleTime: 60_000 }
  );
};

export const useSearchXxx = (query?: string) => {
  return createSearchQuery(
    queryKeys.xxx.search(query),
    () => xxxService.search(query || ''),
    !!query && query.length >= 2,
    { staleTime: 10_000 }
  );
};

export const useInvalidateXxx = () => {
  const queryClient = useQueryClient();
  return {
    invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.xxx.lists() }),
    invalidateDetail: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.xxx.detail(id) }),
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: queryKeys.xxx.all() }),
  };
};
```

### 4. Mutation Hooks (`useXxxMutations.ts`)
```typescript
import {
  createCreateMutation,
  createUpdateMutation,
  createDeleteMutation,
  queryKeys,
} from '@/services/api';
import { xxxService, type XxxItem } from './index';

export const useCreateXxx = () => {
  return createCreateMutation(
    (data: Partial<XxxItem>) => xxxService.create(data),
    {
      invalidateKey: queryKeys.xxx.lists(),
      onSuccessMessage: 'Item criado com sucesso!',
      onErrorMessage: 'Erro ao criar item.',
      showToasts: true,
    }
  );
};

export const useUpdateXxx = () => {
  return createUpdateMutation(
    ({ id, ...updates }: Partial<XxxItem> & { id: string }) =>
      xxxService.update(id, updates),
    {
      invalidateKeys: [
        queryKeys.xxx.lists(),
        queryKeys.xxx.details(),
      ],
      onSuccessMessage: 'Item atualizado com sucesso!',
      onErrorMessage: 'Erro ao atualizar item.',
      showToasts: true,
    }
  );
};

export const useDeleteXxx = () => {
  return createDeleteMutation(
    (id: string) => xxxService.delete(id),
    {
      invalidateKey: queryKeys.xxx.lists(),
      onSuccessMessage: 'Item deletado com sucesso!',
      onErrorMessage: 'Erro ao deletar item.',
      showToasts: true,
    }
  );
};
```

### 5. Index (`index.ts`)
```typescript
export { xxxRepository, type XxxItem } from './xxxRepository';
export { xxxService } from './xxxService';
export {
  useXxxList,
  useXxx,
  useSearchXxx,
  useInvalidateXxx,
} from './useXxxQueries';
export {
  useCreateXxx,
  useUpdateXxx,
  useDeleteXxx,
} from './useXxxMutations';
```

---

## Service Checklist

For each service, ensure:

### Repository Layer
- [ ] Import `createService` and types
- [ ] Define interfaces for each entity
- [ ] Create base service using `createService()`
- [ ] Export all CRUD methods
- [ ] Add any domain-specific methods (filters, relationships)
- [ ] Include subscription support

### Service Layer
- [ ] Import repository
- [ ] Implement validation for all create/update operations
- [ ] Throw descriptive errors
- [ ] Normalize data (trim, lowercase, etc.)
- [ ] Document each method with JSDoc comments

### Query Hooks Layer
- [ ] Use factory functions (createListQuery, etc.)
- [ ] Configure appropriate `staleTime`
- [ ] Handle conditional queries with `enabled`
- [ ] Implement invalidation helper hook
- [ ] Provide search if applicable

### Mutation Hooks Layer
- [ ] Use factory functions (createCreateMutation, etc.)
- [ ] Configure automatic toast notifications
- [ ] Set invalidateKey/invalidateKeys appropriately
- [ ] Provide user-friendly messages (Portuguese)

### Index Export
- [ ] Export repository and types
- [ ] Export service
- [ ] Export all query hooks
- [ ] Export all mutation hooks

---

## Before & After Example: Automations Service

### OLD CODE (In Various Components)
```typescript
// Component 1
const [automations, setAutomations] = useState([]);
useEffect(() => {
  supabase.from('automations').select('*').then(r => setAutomations(r.data));
}, []);

// Component 2
const { data: automation } = useQuery({
  queryKey: ['automation', id],
  queryFn: async () => {
    const { data } = await supabase.from('automations').select('*').eq('id', id).single();
    return data;
  }
});

// Component 3
const createAutomation = async (data) => {
  const { data: created } = await supabase.from('automations').insert(data).select().single();
  // Manual cache invalidation
  queryClient.invalidateQueries({ queryKey: ['automations'] });
  return created;
};
```

### NEW CODE (Using Service)
```typescript
// Component 1
const { data: automations } = useAutomationsList();

// Component 2
const { data: automation } = useAutomation(id);

// Component 3
const { mutate: createAutomation } = useCreateAutomation();
// Automatic toast + cache invalidation included!
```

---

## Testing the New Service

After implementing, test by:

```typescript
// In a test component
import { useXxxList, useXxx, useCreateXxx } from '@/services/xxx';

export function TestComponent() {
  // Test list query
  const { data: items, isLoading } = useXxxList();
  
  // Test detail query
  const { data: item } = useXxx('123');
  
  // Test mutation
  const { mutate: create } = useCreateXxx();
  
  return (
    <div>
      <button onClick={() => create({ name: 'Test' })}>
        Create
      </button>
      {isLoading && <p>Loading...</p>}
      {items?.map(i => <p key={i.id}>{i.name}</p>)}
    </div>
  );
}
```

---

## Performance Tips

1. **Set appropriate staleTime**
   - User preferences: 60s-5m
   - Lists/collections: 30s
   - Real-time data (messages): 5-10s
   - System config: 10-15m

2. **Configure gcTime properly**
   - Default factory sets gcTime to staleTime * 2
   - Adjust if frequently refetched

3. **Use conditional queries**
   - Always disable when IDs are missing
   - Use `enabled` parameter consistently

4. **Batch related queries**
   - Use Promise.all if multiple independent queries
   - Use dependent queries if one depends on another

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `TypeError: xxx is not a function` | Using factory incorrectly | Check factory import and usage |
| `Cache not invalidating` | Wrong invalidateKey | Ensure key matches query key structure |
| `Stale data displayed` | staleTime too high | Reduce staleTime or use refetch |
| `Toast not showing` | showToasts: false | Set showToasts: true in factory options |

---

## Next Service to Implement: Automations

Based on queryKeys.ts structure, the **Automations** service should handle:
- Workflow automation rules
- Trigger configurations
- Action definitions
- Automation schedules

Key tables: `automations`, `automation_triggers`, `automation_actions`

---

## Questions?

Refer to these completed examples:
- Simple service: [Queues](../src/services/queues/)
- Complex service: [Messages](../src/services/messages/)
- Settings example: [Settings](../src/services/settings/)
- Original example: [Contacts](../src/services/contacts/)

Last Updated: 2026-07-13
