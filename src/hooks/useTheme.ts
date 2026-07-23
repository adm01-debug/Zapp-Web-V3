// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useThemeManagement, ThemeSync, type Theme, type ResolvedTheme, type UseThemeReturn } from '@/hooks/useUIManagement';

/** Re-exported module members. */
export type { Theme, ResolvedTheme };
/** Re-exported module members. */
export { ThemeSync };

/** Retrieves and manages theme state with real-time synchronization across tabs. */
export function useTheme(): UseThemeReturn {
  return useThemeManagement();
}
