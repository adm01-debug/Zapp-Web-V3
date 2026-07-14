/**
 * useRoutePermissions — Wave 3 batch-5 (2026-07-07)
 * Camada de dados extraída de RoutePermissionsPage.
 * load / saveRow / deleteRow: data-layer puro.
 * createRow: recebe newPath/newRoles/newDesc como params (view-state fica na page).
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invalidateRouteRolesCache } from '@/features/auth';
import type { AppRole } from '@/features/auth';

export type RoutePermission = {
  path: string;
  allowed_roles: AppRole[];
  description: string | null;
  is_system: boolean;
  updated_at: string;
};

export const ALL_ROLES: AppRole[] = ['dev', 'admin', 'manager', 'supervisor', 'agent'];

export function useRoutePermissions() {
  const [rows, setRows] = useState<RoutePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPath, setSavingPath] = useState<string | null>(null);
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('route_permissions')
      .select('path, allowed_roles, description, is_system, updated_at')
      .order('path', { ascending: true });
    if (!isMountedRef.current) return;
    if (error) {
      toast({
        title: 'Erro ao carregar permissões',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setRows((data ?? []) as RoutePermission[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function saveRow(path: string, nextRoles: AppRole[]) {
    setSavingPath(path);
    const { error } = await supabase
      .from('route_permissions')
      .update({ allowed_roles: nextRoles })
      .eq('path', path);
    setSavingPath(null);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache(path);
    toast({ title: 'Permissão atualizada', description: path });
    await load();
    return true;
  }

  async function deleteRow(path: string) {
    const { error } = await supabase.from('route_permissions').delete().eq('path', path);
    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache(path);
    toast({ title: 'Rota removida', description: path });
    await load();
    return true;
  }

  async function createRow(newPath: string, newRoles: AppRole[], newDesc: string) {
    const path = newPath.trim();
    if (!path.startsWith('/')) {
      toast({
        title: 'Path inválido',
        description: 'Use um caminho começando com /',
        variant: 'destructive',
      });
      return false;
    }
    const { error } = await supabase.from('route_permissions').insert({
      path,
      allowed_roles: newRoles,
      description: newDesc.trim() || null,
      is_system: false,
    });
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return false;
    }
    invalidateRouteRolesCache();
    toast({ title: 'Rota cadastrada', description: path });
    await load();
    return true;
  }

  return { rows, loading, savingPath, load, saveRow, deleteRow, createRow };
}
