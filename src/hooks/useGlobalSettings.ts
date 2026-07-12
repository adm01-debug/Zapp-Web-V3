import { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGlobalSettings');

export interface GlobalSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Module-level cache shared by every hook instance. global_settings is
// quasi-static (admin-only writes), so we deduplicate fetches with a 5-min
// TTL and a single in-flight promise to eliminate redundant requests.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { rows: GlobalSetting[]; fetchedAt: number } | null = null;
let inflight: Promise<GlobalSetting[]> | null = null;

async function loadSettings(force = false): Promise<GlobalSetting[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rows;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from('global_settings')
      .select('*')
      .order('key');
    if (error) throw error;
    const rows = (data ?? []) as GlobalSetting[];
    cache = { rows, fetchedAt: Date.now() };
    return rows;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function invalidateGlobalSettingsCache() {
  cache = null;
}

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSetting[]>(cache?.rows ?? []);
  const [isLoading, setIsLoading] = useState(!cache);
  const mountedRef = useMountedRef();

  const fetchSettings = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const rows = await loadSettings(force);
      if (mountedRef.current) setSettings(rows);
    } catch (err) {
      log.error('Error fetching global settings:', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const getSetting = useCallback((key: string): string | null => {
    return settings.find((s) => s.key === key)?.value ?? null;
  }, [settings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ value })
        .eq('key', key);
      if (error) throw error;
      invalidateGlobalSettingsCache();
      setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
    } catch (err) {
      log.error('Error updating global setting:', err);
      throw err;
    }
  }, []);

  const addSetting = useCallback(
    async (key: string, value: string, description?: string) => {
      try {
        const { data, error } = await supabase
          .from('global_settings')
          .upsert({ key, value, description }, { onConflict: 'key' })
          .select()
          .single();
        if (error) throw error;
        invalidateGlobalSettingsCache();
        await fetchSettings(true);
        return data;
      } catch (err) {
        log.error('Error adding global setting:', err);
        throw err;
      }
    },
    [fetchSettings],
  );

  return {
    settings,
    isLoading,
    getSetting,
    updateSetting,
    addSetting,
    refetch: () => fetchSettings(true),
  };
}
