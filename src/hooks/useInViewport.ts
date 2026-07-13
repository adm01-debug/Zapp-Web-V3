// Re-export from consolidated useUtilityHelpersManagement module (ETAPA 49 consolidation)
import { useInViewportManagement, UseInViewportOptions } from '@/hooks/useUtilityHelpersManagement';
import { type RefObject } from 'react';

export { UseInViewportOptions };

export function useInViewport(ref: RefObject<Element | null>, options: UseInViewportOptions = {}): boolean {
  return useInViewportManagement(ref, options);
}
