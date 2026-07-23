import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

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

const GEO_KEY = ['geo-blocking'] as const;

/** Manages geographic blocking settings with whitelist and blacklist country controls. */
export function useGeoBlocking() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [countryToRemove, setCountryToRemove] = useState<Country | null>(null);
  const [activeTab, setActiveTab] = useState<'whitelist' | 'blacklist'>('whitelist');

  const { data, isLoading: loading } = useQuery({
    queryKey: GEO_KEY,
    queryFn: async () => {
      const [settingsResult, allowedResult, blockedResult] = await Promise.all([
        supabase.from('geo_blocking_settings').select('*').limit(1).maybeSingle(),
        supabase.from('allowed_countries').select('*').order('created_at', { ascending: false }),
        supabase.from('blocked_countries').select('*').order('created_at', { ascending: false }),
      ]);

      if (settingsResult.error) log.error('Error fetching geo settings:', settingsResult.error);
      if (allowedResult.error) log.error('Error fetching allowed countries:', allowedResult.error);
      if (blockedResult.error) log.error('Error fetching blocked countries:', blockedResult.error);

      return {
        settings: (settingsResult.data || null) as GeoSettings | null,
        allowedCountries: (allowedResult.data || []) as Country[],
        blockedCountries: (blockedResult.data || []) as Country[],
      };
    },
    staleTime: 30_000,
  });

  const settings = data?.settings ?? null;
  const allowedCountries = data?.allowedCountries ?? [];
  const blockedCountries = data?.blockedCountries ?? [];

  /** Updates the geo-blocking mode column and refreshes the settings. */
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
      void queryClient.invalidateQueries({ queryKey: GEO_KEY });
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

  /** Inserts a country record into the allowed or blocked list based on the active tab. */
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
      void queryClient.invalidateQueries({ queryKey: GEO_KEY });
    } catch (error) {
      log.error('Error adding country:', error);
      toast.error('Erro ao adicionar país');
    }
  };

  /** Deletes `countryToRemove` from the appropriate allowed/blocked table. */
  const handleRemoveCountry = async () => {
    if (!countryToRemove) return;
    try {
      const { error } =
        activeTab === 'whitelist'
          ? await supabase.from('allowed_countries').delete().eq('id', countryToRemove.id)
          : await supabase.from('blocked_countries').delete().eq('id', countryToRemove.id);
      if (error) throw error;
      toast.success(`${countryToRemove.country_name} removido`);
      setCountryToRemove(null);
      void queryClient.invalidateQueries({ queryKey: GEO_KEY });
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
