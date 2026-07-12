/**
 * useDepartmentsAdmin — Wave 3 batch-4 (2026-07-07)
 * Camada de dados extraída de DepartmentsPage (CRUD + member_count).
 * Casts removidos (types #243). save/removeDepartment retornam boolean
 * para a view resetar dialog/form (paridade de comportamento).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Department {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
}

export function useDepartmentsAdmin() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Erro ao carregar departamentos');
      setLoading(false);
      return;
    }

    // Count members per department
    const ids = (data ?? []).map((d) => d.id);
    let counts: Record<string, number> = {};
    let countsFailed = false;
    if (ids.length) {
      const { data: profilesByDept, error: profilesByDeptErr } = await supabase
        .from('profiles')
        .select('department_id')
        .in('department_id', ids);
      if (profilesByDeptErr) {
        console.warn('[useDepartmentsAdmin] member-count fetch failed:', profilesByDeptErr.message);
        countsFailed = true;
      } else {
        counts = (profilesByDept ?? []).reduce<Record<string, number>>((acc, p) => {
          if (p.department_id) acc[p.department_id] = (acc[p.department_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }

    setDepartments(
      (data ?? []).map((d) => ({ ...d, member_count: countsFailed ? undefined : (counts[d.id] ?? 0) })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchDepartments();
  }, [fetchDepartments]);

  const save = async (payload: { name: string; slug: string; description: string | null; is_active: boolean }, editingId: string | null): Promise<boolean> => {
    setSaving(true);

    const { error } = editingId
      ? await supabase.from('departments').update(payload).eq('id', editingId)
      : await supabase.from('departments').insert(payload);

    setSaving(false);

    if (error) {
      toast.error(
        error.message.includes('duplicate')
          ? 'Já existe um departamento com esse nome ou identificador'
          : 'Erro ao salvar departamento',
      );
      return false;
    }

    toast.success(editingId ? 'Departamento atualizado' : 'Departamento criado');
    void fetchDepartments();
    return true;
  };

  const removeDepartment = async (id: string): Promise<boolean> => {
    setSaving(true);
    const { error } = await supabase.from('departments').delete().eq('id', id);
    setSaving(false);

    if (error) {
      toast.error('Erro ao remover departamento');
      return false;
    }

    toast.success('Departamento removido');
    void fetchDepartments();
    return true;
  };

  return { departments, loading, saving, fetchDepartments, save, removeDepartment };
}
