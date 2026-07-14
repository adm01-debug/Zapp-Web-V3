// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useSidebarCollapseManagement, useSidebarFavoritesManagement, useSidebarStateManagement, type SidebarState } from '@/hooks/useUIInteractionManagement';

export type { SidebarState };

export function useSidebarCollapse() {
  return useSidebarCollapseManagement();
}

export function useSidebarFavorites() {
  return useSidebarFavoritesManagement();
}

export function useSidebarState(): SidebarState {
  return useSidebarStateManagement();
}

export default {
  useSidebarCollapse,
  useSidebarFavorites,
  useSidebarState,
};
