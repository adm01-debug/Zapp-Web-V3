import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGlobalSettings');

const GLOBAL_SETTINGS_KEY = ['global-settings'] as const;

interface GlobalSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
}

/** Hook: use Global Settings. */
export function useGlobalSettings() {
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: GLOBAL_SETTINGS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .order('key', { ascending: true });
      if (error) throw error;
      return (data as GlobalSetting[]) ?? [];
    },
    staleTime: 60_000,
  });

  const getSetting = useCallback(
    (key: string): string | null => {
      const found = settings.find((s) => s.key === key);
      return found?.value ?? null;
    },
    [settings]
  );

  const updateSetting = useCallback(
    async (key: string, value: string) => {
      try {
        const { error } = await supabase
          .from('global_settings')
          .update({ value })
          .eq('key', key);
        if (error) throw error;
        queryClient.setQueryData(GLOBAL_SETTINGS_KEY, (prev: GlobalSetting[] | undefined) =>
          (prev ?? []).map((s) => (s.key === key ? { ...s, value } : s))
        );
      } catch (err) {
        log.error('Error updating global setting:', err);
        await queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
      }
    },
    [queryClient]
  );

  const addSetting = useCallback(
    async (key: string, value: string, description?: string) => {
      try {
        const { error } = await supabase
          .from('global_settings')
          .insert({ key, value, description });
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
      } catch (err) {
        log.error('Error adding global setting:', err);
      }
    },
    [queryClient]
  );

  return {
    settings,
    isLoading,
    getSetting,
    updateSetting,
    addSetting,
    refetch: () => queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY }),
  };
}
