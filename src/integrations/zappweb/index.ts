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

export { useZappConversations } from './hooks/useZappConversations';
export { useZappMessages } from './hooks/useZappMessages';
export { useZappContactSearch } from './hooks/useZappContactSearch';
