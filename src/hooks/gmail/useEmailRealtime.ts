// Re-export from consolidated useGmailManagement module (ETAPA 20 consolidation)
import { useEmailRealtimeManagement } from './useGmailManagement';
import type { UseEmailRealtimeParams } from './useGmailManagement';

export { useEmailRealtimeManagement as useEmailRealtime };
export type { UseEmailRealtimeParams };
