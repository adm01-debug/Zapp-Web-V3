import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGlobalSettings');

interface GlobalSetting {
  id: string;
  key: string;
  value: string;
  description?: string;
}

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .order('key', { ascending: true });
      if (error) throw error;
      setSettings(data || []);
    } catch (err) {
      log.error('Error fetching global settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = useCallback(
    (key: string): string | null => {
      const found = settings.find((s) => s.key === key);
      return found?.value ?? null;
    },
    [settings]
  );

  const updateSetting = useCallback(async (id: string, value: string) => {
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ value })
        .eq('id', id);
      if (error) throw error;
      setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, value } : s)));
    } catch (err) {
      log.error('Error updating global setting:', err);
    }
  }, []);

  const addSetting = useCallback(async (key: string, value: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .insert({ key, value, description })
        .select()
        .single();
      if (error) throw error;
      if (data) setSettings((prev) => [...prev, data as GlobalSetting]);
    } catch (err) {
      log.error('Error adding global setting:', err);
    }
  }, []);

  return { settings, isLoading, getSetting, updateSetting, addSetting, refetch: fetchSettings };
}
