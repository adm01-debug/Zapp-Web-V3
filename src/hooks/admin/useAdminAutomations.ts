// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useMemo } from 'react';
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

/** Re-exported module members. */
export {
  TRIGGER_LABEL,
  EMPTY_RULE,
  type Rule,
  type TriggerType,
  type AutomationChannel,
  type AutomationDepartment,
} from '@/features/admin/hooks/useAdminManagement';

/** Hook: use Admin Automations. */
export function useAdminAutomations() {
  const admin = useAdminManagement();

  const channelMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of admin.automationChannels ?? []) map[c.id] = c.name;
    return map;
  }, [admin.automationChannels]);

  const deptMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const d of admin.automationDepartments ?? []) map[d.id] = d.name;
    return map;
  }, [admin.automationDepartments]);

  return {
    rules: admin.rules,
    channels: admin.automationChannels,
    departments: admin.automationDepartments,
    channelMap,
    deptMap,
    loading: admin.automationLoading,
    error: admin.automationError,
    load: admin.loadAutomations,
    reload: admin.loadAutomations,
    save: admin.saveAutomation,
    remove: admin.removeAutomation,
    toggleActive: admin.toggleAutomationActive,
    adjustPriority: admin.adjustAutomationPriority,
  };
}


