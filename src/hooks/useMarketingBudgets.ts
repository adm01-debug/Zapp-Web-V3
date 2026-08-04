import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/schema';

/** Budget row type (tabela `zapp.budgets` — o client usa schema zapp; public só tem views). */
export type MarketingBudget = Database['zapp']['Tables']['budgets']['Row'];

/**
 * NOTA (CAMPANHAS-13): orçamento marketing WhatsApp — UI mínima (somente leitura).
 * Verificado em 2026-08-04:
 *  - RLS zapp.budgets/public.budgets (canonical 20260804000000): SÓ a policy
 *    `auth_secure_156` (SELECT p/ admin/supervisor). NÃO há policies INSERT/UPDATE/DELETE
 *    → esta UI é READ-ONLY de propósito; editar/criar exige novas policies (sinalizado ao
 *    maestro: criar policies + função zapp.fn_* com fonte no repo).
 *  - Cron `daily-wa-marketing-budget` existe em produção mas NÃO tem fonte nas migrations
 *    do repo (grep = 0) — presumivelmente atualiza current_usd via zapp.fn_*; sinalizado ao
 *    maestro: versionar cron+fn no repo.
 *  - UI: componente MarketingBudgets (Configurações → Orçamento) lista budgets ativos.
 */
export function useMarketingBudgets() {
  return useQuery({
    queryKey: ['marketing-budgets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingBudget[];
    },
    staleTime: 60_000,
  });
}
