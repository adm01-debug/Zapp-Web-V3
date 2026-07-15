// @ts-nocheck
// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export {
  ALL_ROLES,
  type RoutePermission,
} from '@/features/admin/hooks/useAdminManagement';

export function useRoutePermissions() {
  const admin = useAdminManagement();
  return {
    rows: admin.permissionRows,
    loading: admin.permLoading,
    savingPath: admin.savingPermPath,
    load: admin.loadPermissions,
    saveRow: admin.savePermissionRow,
    deleteRow: admin.deletePermissionRow,
    createRow: admin.createPermissionRow,
  };
}
