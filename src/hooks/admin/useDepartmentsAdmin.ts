// @ts-nocheck
// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export type {
  Department,
} from '@/features/admin/hooks/useAdminManagement';

export function useDepartmentsAdmin() {
  const admin = useAdminManagement();
  return {
    departments: admin.departments,
    loading: admin.deptLoading,
    saving: admin.deptSaving,
    fetchDepartments: admin.fetchDepartments,
    save: admin.saveDepartment,
    removeDepartment: admin.removeDepartment,
  };
}
