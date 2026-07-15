// Re-export from consolidated useAdminManagement module (ETAPA 19 consolidation)
import { useAdminManagement } from '@/features/admin/hooks/useAdminManagement';

export type {
  UserWithRole,
} from '@/features/admin/hooks/useAdminManagement';

export function useRolesPageState() {
  const admin = useAdminManagement();
  return {
    users: admin.roleUsers,
    loading: admin.rolesLoading,
    search: admin.rolesSearch,
    setSearch: admin.setRolesSearch,
    showAddDialog: admin.showAddRoleDialog,
    setShowAddDialog: admin.setShowAddRoleDialog,
    selectedUser: admin.selectedRoleUser,
    setSelectedUser: admin.setSelectedRoleUser,
    selectedRole: admin.selectedRole,
    setSelectedRole: admin.setSelectedRole,
    availableUsers: admin.availableRoleUsers,
    userToRemove: admin.userToRemoveRole,
    setUserToRemove: admin.setUserToRemoveRole,
    updating: admin.rolesUpdating,
    handleAddRole: admin.handleAddRole,
    handleRemoveRole: admin.handleRemoveRole,
    groupedUsers: admin.groupedRoleUsers,
  };
}
