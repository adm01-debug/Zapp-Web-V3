// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useAriaAnnouncerManagement, type UseAriaAnnouncerReturn } from '@/hooks/useUIInteractionManagement';

export type { UseAriaAnnouncerReturn };

/** Hook: use Aria Announcer. */
export function useAriaAnnouncer(): UseAriaAnnouncerReturn {
  return useAriaAnnouncerManagement();
}

/** Hook: Aria Announcer. */
export function AriaAnnouncer() {
  useAriaAnnouncer();
  return null;
}