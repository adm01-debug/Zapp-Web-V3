// Re-export from consolidated useUIManagement module (ETAPA 31 consolidation)
import { useThemeAuditManagement, type AuditResult } from '@/hooks/useUIManagement';

/** Re-exported module members. */
export type { AuditResult };

/** Audits theme consistency and reports violations in development mode. */
export const useThemeAudit = () => {
  return useThemeAuditManagement();
};
