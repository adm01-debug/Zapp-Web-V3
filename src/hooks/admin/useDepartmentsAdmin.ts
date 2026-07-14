// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/hooks/useAdminManagement';

export type {
  Department,
} from '@/hooks/useAdminManagement';

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
