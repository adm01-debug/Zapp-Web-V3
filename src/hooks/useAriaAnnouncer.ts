// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import {
  useAriaAnnouncerManagement,
  type UseAriaAnnouncerReturn,
} from '@/hooks/useUIInteractionManagement';

export type { UseAriaAnnouncerReturn };

/** Manages live region announcements for accessibility, automatically notifying screen readers of content changes. */
export function useAriaAnnouncer(): UseAriaAnnouncerReturn {
  return useAriaAnnouncerManagement();
}

/** Component that renders and manages live region announcements for screen reader notifications. */
export function AriaAnnouncer() {
  useAriaAnnouncer();
  return null;
}
