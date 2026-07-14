// Re-export from consolidated useGmailManagement module (ETAPA 20 consolidation)
import { useEmailThreadActionsManagement } from './useGmailManagement';
import type { UseEmailThreadActionsParams, UseEmailThreadActionsResult } from './useGmailManagement';

export { useEmailThreadActionsManagement as useEmailThreadActions };
export type { UseEmailThreadActionsParams, UseEmailThreadActionsResult };
