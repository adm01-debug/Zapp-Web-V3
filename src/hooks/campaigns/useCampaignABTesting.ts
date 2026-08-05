/**
 * NOTA (CAMPANHAS-02): teste A/B é SÓ dado — verificado em 2026-08-04.
 *  - O CRUD de variantes (addVariant/deleteVariant/declareWinner) persiste em
 *    zapp.campaign_ab_variants e o componente CampaignABTesting está íntegro no UI.
 *  - PORÉM: RLS campaign_ab_variants (canonical 20260804000000) tem SÓ `campaign_ab_select`
 *    (SELECT). Policies INSERT/UPDATE/DELETE FALTAM → addVariant/deleteVariant/declareWinner
 *    falham com 403. Sinalizado ao maestro: criar policies.
 *  - Engine estatístico INEXISTENTE: nenhum edge lê campaign_ab_variants (talkx-send ignora
 *    variantes; não há edge de disparo de campanha clássica — ver NOTA CAMPANHAS-01). Não há
 *    split de audiência nem coleta de send/delivered/read/response por variante no backend.
 *    Sinalizado ao maestro: engine estatístico + dispatch por variante quando o motor de
 *    disparo (CAMPANHAS-01) existir.
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
