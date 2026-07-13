// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useThemeManagement, ThemeSync, type Theme, type ResolvedTheme, type UseThemeReturn } from '@/hooks/useUIManagement';

export type { Theme, ResolvedTheme };
export { ThemeSync };

export function useTheme(): UseThemeReturn {
  return useThemeManagement();
}
