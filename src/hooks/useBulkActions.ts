// Re-export from consolidated useAdvancedFeaturesManagement module (ETAPA 50 consolidation)
import { useBulkActionsManagement } from '@/hooks/useAdvancedFeaturesManagement';
export { type BulkAction } from '@/hooks/useAdvancedFeaturesManagement';

export function useBulkActions<T extends { id: string }>(
  items: T[],
  options: Parameters<typeof useBulkActionsManagement<T>>[1] = {}
) {
  return useBulkActionsManagement(items, options);
}
