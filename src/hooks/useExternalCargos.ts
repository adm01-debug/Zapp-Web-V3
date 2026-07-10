/**
 * useExternalCargos
 * 
 * Fetches unique job titles/roles from the external CRM database.
 * - salespeople.role: accessible directly (no RLS blocking anon)
 * - contacts.cargo: blocked by RLS, so we extract from search_contacts_advanced RPC
 */
import { useQuery } from '@tanstack/react-query';
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { log } from '@/lib/logger';

export function useExternalCargos() {
  return useQuery<string[]>({
    queryKey: ['external-cargos'],
    queryFn: async () => {
      const allCargos: string[] = [];

      // 1. Fetch from salespeople.role (accessible - no RLS blocking)
      const { data: salesRoles, error: e1 } = await getExternalSupabase()
        .from('salespeople')
        .select('role')
        .not('role', 'is', null)
        .limit(500);

      if (e1) {
        log.error('Error fetching roles from salespeople:', e1);
      } else {
        (salesRoles || []).forEach((r: Record<string, unknown>) => {
          const v = String(r.role || '').trim();
          if (v) allCargos.push(v);
        });
      }

      // 2. Extract cargos from search_contacts_advanced RPC (bypasses RLS)
      const { data: searchData, error: e2 } = await dbRpc(RPC.searchContactsAdvanced, {
        p_search: null,
        p_vendedor: null,
        p_ramo: null,
        p_rfm_segment: null,
        p_estado: null,
        p_cliente_ativado: true,
        p_ja_comprou: null,
        p_sort_by: 'name',
        p_page: 0,
        p_page_size: 200,
      });

      if (e2) {
        log.error('Error fetching cargos via RPC:', e2);
      } else {
        const results = (searchData as Record<string, unknown>)?.results as Record<string, unknown>[] || [];
        for (const r of results) {
          const v = String(r.cargo || '').trim();
          if (v) allCargos.push(v);
        }
      }

      const unique = [...new Set(allCargos)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      log.info(`[useExternalCargos] Loaded ${unique.length} unique cargos`);
      return unique;
    },
    enabled: isExternalConfigured,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
