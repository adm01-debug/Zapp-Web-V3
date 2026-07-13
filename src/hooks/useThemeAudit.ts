// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useThemeAuditManagement, type AuditResult } from '@/hooks/useUIManagement';

export type { AuditResult };

export const useThemeAudit = () => {
  return useThemeAuditManagement();
};
