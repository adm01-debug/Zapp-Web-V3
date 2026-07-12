import { useCallback, useState, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

export interface RolePermission {
  role: 'dev' | 'admin' | 'supervisor' | 'agent';
  permission_id: string;
  permission?: Permission;
}

// Module-level cache — shared across all hook instances.
// Permissions/role_permissions are quasi-static (only mutated by admins),
// so we deduplicate fetches with a 5-min TTL and a single in-flight promise.
const CACHE_TTL_MS = 5 * 60 * 1000;
type CacheShape = {
  permissions: Permission[];
  rolePermissions: RolePermission[];
  fetchedAt: number;
};
let cache: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;

async function loadPermissionsData(force = false): Promise<CacheShape> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const [permsResult, rolePermsResult] = await Promise.all([
      supabase.from('permissions').select('*').order('category', { ascending: true }),
      supabase
        .from('role_permissions')
        .select('role, permission_id, permissions(id, name, description, category)'),
    ]);

    const permissions = (permsResult.data ?? []) as Permission[];
    const rolePermissions: RolePermission[] = (rolePermsResult.data ?? []).map((rp) => ({
      role: rp.role as RolePermission['role'],
      permission_id: rp.permission_id,
      permission: rp.permissions as Permission,
    }));

    cache = { permissions, rolePermissions, fetchedAt: Date.now() };
    return cache;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function invalidatePermissionsCache() {
  cache = null;
}

export function usePermissions() {
  const {
    user,
    permissions: userPermissions,
    loading: authLoading,
    refreshPermissions,
  } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>(cache?.permissions ?? []);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>(
    cache?.rolePermissions ?? []
  );
  const [fetchingAll, setFetchingAll] = useState(false);
  const mountedRef = useMountedRef();

  const fetchAllPermissionsData = useCallback(async (force = false) => {
    if (!mountedRef.current) return;
    setFetchingAll(true);
    try {
      const data = await loadPermissionsData(force);
      if (mountedRef.current) {
        setPermissions(data.permissions);
        setRolePermissions(data.rolePermissions);
      }
    } finally {
      if (mountedRef.current) setFetchingAll(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchAllPermissionsData();
  }, [user, fetchAllPermissionsData]);

  /** Server-side permission check via SECURITY DEFINER RPC */
  const checkPermissionServer = useCallback(
    async (permissionName: string): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await supabase.rpc('user_has_permission', {
        _user_id: user.id,
        _permission_name: permissionName,
      });
      if (error) return false;
      return !!data;
    },
    [user]
  );

  const hasPermission = useCallback(
    (permissionName: string): boolean => userPermissions.includes(permissionName),
    [userPermissions]
  );

  const hasAnyPermission = useCallback(
    (permissionNames: string[]): boolean =>
      permissionNames.some((p) => userPermissions.includes(p)),
    [userPermissions]
  );

  const hasAllPermissions = useCallback(
    (permissionNames: string[]): boolean =>
      permissionNames.every((p) => userPermissions.includes(p)),
    [userPermissions]
  );

  const addPermissionToRole = useCallback(
    async (role: string, permissionId: string) => {
      const { error } = await safeClient.from('role_permissions', (q) =>
        q.insert({ role, permission_id: permissionId })
      );

      if (!error) {
        invalidatePermissionsCache();
        await Promise.all([refreshPermissions(), fetchAllPermissionsData(true)]);
      }
      return !error;
    },
    [refreshPermissions, fetchAllPermissionsData]
  );

  const removePermissionFromRole = useCallback(
    async (role: string, permissionId: string) => {
      const { error } = await safeClient.from('role_permissions', (q) =>
        q.delete().eq('role', role).eq('permission_id', permissionId)
      );

      if (!error) {
        invalidatePermissionsCache();
        await Promise.all([refreshPermissions(), fetchAllPermissionsData(true)]);
      }
      return !error;
    },
    [refreshPermissions, fetchAllPermissionsData]
  );

  return {
    permissions,
    rolePermissions,
    userPermissions,
    loading: authLoading || fetchingAll,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkPermissionServer,
    addPermissionToRole,
    removePermissionFromRole,
    refetch: () => Promise.all([refreshPermissions(), fetchAllPermissionsData(true)]),
  };
}
