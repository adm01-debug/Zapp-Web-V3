// Re-export from consolidated useGmailManagement module (ETAPA 20 consolidation)
import { useEmailSyncManagement } from './useGmailManagement';
import type { UseEmailSyncParams, UseEmailSyncResult } from './useGmailManagement';

export { useEmailSyncManagement as useEmailSync };
export type { UseEmailSyncParams, UseEmailSyncResult };
