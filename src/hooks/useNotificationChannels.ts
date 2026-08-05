import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationChannelConfig {
  id: number;
  channel_name: string;
  enabled: boolean;
  min_severity: string;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type ChannelPatch = Partial<Pick<NotificationChannelConfig, 'enabled' | 'min_severity' | 'config'>>;

interface UseNotificationChannelsReturn {
  channels: NotificationChannelConfig[];
  loading: boolean;
  saving: Record<number, boolean>;
  fetchChannels: () => Promise<void>;
  updateChannel: (id: number, patch: ChannelPatch) => Promise<boolean>;
}

/** Hook for managing notification_channels_config table. */
export function useNotificationChannels(): UseNotificationChannelsReturn {
  const [channels, setChannels] = useState<NotificationChannelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_channels_config')
        .select('*')
        .order('id');

      if (error) throw error;
      setChannels((data as NotificationChannelConfig[]) ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar canais';
      toast.error('Erro ao carregar canais de notificação', { description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  const updateChannel = useCallback(async (id: number, patch: ChannelPatch): Promise<boolean> => {
    setSaving((prev) => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase
        .from('notification_channels_config')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setChannels((prev) =>
        prev.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch))
      );
      toast.success('Canal atualizado com sucesso');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      toast.error('Erro ao atualizar canal', { description: msg });
      return false;
    } finally {
      setSaving((prev) => ({ ...prev, [id]: false }));
    }
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return { channels, loading, saving, fetchChannels, updateChannel };
}
