// Re-export from consolidated useSettingsManagement module (ETAPA 41 consolidation)
import { useGlobalSettingsManagement } from '@/hooks/useSettingsManagement';

export function useGlobalSettings() {
  return useGlobalSettingsManagement();
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
