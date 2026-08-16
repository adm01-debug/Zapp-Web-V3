/**
 * Zap Webb — entrada pública.
 *
 * Arquitetura (ver docs/HANDOFF_LOVABLE_ZAP_WEBB.md):
 *   • LEITURA  → zappSupabase  (PostgREST + Realtime self-hosted)
 *   • ESCRITA  → evolutionClient (Evolution API HTTP)
 *   • MÍDIA    → media_url já vem do proxy Cloudflare R2
 */
export { zappSupabase, ZAPPWEB_INSTANCE, ZAPPWEB_CONFIG } from './supabaseClient';

// V3 2026-08-14: exports do evolutionClient removidos do barrel.
// ZappWebbDemoPage usa whatsappAdapter.sendText + evolutionOps.evolutionChatMarkRead (E82).
// evolutionClient.ts arquivado em src/_archive/ — ver PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md etapa 23.

/** Re-exported module members. */
export type {
  EvolutionContact,
  EvolutionConversation,
  EvolutionMessage,
  WhatsAppMessageType,
  MessageStatus,
  ConversationStatus,
  ConversationPriority,
  LeadStatus,
} from './types';

/** Re-exported module members. */
export { useZappConversations } from './hooks/useZappConversations';
/** Re-exported module members. */
export { useZappMessages } from './hooks/useZappMessages';
/** Re-exported module members. */
export { useZappContactSearch } from './hooks/useZappContactSearch';
