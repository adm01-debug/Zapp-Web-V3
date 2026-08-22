import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { resolvePublicStorageUrl } from '@/lib/mediaUrl';
import { toast } from 'sonner';
import { unwrapRows } from '@/lib/supabase-helpers';
import { queryKeys } from '@/services/api/queryKeys';
import type { AppRole } from '@/features/auth';

interface ProfileRow {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  nickname: string | null;
  signature: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  access_level: string | null;
  max_chats: number | null;
  can_download: boolean;
  is_active: boolean | null;
  created_at: string;
}

interface UserRoleRow {
  user_id: string;
  role: AppRole;
}

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  details: unknown;
  created_at: string;
}

interface ProfileMini {
  user_id: string;
  name: string;
  email: string | null;
}

/** Hook: User With Role. */
export interface UserWithRole {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  nickname: string | null;
  signature: string | null;
  role: AppRole;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  access_level: string | null;
  max_chats: number | null;
  can_download: boolean;
  is_active: boolean | null;
  created_at: string;
}

/** Hook: Audit Log. */
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  details: unknown;
  created_at: string;
  user?: { name: string; email: string | null } | null;
}

/** Hook: role Config. */
export const roleConfig: Record<AppRole, { label: string; icon: string; color: string }> = {
  dev: { label: 'Desenvolvedor', icon: 'Code', color: 'text-destructive' },
  admin: { label: 'Administrador', icon: 'Crown', color: 'text-warning' },
  manager: { label: 'Gestor', icon: 'Briefcase', color: 'text-primary' },
  supervisor: { label: 'Supervisor', icon: 'UserCog', color: 'text-info' },
  agent: { label: 'Atendente', icon: 'User', color: 'text-muted-foreground' },
};

/** Hook: access Level Config. */
export const accessLevelConfig: Record<string, { label: string; description: string }> = {
  basic: { label: 'Básico', description: 'Acesso apenas aos próprios atendimentos' },
  standard: { label: 'Padrão', description: 'Acesso a atendimentos e contatos atribuídos' },
  advanced: { label: 'Avançado', description: 'Acesso a relatórios e métricas da equipe' },
  full: { label: 'Completo', description: 'Acesso total ao sistema' },
};

/** Papéis aceitos em convite (contrato invite-user@v1 — sem special_agent). */
export type InviteRole = 'admin' | 'supervisor' | 'agent';

/** Payload do convite (Etapa 57.5). */
export interface InviteUserPayload {
  email: string;
  role: InviteRole;
  message?: string;
}

/**
 * Extrai a mensagem de erro honesta do servidor em erros de
 * `supabase.functions.invoke` (supabase-js v2: FunctionsHttpError carrega a
 * Response em `context`). Retorna null quando não há corpo parseável → o
 * chamador usa a mensagem genérica local.
 */
async function extractInvokeErrorMessage(error: unknown): Promise<string | null> {
  if (typeof error !== 'object' || error === null || !('context' in error)) return null;
  const ctx = (error as { context?: unknown }).context as
    { json?: () => Promise<{ error?: string | boolean; message?: string }> } | undefined;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = await ctx.json();
    if (typeof body?.message === 'string' && body.message.length > 0) return body.message;
    return typeof body?.error === 'string' && body.error.length > 0 ? body.error : null;
  } catch {
    return null;
  }
}

/** Hook: use Admin Data. */
export function useAdminData(activeTab: 'users' | 'audit' | 'crm') {
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    if (activeTab === 'users') {
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .order('name')
        .limit(1000);

      const { data: rolesData, error: rolesErr } = await supabase
        .from('user_roles')
        .select('*')
        .limit(1000);

      if (profilesErr) toast.error('Erro ao carregar usuários');
      else if (rolesErr) toast.error('Erro ao carregar permissões');
      else {
        const profiles = unwrapRows<ProfileRow>(profilesData);
        const roles = unwrapRows<UserRoleRow>(rolesData);
        const usersWithRoles: UserWithRole[] = profiles.map((profile) => {
          const userRole = roles.find((r) => r.user_id === profile.user_id);
          return {
            ...profile,
            role: (userRole?.role || 'agent') as AppRole,
          };
        });
        setUsers(usersWithRoles);
      }
    } else if (activeTab === 'audit') {
      const { data: logsData, error: logsErr } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsErr) {
        toast.error('Erro ao carregar logs de auditoria');
      } else {
        const logs = unwrapRows<AuditLogRow>(logsData);
        const userIds = [
          ...new Set(logs.map((l) => l.user_id).filter((id): id is string => id !== null)),
        ];
        const { data: profilesData } =
          userIds.length > 0
            ? await supabase.from('profiles').select('user_id, name, email').in('user_id', userIds)
            : { data: [] };
        const profiles = unwrapRows<ProfileMini>(profilesData);

        const logsWithUsers: AuditLog[] = logs.map((log) => ({
          ...log,
          user: profiles.find((p) => p.user_id === log.user_id) || null,
        }));
        setAuditLogs(logsWithUsers);
      }
    }

    setLoading(false);
  }, [activeTab]);

  const handleRoleChange = useCallback(
    async (userId: string, newRole: AppRole) => {
      // role_key e workspace_id são NOT NULL sem default (schema real); app é single-workspace.
      // Upsert is atomic — avoids the delete-then-insert window where the user has no role.
      const { data: ws } = await safeClient.single<{ id: string }>('workspaces', (q) =>
        q.select('id').order('created_at').limit(1)
      );
      const { error } = await supabase.from('user_roles').upsert(
        {
          user_id: userId,
          role: newRole,
          role_key: newRole,
          workspace_id: ws?.id ?? '',
        },
        { onConflict: 'user_id' }
      );
      if (error) {
        toast.error('Erro ao atualizar role');
      } else {
        toast.success(`Usuário agora é ${roleConfig[newRole].label}.`);
        fetchData();
      }
    },
    [fetchData]
  );

  const handleToggleActive = useCallback(
    async (user: UserWithRole) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);
      if (error) {
        toast.error('Erro ao atualizar status');
      } else {
        toast.success(user.is_active ? 'Usuário desativado' : 'Usuário ativado');
        fetchData();
        void queryClient.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
      }
    },
    [fetchData, queryClient]
  );

  const handleSaveUser = useCallback(
    async (editingUser: UserWithRole, avatarFile: File | null): Promise<boolean> => {
      let avatarUrl = editingUser.avatar_url;
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const filePath = `${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile);
        if (uploadError) {
          toast.error('Erro ao enviar foto');
          return false;
        }
        avatarUrl = resolvePublicStorageUrl('avatars', filePath) ?? null;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          name: editingUser.name,
          nickname: editingUser.nickname,
          signature: editingUser.signature,
          job_title: editingUser.job_title,
          department: editingUser.department,
          phone: editingUser.phone,
          avatar_url: avatarUrl,
          access_level: editingUser.access_level,
          max_chats: editingUser.max_chats ?? undefined,
          can_download: editingUser.can_download,
        })
        .eq('id', editingUser.id);

      if (error) {
        toast.error('Erro ao salvar usuário');
        return false;
      }
      toast.success('Usuário atualizado com sucesso');
      fetchData();
      void queryClient.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.userProfile.me() });
      return true;
    },
    [fetchData, queryClient]
  );

  interface CreateUserPayload {
    name: string;
    nickname?: string;
    signature?: string;
    job_title?: string;
    avatarFile?: File | null;
    email: string;
    password: string;
    role: AppRole;
    google_services?: string[];
    dropbox_email?: string;
  }

  const handleCreateUser = useCallback(
    async (payload: CreateUserPayload): Promise<boolean> => {
      if (!payload.name || !payload.email || !payload.password) {
        toast.error('Preencha todos os campos obrigatórios');
        return false;
      }
      if (payload.password.length < 6) {
        toast.error('A senha deve ter pelo menos 6 caracteres');
        return false;
      }

      let avatarUrl: string | undefined;
      if (payload.avatarFile) {
        const fileExt = payload.avatarFile.name.split('.').pop();
        const filePath = `${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, payload.avatarFile);
        if (uploadError) {
          toast.error('Erro ao fazer upload da foto');
          return false;
        }
        avatarUrl = resolvePublicStorageUrl('avatars', filePath) ?? undefined;
      }

      try {
        // B30 (Etapa 57.2): criação via invoke — headers automáticos, retry,
        // 401 com refresh. NUNCA fetch raw.
        const { data: invokeResult, error: invokeError } = await supabase.functions.invoke(
          'create-user',
          {
            body: {
              name: payload.name,
              nickname: payload.nickname || undefined,
              signature: payload.signature || undefined,
              job_title: payload.job_title || undefined,
              avatar_url: avatarUrl,
              email: payload.email,
              password: payload.password,
              role: payload.role,
              google_services: payload.google_services,
              dropbox_email: payload.dropbox_email || undefined,
            },
          }
        );

        if (invokeError) {
          const serverMsg = await extractInvokeErrorMessage(invokeError);
          toast.error(serverMsg || 'Erro ao criar usuário');
          return false;
        }
        if (!invokeResult?.success) {
          toast.error('Erro ao criar usuário');
          return false;
        }
        toast.success('Usuário criado com sucesso!');
        fetchData();
        void queryClient.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
        return true;
      } catch {
        toast.error('Erro ao criar usuário');
        return false;
      }
    },
    [fetchData, queryClient]
  );

  const handleInviteUser = useCallback(
    async (payload: InviteUserPayload): Promise<boolean> => {
      if (!payload.email?.trim()) {
        toast.error('Email é obrigatório');
        return false;
      }

      try {
        const { data, error } = await supabase.functions.invoke('invite-user', {
          body: {
            email: payload.email.trim(),
            role: payload.role,
            message: payload.message?.trim() || undefined,
          },
        });

        if (error) {
          // Erro honesto do servidor (409 duplicado / 403 não-admin / 429…)
          // exibido verbatim; sem contexto → mensagem genérica.
          const serverMsg = await extractInvokeErrorMessage(error);
          toast.error(serverMsg || 'Erro ao enviar convite');
          return false;
        }
        if (!data?.success) {
          toast.error('Erro ao enviar convite');
          return false;
        }

        toast.success(`Convite enviado para ${payload.email.trim()}!`);
        fetchData();
        void queryClient.invalidateQueries({ queryKey: queryKeys.teamProfiles.all() });
        return true;
      } catch {
        toast.error('Erro ao enviar convite');
        return false;
      }
    },
    [fetchData, queryClient]
  );

  return {
    users,
    auditLogs,
    loading,
    fetchData,
    handleRoleChange,
    handleToggleActive,
    handleSaveUser,
    handleCreateUser,
    handleInviteUser,
  };
}
