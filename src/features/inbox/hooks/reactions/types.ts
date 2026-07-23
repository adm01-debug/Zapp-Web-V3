/** Single emoji reaction record from the message_reactions table, referencing either an authenticated agent (user_id) or an inbound contact (contact_id). */
export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string | null;
  contact_id: string | null;
  emoji: string;
  created_at: string;
  user_name?: string;
}

/** Configuration for per-message reaction hooks: Evolution instance name, contact JID, external WhatsApp message ID, sender type, refresh trigger, and realtime opt-out flag. */
export interface UseMessageReactionsOptions {
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
  refreshKey?: string;
  disableRealtime?: boolean;
}
