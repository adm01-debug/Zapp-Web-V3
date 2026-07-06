/**
 * useDepartmentManagement — Wave 3 (2026-07-06)
 * Camada de dados extraída de DepartmentManagementDialog (componente ficou 100% UI).
 * Query keys, side-effects de sync de formulário WhatsApp e semântica preservados.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';

export interface DeptRef {
  id: string;
  name: string;
}

export interface DeptProfile {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  department_id: string | null;
  role: string | null;
}

export interface DeptAuditLog {
  id: string;
  action: string;
  details: any;
  created_at: string;
  user_id: string;
}

export function useDepartmentManagement(initialDepartment: DeptRef, open: boolean, view: 'members' | 'audit' | 'invites' | 'whatsapp') {
  const { profile: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [whatsappMode, setWhatsappMode] = useState<'evolution' | 'official' | 'none'>('none');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');

  const { data: department = initialDepartment } = useQuery({
    queryKey: ['department-details', initialDepartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('id', initialDepartment.id)
        .single();
      if (error) throw error;

      setWhatsappMode((data.whatsapp_mode as any) || 'none');
      setWhatsappApiKey(data.whatsapp_api_key || '');
      setWhatsappInstanceId(data.whatsapp_instance_id || '');

      return data;
    },
    enabled: open,
  });

  const { data: allProfiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['profiles-for-dept-mgmt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, department_id, role')
        .order('name');
      if (error) throw error;
      return data as DeptProfile[];
    },
    enabled: open && view === 'members',
  });

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['dept-audit-logs', department.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'department')
        .eq('entity_id', department.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DeptAuditLog[];
    },
    enabled: open && (view === 'audit' || view === 'members'),
  });

  const { data: invitations = [], isLoading: loadingInvites } = useQuery({
    queryKey: ['dept-invitations', department.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invitations')
        .select('*')
        .eq('department_id', department.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open && view === 'invites',
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) return;
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { error } = await supabase.from('department_invitations').insert({
        department_id: department.id,
        created_by: currentUser.id,
        code,
        email: 'default@temp.com', // Added dummy email to fix TS error
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-invitations', department.id] });
      toast({ title: 'Link de convite criado' });
    }
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dept-invitations', department.id] });
      toast({ title: 'Convite revogado' });
    }
  });

  const updateWhatsappMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('departments')
        .update({
          whatsapp_mode: whatsappMode,
          whatsapp_api_key: whatsappApiKey,
          whatsapp_instance_id: whatsappInstanceId,
        })
        .eq('id', department.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-details', department.id] });
      toast({ title: 'Configurações de WhatsApp atualizadas' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao atualizar WhatsApp', description: err.message, variant: 'destructive' });
    }
  });

  const manageMemberMutation = useMutation({
    mutationFn: async ({ profileId, action }: { profileId: string, action: 'add' | 'remove' }) => {
      if (!currentUser) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('manage_department_member', {
        _admin_user_id: currentUser.id,
        _target_profile_id: profileId,
        _department_id: department.id,
        _action: action
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['profiles-for-dept-mgmt'] });
      queryClient.invalidateQueries({ queryKey: ['dept-audit-logs', department.id] });
      toast({
        title: vars.action === 'add' ? 'Membro adicionado' : 'Membro removido',
        description: `O colaborador foi ${vars.action === 'add' ? 'incluído no' : 'removido do'} departamento ${department.name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro na operação',
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  return {
    currentUser, department, allProfiles, loadingProfiles, auditLogs, loadingAudit,
    invitations, loadingInvites, createInviteMutation, deleteInviteMutation,
    updateWhatsappMutation, manageMemberMutation,
    whatsappMode, setWhatsappMode, whatsappApiKey, setWhatsappApiKey, whatsappInstanceId, setWhatsappInstanceId,
  };
}
