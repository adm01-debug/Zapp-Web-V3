/**
 * useExternalEmpresas
 * 
 * Fetches unique company names from the external CRM database
 * using search_contacts_advanced RPC (SECURITY DEFINER) to bypass RLS.
 * Direct queries to 'companies' table are blocked by RLS for anon role.
 */
import { useQuery } from '@tanstack/react-query';
import { getLogger } from '@/lib/logger';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';

const log = getLogger('useExternalEmpresas');

export function useExternalEmpresas() {
  return useQuery<string[]>({
    queryKey: ['external-empresas'],
    queryFn: async () => {
      const allNames: string[] = [];
      const pageSize = 200;
      let page = 0;
      const maxPages = 10; // Safety limit: max 2000 companies

      // Use search_contacts_advanced RPC which has SECURITY DEFINER
      // Fetch multiple pages to build a comprehensive company list
      while (page < maxPages) {
        const { data, error } = await dbRpc(RPC.searchContactsAdvanced, {
          p_search: null,
          p_vendedor: null,
          p_ramo: null,
          p_rfm_segment: null,
          p_estado: null,
          p_cliente_ativado: true, // Filter to get active clients (broad set)
          p_ja_comprou: null,
          p_sort_by: 'name',
          p_page: page,
          p_page_size: pageSize,
        });

        if (error) {
          log.error('Error fetching empresas via RPC:', error);
          break;
        }

        const response = data as { results?: Array<{ company_name?: string }> } | null;
        const results = response?.results || [];

        if (results.length === 0) break;

        for (const r of results) {
          const name = String(r.company_name || '').trim();
          if (name) allNames.push(name);
        }

        // If we got fewer results than page size, we're done
        if (results.length < pageSize) break;
        page++;
      }

      const unique = [...new Set(allNames)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      log.info(`[useExternalEmpresas] Loaded ${unique.length} unique companies via RPC`);
      return unique;
    },
    enabled: isExternalConfigured,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
