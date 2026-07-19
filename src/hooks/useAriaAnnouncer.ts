// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useAriaAnnouncerManagement, type UseAriaAnnouncerReturn } from '@/hooks/useUIInteractionManagement';

export type { UseAriaAnnouncerReturn };

export function useAriaAnnouncer(): UseAriaAnnouncerReturn {
  return useAriaAnnouncerManagement();
}

export function AriaAnnouncer() {
  useAriaAnnouncer();
  return null;
}