import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useDepartmentManagement');

interface Department {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  department_id: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  created_at: string;
  details: { profile_name?: string };
}

interface Invitation {
  id: string;
  code: string;
  expires_at: string;
  uses: number;
}

type WhatsappMode = 'none' | 'evolution' | 'official';
type ManageAction = 'add' | 'remove';

export function useDepartmentManagement(
  initialDepartment: Department,
  open: boolean,
  view: 'members' | 'audit' | 'invites' | 'whatsapp'
) {
  const queryClient = useQueryClient();
  const [whatsappMode, setWhatsappMode] = useState<WhatsappMode>('none');
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser({ id: data.user.id });
    });
  }, []);

  // Load department whatsapp settings when view opens
  useEffect(() => {
    if (!open || view !== 'whatsapp') return;
    supabase
      .from('departments')
      .select('whatsapp_mode, whatsapp_api_key, whatsapp_instance_id')
      .eq('id', initialDepartment.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setWhatsappMode((data.whatsapp_mode as WhatsappMode) || 'none');
          setWhatsappApiKey(data.whatsapp_api_key || '');
          setWhatsappInstanceId(data.whatsapp_instance_id || '');
        }
      });
  }, [open, view, initialDepartment.id]);

  const { data: allProfiles = [], isLoading: loadingProfiles } = useQuery<Profile[]>({
    queryKey: ['dept-profiles', initialDepartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url, department_id')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: open && view === 'members',
  });

  const { data: auditLogs = [], isLoading: loadingAudit } = useQuery<AuditLog[]>({
    queryKey: ['dept-audit', initialDepartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, details')
        .eq('entity_id', initialDepartment.id)
        .eq('entity_type', 'department')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        action: l.action,
        created_at: l.created_at,
        details: (l.details as { profile_name?: string }) ?? {},
      }));
    },
    enabled: open && view === 'audit',
  });

  const { data: invitations = [], isLoading: loadingInvites } = useQuery<Invitation[]>({
    queryKey: ['dept-invites', initialDepartment.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('department_invitations')
        .select('id, code, expires_at, status')
        .eq('department_id', initialDepartment.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((inv) => ({
        id: inv.id,
        code: inv.code ?? '',
        expires_at: inv.expires_at ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
        uses: 0,
      }));
    },
    enabled: open && view === 'invites',
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const code = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
      const expires = new Date(Date.now() + 7 * 86400_000).toISOString();
      const { error } = await supabase.from('department_invitations').insert({
        department_id: initialDepartment.id,
        code,
        expires_at: expires,
        role: 'agent',
        email: '',
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dept-invites', initialDepartment.id] });
      toast({ title: 'Link de convite criado' });
    },
    onError: () => {
      toast({ title: 'Erro ao criar convite', variant: 'destructive' });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dept-invites', initialDepartment.id] });
      toast({ title: 'Convite removido' });
    },
    onError: () => {
      toast({ title: 'Erro ao remover convite', variant: 'destructive' });
    },
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
        .eq('id', initialDepartment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Configurações salvas com sucesso' });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar configurações', variant: 'destructive' });
    },
  });

  const manageMemberMutation = useMutation({
    mutationFn: async ({ profileId, action }: { profileId: string; action: ManageAction }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ department_id: action === 'add' ? initialDepartment.id : null })
        .eq('id', profileId);
      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      void supabase.from('audit_logs').insert({
        action: action === 'add' ? 'ADD_MEMBER' : 'REMOVE_MEMBER',
        entity_id: initialDepartment.id,
        entity_type: 'department',
        user_id: user?.id,
        details: { profile_id: profileId },
      }).catch((err: unknown) => log.warn('[audit] department member change log failed', err));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dept-profiles', initialDepartment.id] });
      void queryClient.invalidateQueries({ queryKey: ['dept-audit', initialDepartment.id] });
    },
    onError: () => {
      toast({ title: 'Erro ao gerenciar membro', variant: 'destructive' });
    },
  });

  return {
    currentUser,
    department: initialDepartment,
    allProfiles,
    loadingProfiles,
    auditLogs,
    loadingAudit,
    invitations,
    loadingInvites,
    createInviteMutation,
    deleteInviteMutation,
    updateWhatsappMutation,
    manageMemberMutation,
    whatsappMode,
    setWhatsappMode,
    whatsappApiKey,
    setWhatsappApiKey,
    whatsappInstanceId,
    setWhatsappInstanceId,
  };
}
