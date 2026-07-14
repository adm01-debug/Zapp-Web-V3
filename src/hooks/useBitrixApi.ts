// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useBitrixApiManagement } from '@/hooks/useIntegrationManagement';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBitrixApi');

export function useBitrixApi() {
  const base = useBitrixApiManagement();
  const [loading, setLoading] = useState(false);

  const syncContactsFromBitrix = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bitrix-api', {
        body: { action: 'syncContacts' },
      });
      if (error || data?.error) return false;
      return true;
    } catch (err) {
      log.error('Bitrix contacts sync failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { ...base, loading, syncContactsFromBitrix };
}
