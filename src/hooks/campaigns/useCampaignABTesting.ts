/**
 * NOTA (CAMPANHAS-02, atualizada E62 2026-08-18): teste A/B agora é engine real.
 *  - RLS de escrita em campaign_ab_variants (INSERT/UPDATE/DELETE dono/admin)
 *    entregue pela migration 20260818210000 (era só SELECT → 403 em
 *    addVariant/deleteVariant/declareWinner).
 *  - Engine A/B: seleção ponderada por destinatário (weights) + persistência
 *    atômica/idempotente via RPC `rpc_campaign_assign_variant`
 *    (migration 20260818230000; coluna variant em campaign_contacts/
 *    talkx_recipients na 20260818220000).
 *  - Agregação por variante: colunas send_count/delivered_count/read_count/
 *    response_count de campaign_ab_variants, atualizadas pelo dispatcher.
 */
// Re-export from consolidated useBusinessLogicManagement module (ETAPA 25 consolidation)
import { useBusinessLogicCampaignsManagement } from '@/features/business-logic/hooks/useBusinessLogicManagement';
import type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult } from '@/features/business-logic/hooks/useBusinessLogicManagement';

/** Hook: use Campaign ABTesting. */
export function useCampaignABTesting(
  params: UseBusinessLogicCampaignsParams | string
): UseBusinessLogicCampaignsResult {
  return useBusinessLogicCampaignsManagement(
    typeof params === 'string' ? { campaignId: params } : params
  );
}

/** Re-exported module members. */
export { useBusinessLogicCampaignsManagement };
/** Re-exported module members. */
export type { ABVariant, UseBusinessLogicCampaignsParams, UseBusinessLogicCampaignsResult };
