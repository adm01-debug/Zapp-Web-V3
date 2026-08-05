import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/schema';
import { queryKeys } from '@/services/api/queryKeys';
import { toast } from 'sonner';

// DASHBOARD-08 — UI admin para zapp.notification_channels_config / zapp.notification_templates.
//
// SINALIZAÇÕES (fora do escopo desta branch — exigem migration):
//  1. `notification_channels_config.config` é NOT NULL — ao limpar o JSON, enviar {} (objeto vazio),
//     nunca null (23502).
//  2. Executor de envio NÃO foi criado (proposital): estas tabelas só CONFIGURAM canais e
//     templates. Falta uma edge/worker que leia notification_channels_config +
//     notification_templates e efetivamente envie (WhatsApp/email/push). Sem executor,
//     salvar config aqui não dispara nada.

/** Row tipada via types.ts — tabelas físicas em zapp (public só expõe Views). */
export type NotificationChannelConfig = Database['zapp']['Tables']['notification_channels_config']['Row'];
export type NotificationTemplate = Database['zapp']['Tables']['notification_templates']['Row'];

export interface NotificationChannelInput {
  id?: number | null;
  channel_name: string;
  enabled: boolean;
  min_severity?: string | null;
  config?: Database['zapp']['Tables']['notification_channels_config']['Insert']['config'] | null;
}

export interface NotificationTemplateInput {
  id?: string | null;
  name: string;
  channel?: string | null;
  subject?: string | null;
  body_template: string;
  variables?: Database['zapp']['Tables']['notification_templates']['Insert']['variables'] | null;
  is_active: boolean;
  workspace_id?: string | null;
}

const CHANNELS_KEY = queryKeys.adminOps.notificationChannels();
const TEMPLATES_KEY = queryKeys.adminOps.notificationTemplates();

/** CRUD de canais de notificação + templates (zapp.notification_channels_config / zapp.notification_templates). */
export function useNotificationChannels() {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: async (): Promise<NotificationChannelConfig[]> => {
      const { data, error } = await supabase
        .from('notification_channels_config')
        .select('*')
        .order('channel_name', { ascending: true });
      if (error) throw error;
      return (data as NotificationChannelConfig[]) ?? [];
    },
    staleTime: 30_000,
  });

  const templatesQuery = useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async (): Promise<NotificationTemplate[]> => {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as NotificationTemplate[]) ?? [];
    },
    staleTime: 30_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
    void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
  }, [queryClient]);

  const refetch = useCallback(() => {
    void channelsQuery.refetch();
    void templatesQuery.refetch();
  }, [channelsQuery, templatesQuery]);

  const saveChannel = useMutation({
    mutationFn: async (input: NotificationChannelInput) => {
      const payload: Database['zapp']['Tables']['notification_channels_config']['Update'] = {
        channel_name: input.channel_name,
        enabled: input.enabled,
        ...(input.min_severity ? { min_severity: input.min_severity } : {}),
        ...(input.config !== undefined ? { config: input.config ?? {} } : {}),
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id != null
        ? await supabase.from('notification_channels_config').update(payload).eq('id', input.id)
        : await supabase.from('notification_channels_config').insert({
            channel_name: input.channel_name,
            enabled: input.enabled,
            ...(input.min_severity ? { min_severity: input.min_severity } : {}),
            ...(input.config !== undefined ? { config: input.config ?? {} } : {}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Canal de notificação salvo');
    },
    onError: (err: Error) => {
      toast.error('Erro ao salvar canal', { description: err.message });
    },
  });

  const deleteChannel = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('notification_channels_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Canal removido');
    },
    onError: (err: Error) => {
      toast.error('Erro ao remover canal', { description: err.message });
    },
  });

  const saveTemplate = useMutation({
    mutationFn: async (input: NotificationTemplateInput) => {
      const payload: Database['zapp']['Tables']['notification_templates']['Update'] = {
        name: input.name,
        ...(input.channel ? { channel: input.channel } : {}),
        subject: input.subject ?? null,
        body_template: input.body_template,
        variables: input.variables ?? null,
        is_active: input.is_active,
        workspace_id: input.workspace_id ?? null,
      };
      const { error } = input.id
        ? await supabase.from('notification_templates').update(payload).eq('id', input.id)
        : await supabase.from('notification_templates').insert({
            name: input.name,
            ...(input.channel ? { channel: input.channel } : {}),
            subject: input.subject ?? null,
            body_template: input.body_template,
            variables: input.variables ?? null,
            is_active: input.is_active,
            workspace_id: input.workspace_id ?? null,
            created_at: new Date().toISOString(),
          });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Template de notificação salvo');
    },
    onError: (err: Error) => {
      toast.error('Erro ao salvar template', { description: err.message });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notification_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Template removido');
    },
    onError: (err: Error) => {
      toast.error('Erro ao remover template', { description: err.message });
    },
  });

  return {
    channels: channelsQuery.data ?? [],
    channelsLoading: channelsQuery.isLoading,
    channelsError: channelsQuery.error,
    templates: templatesQuery.data ?? [],
    templatesLoading: templatesQuery.isLoading,
    templatesError: templatesQuery.error,
    saveChannel,
    deleteChannel,
    saveTemplate,
    deleteTemplate,
    refetch,
  };
}
