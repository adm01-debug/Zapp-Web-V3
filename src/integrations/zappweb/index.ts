/**
 * Zap Webb — entrada pública.
 *
 * Arquitetura (ver docs/HANDOFF_LOVABLE_ZAP_WEBB.md):
 *   • LEITURA  → zappSupabase  (PostgREST + Realtime self-hosted)
 *   • ESCRITA  → evolutionClient (Evolution API HTTP)
 *   • MÍDIA    → media_url já vem do proxy Cloudflare R2
 */
export { zappSupabase, ZAPPWEB_INSTANCE, ZAPPWEB_CONFIG } from './supabaseClient';

export {
  sendText,
  sendMedia,
  sendWhatsAppAudio,
  markChatRead,
  fetchInstances,
  getConnectionState as connectionState,
  getEvolutionCredentials,
  stripJid,
} from './evolutionClient';

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
