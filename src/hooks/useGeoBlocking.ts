import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { useMountedRef } from '@/hooks/useMountedRef';

const log = getLogger('useGeoBlocking');

interface Country {
  id: string;
  country_code: string;
  country_name: string;
  added_by?: string | null;
  blocked_by?: string | null;
  reason?: string | null;
  created_at: string;
}

interface GeoSettings {
  id: string;
  mode: 'disabled' | 'whitelist' | 'blacklist';
}

/** Manages geographic blocking settings with whitelist and blacklist country controls. */
export function useGeoBlocking() {
  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [allowedCountries, setAllowedCountries] = useState<Country[]>([]);
  const [blockedCountries, setBlockedCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [countryToRemove, setCountryToRemove] = useState<Country | null>(null);
  const [activeTab, setActiveTab] = useState<'whitelist' | 'blacklist'>('whitelist');
  const mountedRef = useMountedRef();

  /** Loads geo-blocking settings and both allowed/blocked country lists from Supabase; no-ops after component unmount. */
  const fetchData = async () => {
    try {
      const { data: settingsData } = await supabase
        .from('geo_blocking_settings')
        .select('*')
        .limit(1)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      const { data: allowedData } = await supabase
        .from('allowed_countries')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: blockedData } = await supabase
        .from('blocked_countries')
        .select('*')
        .order('created_at', { ascending: false });

      if (!mountedRef.current) return;
      if (settingsData) setSettings(settingsData as GeoSettings);
      setAllowedCountries(allowedData || []);
      setBlockedCountries(blockedData || []);
    } catch (error) {
      log.error('Error fetching geo data:', error);
      if (mountedRef.current) toast.error('Erro ao carregar dados');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  /** Updates the geo-blocking mode column and reflects the change in local settings state. */
  const handleModeChange = async (mode: 'disabled' | 'whitelist' | 'blacklist') => {
    if (!settings) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('geo_blocking_settings')
        .update({ mode, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      if (error) throw error;
      setSettings({ ...settings, mode });
      const modeLabels = {
        disabled: 'Desativado',
        whitelist: 'Whitelist (apenas permitidos)',
        blacklist: 'Blacklist (bloqueados)',
      };
      toast.success(`Modo alterado para: ${modeLabels[mode]}`);
    } catch (error) {
      log.error('Error updating mode:', error);
      toast.error('Erro ao alterar modo');
    }
  };

  /** Inserts a country record into the allowed or blocked list based on the active tab; shows a friendly toast on duplicate (code 23505) and refreshes the lists on success. */
  const handleAddCountry = async (countryCode: string, countryName: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } =
        activeTab === 'whitelist'
          ? await supabase
              .from('allowed_countries')
              .insert({ country_code: countryCode, country_name: countryName, added_by: user?.id })
          : await supabase.from('blocked_countries').insert({
              country_code: countryCode,
              country_name: countryName,
              blocked_by: user?.id,
            });
      if (error) {
        if (error.code === '23505') {
          toast.error('Este país já está na lista');
          return;
        }
        throw error;
      }
      toast.success(
        `${countryName} adicionado à ${activeTab === 'whitelist' ? 'whitelist' : 'blacklist'}`
      );
      setDialogOpen(false);
      setSelectedCountry('');
      fetchData();
    } catch (error) {
      log.error('Error adding country:', error);
      toast.error('Erro ao adicionar país');
    }
  };

  /** Deletes `countryToRemove` from the appropriate allowed/blocked table and refreshes the country lists. */
  const handleRemoveCountry = async () => {
    if (!countryToRemove) return;
    try {
      const { error } = activeTab === 'whitelist'
        ? await supabase.from('allowed_countries').delete().eq('id', countryToRemove.id)
        : await supabase.from('blocked_countries').delete().eq('id', countryToRemove.id);
      if (error) throw error;
      toast.success(`${countryToRemove.country_name} removido`);
      setCountryToRemove(null);
      fetchData();
    } catch (error) {
      log.error('Error removing country:', error);
      toast.error('Erro ao remover país');
    }
  };

  return {
    settings,
    allowedCountries,
    blockedCountries,
    loading,
    dialogOpen,
    setDialogOpen,
    selectedCountry,
    setSelectedCountry,
    countryToRemove,
    setCountryToRemove,
    activeTab,
    setActiveTab,
    handleModeChange,
    handleAddCountry,
    handleRemoveCountry,
  };
}