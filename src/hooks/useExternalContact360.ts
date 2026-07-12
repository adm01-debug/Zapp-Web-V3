/**
 * useExternalContact360
 * 
 * Hook that calls get_contact_360_by_phone on the external CRM database
 * to enrich a zapp-web contact with full 360° data: company, customer profile,
 * RFM, interactions history, social media, stakeholder map, etc.
 */
import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { dbGet } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { Contact360Data } from '@/types/contact360';

const log = getLogger('useExternalContact360');

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function useExternalContact360(phone: string | undefined) {
  const cleanedPhone = phone ? cleanPhone(phone) : '';

  return useQuery<Contact360Data | null>({
    queryKey: ['external-contact-360', cleanedPhone],
    queryFn: async () => {
      if (!cleanedPhone || cleanedPhone.length < 8) return null;

      const { data, error } = await dbGet(RPC.getContact360ByPhone, {
        p_phone: cleanedPhone,
      });

      if (error) {
        log.error('Error fetching external 360:', error);
        return null;
      }

      return data as Contact360Data;
    },
    enabled: isExternalConfigured && !!cleanedPhone && cleanedPhone.length >= 8,
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 30,    // 30 min gc
    retry: 1,
  });
}
