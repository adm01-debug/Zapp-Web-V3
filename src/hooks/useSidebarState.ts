// Re-export from consolidated useUIInteractionManagement module (ETAPA 32 consolidation)
import { useSidebarCollapseManagement, useSidebarFavoritesManagement, useSidebarStateManagement, type SidebarState } from '@/hooks/useUIInteractionManagement';

export type { SidebarState };

/** Manages sidebar collapse state with persistent storage. */
export function useSidebarCollapse() {
  return useSidebarCollapseManagement();
}

/** Manages sidebar favorite items with storage and persistence. */
export function useSidebarFavorites() {
  return useSidebarFavoritesManagement();
}

/** Retrieves complete sidebar state including collapse and favorite status. */
export function useSidebarState(): SidebarState {
  return useSidebarStateManagement();
}

export default {
  useSidebarCollapse,
  useSidebarFavorites,
  useSidebarState,
};
