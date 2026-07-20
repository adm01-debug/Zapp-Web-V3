// Re-export from consolidated useGmailManagement module (ETAPA 20 consolidation)
import { useEmailSyncManagement } from './useGmailManagement';
import type { UseEmailSyncParams, UseEmailSyncResult } from './useGmailManagement';

/** Hook: use Email Sync. */
export { useEmailSyncManagement as useEmailSync };
export type { UseEmailSyncParams, UseEmailSyncResult };
