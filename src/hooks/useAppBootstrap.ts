import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * rpc_app_bootstrap — single RPC that replaces 6+ individual queries:
 * profiles, user_roles, permissions, role_permissions, global_settings, departments
 *
 * Reduces initial page load from ~6-10 PostgREST calls to 1.
 * Falls back to undefined on error (individual hooks still work as fallback).
 */

interface BootstrapProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  role: string | null;
  company_id: string | null;
  department_id: string | null;
  phone: string | null;
  created_at: string;
}

interface BootstrapPermission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

interface BootstrapRolePermission {
  role: string;
  permission_id: string;
  permission: BootstrapPermission | null;
}

interface BootstrapGlobalSetting {
  id: string;
  key: string;
  value: string;
  description?: string | null;
}

interface BootstrapDepartment {
  id: string;
  name: string;
  is_active: boolean;
  [key: string]: unknown;
}

export interface AppBootstrapData {
  profile: BootstrapProfile | null;
  roles: string[];
  permissions: BootstrapPermission[];
  role_permissions: BootstrapRolePermission[];
  global_settings: BootstrapGlobalSetting[];
  departments: BootstrapDepartment[];
  unread_notifications: number;
  fetched_at: string;
}

const BOOTSTRAP_KEY = ['app-bootstrap'] as const;

/** Consolidated app bootstrap hook — fetches user profile, roles, permissions,
 * global settings, departments, and notification count in a single RPC call.
 * Replaces 6+ individual PostgREST queries on every page load. */
export function useAppBootstrap() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: async (): Promise<AppBootstrapData> => {
      const { data: result, error: rpcError } = await supabase.rpc('rpc_app_bootstrap');
      if (rpcError) throw rpcError;
      return result as unknown as AppBootstrapData;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  const profile = useMemo(() => data?.profile ?? null, [data]);
  const roles = useMemo(() => data?.roles ?? [], [data]);
  const permissions = useMemo(() => data?.permissions ?? [], [data]);
  const rolePermissions = useMemo(() => data?.role_permissions ?? [], [data]);
  const globalSettings = useMemo(() => data?.global_settings ?? [], [data]);
  const departments = useMemo(() => data?.departments ?? [], [data]);
  const unreadNotifications = useMemo(() => data?.unread_notifications ?? 0, [data]);

  const isAdmin = useMemo(
    () => roles.some((r: string) => r === 'admin' || r === 'dev'),
    [roles]
  );

  const getSetting = useCallback(
    (key: string): string | null => {
      const found = globalSettings.find((s) => s.key === key);
      return found?.value ?? null;
    },
    [globalSettings]
  );

  const hasPermission = useCallback(
    (permissionName: string): boolean =>
      rolePermissions.some((rp) => rp.permission?.name === permissionName),
    [rolePermissions]
  );

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: BOOTSTRAP_KEY }),
    [queryClient]
  );

  return {
    data,
    isLoading,
    error,
    profile,
    roles,
    isAdmin,
    permissions,
    rolePermissions,
    globalSettings,
    departments,
    unreadNotifications,
    getSetting,
    hasPermission,
    refetch,
  };
}
