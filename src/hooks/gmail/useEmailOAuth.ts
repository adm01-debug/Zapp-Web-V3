// Re-export from consolidated useGmailManagement module (ETAPA 20 consolidation)
import { useEmailOAuthManagement } from './useGmailManagement';
import type { UseEmailOAuthParams, UseEmailOAuthResult } from './useGmailManagement';

/** Hook: use Email OAuth. */
export { useEmailOAuthManagement as useEmailOAuth };
export type { UseEmailOAuthParams, UseEmailOAuthResult };
