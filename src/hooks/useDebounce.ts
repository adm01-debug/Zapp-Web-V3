// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { useDebounceManagement, useDebouncedValueManagement } from '@/hooks/useUtilityHelpersManagement';

export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  optionsOrDelay?: { delay?: number; leading?: boolean } | number,
): T {
  return useDebounceManagement(callback, optionsOrDelay);
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  return useDebouncedValueManagement(value, delay);
}
