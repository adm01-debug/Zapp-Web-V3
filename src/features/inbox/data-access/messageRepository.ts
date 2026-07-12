import { dbFrom, dbChannel, dbClient, dbTable, dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { RealtimePostgresChangesPayload, RealtimeChannel } from '@supabase/supabase-js';

export interface Message {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean | null;
  status: 'sent' | 'delivered' | 'read' | 'failed' | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  whatsapp_connection_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
  is_deleted: boolean | null;
  media_meta: any | null;
  contactAvatar: string | null;
}

export const messageRepository = {
  /**
   * Fetch messages with agent profile enrichment (N+1 prevention).
   * Foreign key select includes agent data without separate round-trips.
   * Fallback: if FK select fails, plain select('*') still returns all message fields.
   */
  async fetchMessagesByContact(contactId: string, from = 0, limit = 1000) {
    return dbFrom('messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .range(from, from + limit - 1);
  },

  /**
   * Fetch whisper messages for a contact (UUID only).
   * Uses dedicated query method to avoid ad-hoc Supabase calls in service layer.
   * This ensures consistent error handling and logging for all message sources.
   */
  async fetchWhispersByContact(contactId: string) {
    return dbFrom('whisper_messages')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });
  },

  /**
   * Lista mensagens via RPC SECURITY DEFINER (caminho recomendado para FATOR X).
   * Use em vez de `fetchMessagesByContact` quando tiver o `remote_jid` —
   * bypassa RLS e respeita a regra do projeto (toda leitura de evolution_* via RPC).
   */
  async listByContactJid(remoteJid: string, limit = 1000, offset = 0) {
    return dbList(RPC.listMessagesLite, {
      p_remote_jid: remoteJid,
      p_limit: limit,
      p_offset: offset,
    });
  },

  subscribeToMessages(contactId: string, callbacks: {
    onInsert: (payload: RealtimePostgresChangesPayload<Message>) => void;
    onUpdate: (payload: RealtimePostgresChangesPayload<Message>) => void;
    onDelete: (payload: RealtimePostgresChangesPayload<Message>) => void;
  }) {
    // FATOR X v6.1: Realtime deve apontar para a TABELA-FONTE (evo.evolution_messages).
    // A view compat `public.messages` nao emite eventos postgres_changes.
    const table = 'evolution_messages';
    const channel = dbChannel('messages', `messages:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo',
          table,
          filter: `contact_id=eq.${contactId}`,
        },
        callbacks.onInsert
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          table,
          filter: `contact_id=eq.${contactId}`,
        },
        callbacks.onUpdate
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'evo',
          table,
          filter: `contact_id=eq.${contactId}`,
        },
        callbacks.onDelete
      )
      .subscribe();

    return channel;
  },

  unsubscribe(channel: RealtimeChannel) {
    dbClient('messages').removeChannel(channel);
  }
};
