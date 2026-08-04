import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useAppBootstrap — single RPC call replacing 6+ individual queries on page load.
 *
 * Calls zapp.rpc_app_bootstrap() (wrapper SECURITY DEFINER → public.rpc_app_bootstrap) which fetches:
 *   profiles, user_roles, permissions, role_permissions,
 *   global_settings, departments, unread notification count.
 *
 * v2.0 — interface updated to match actual zapp.profiles schema:
 *   - Removed: company_id (does not exist in DB)
 *   - Added: user_id, is_online, online_status, job_title, nickname, max_chats,
 *            can_download, profile_permissions
 */

export interface BootstrapProfile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
  is_online: boolean | null;
  role: string;
  department_id: string | null;
  phone: string | null;
  job_title: string | null;
  nickname: string | null;
  online_status: string | null;
  max_chats: number;
  can_download: boolean;
  profile_permissions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface BootstrapPermission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

export interface BootstrapRolePermission {
  role: string;
  permission_id: string;
  permission: BootstrapPermission | null;
}

export interface BootstrapGlobalSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

export interface BootstrapDepartment {
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
  error?: string;
}

const BOOTSTRAP_KEY = ['app-bootstrap'] as const;

/**
 * Consolidated app bootstrap hook.
 *
 * Single RPC call on mount that replaces 6+ individual PostgREST queries.
 * Provides: profile, roles, isAdmin, permissions, globalSettings, departments,
 *           unreadNotifications, getSetting(), hasPermission().
 */
export function useAppBootstrap() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: BOOTSTRAP_KEY,
    queryFn: async (): Promise<AppBootstrapData> => {
      const { data: result, error: rpcError } = await (
        supabase as unknown as {
          rpc: (
            name: string,
            args?: Record<string, unknown>
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
        }
      ).rpc('rpc_app_bootstrap');
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

  const isAdmin = useMemo(() => roles.some((r: string) => r === 'admin' || r === 'dev'), [roles]);

  const getSetting = useCallback(
    (key: string): string | null => globalSettings.find((s) => s.key === key)?.value ?? null,
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
