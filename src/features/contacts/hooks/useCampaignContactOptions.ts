import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Contatos disponíveis para o alvo "Seleção manual" (target_type='custom') do
 * diálogo de criação de campanha. Hook de domínio contacts — o componente de
 * UI não acessa o supabase diretamente (check-data-layer: components/pages com
 * teto 0).
 */

export interface CampaignContactOption {
  id: string | null;
  name: string | null;
  phone: string | null;
  company: string | null;
}

export function useCampaignContactOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['campaign-create-dialog', 'contacts'],
    queryFn: async (): Promise<CampaignContactOption[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, company')
        .not('phone', 'is', null)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 300_000,
  });
}
