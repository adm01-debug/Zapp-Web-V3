// @ts-nocheck
// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export {
  TRIGGER_LABEL,
  EMPTY_RULE,
  type Rule,
  type TriggerType,
  type AutomationChannel,
  type AutomationDepartment,
} from '@/features/admin/hooks/useAdminManagement';

export function useAdminAutomations() {
  const admin = useAdminManagement();
  return {
    rules: admin.rules,
    channels: admin.automationChannels,
    departments: admin.automationDepartments,
    loading: admin.automationLoading,
    load: admin.loadAutomations,
    save: admin.saveAutomation,
    remove: admin.removeAutomation,
    toggleActive: admin.toggleAutomationActive,
    adjustPriority: admin.adjustAutomationPriority,
  };
}
