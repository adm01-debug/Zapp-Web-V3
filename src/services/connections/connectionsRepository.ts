
/**
 * Connections Repository
 *
 * Data access layer for connections (WhatsApp, channels, etc).
 * Direct Supabase access only - no business logic.
 */

import { supabase } from '@/integrations/supabase/client';
import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

/** Whats App Connection interface. */
export interface WhatsAppConnection {
  id: string;
  instance_name: string;
  account_id: string;
  session_id?: string;
  phone_number?: string;
  qr_code?: string;
  connection_status: 'connected' | 'disconnected' | 'qr_pending' | 'error';
  last_connected_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/** Channel Connection interface definition. */
export interface ChannelConnection {
  id: string;
  channel_type: string;
  account_id: string;
  connection_status: 'connected' | 'disconnected' | 'error';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credentials?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/** Connection interface definition. */
export interface Connection {
  id: string;
  name?: string;
  type: 'whatsapp' | 'channel';
  status: 'connected' | 'disconnected' | 'error';
  account_id: string;
  created_at: string;
  updated_at: string;
}

// WhatsApp connections base service
const whatsappBaseService = createService<WhatsAppConnection>('whatsapp_connections');

/** connections Repository constant. */
export const connectionsRepository = {
  // WhatsApp Connections
  listWhatsAppConnections: (filters?: Partial<WhatsAppConnection> & QueryParams) =>
    whatsappBaseService.list(filters),

  getWhatsAppConnection: (id: string) => whatsappBaseService.get(id),

  searchWhatsAppConnections: (query: string) => whatsappBaseService.search(query),

  createWhatsAppConnection: (data: Partial<WhatsAppConnection>) => whatsappBaseService.create(data),

  updateWhatsAppConnection: (id: string, updates: Partial<WhatsAppConnection>) =>
    whatsappBaseService.update(id, updates),

  deleteWhatsAppConnection: (id: string) => whatsappBaseService.delete(id),

  deleteWhatsAppConnectionsBulk: (ids: string[]) =>
    Promise.all(ids.map((id) => whatsappBaseService.delete(id))),

  // Channel connections
  async listChannelConnections(filters?: Partial<ChannelConnection> & QueryParams) {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;
    const { data, error, count } = await supabase
      .from('whatsapp_connections')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    return { data: data || [], error, count };
  },

  async getChannelConnection(id: string) {
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

    return { data, error };
  },

  // Connection health
  async checkConnectionHealth(connectionId: string) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('connection_status, error_message')
        .eq('id', connectionId)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (error) return { data: null, error };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err as Error };
    }
  },

  // Realtime subscriptions
  subscribeToConnectionChanges: (callback: (connection: WhatsAppConnection) => void) =>
    whatsappBaseService.subscribe(callback),
};
