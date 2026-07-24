
/**
 * Connections Repository
 *
 * Data access layer for connections (WhatsApp, channels, etc).
 * Direct Supabase access only - no business logic.
 */

import { supabase } from '@/integrations/supabase/client';
import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

/** Whats App Connection interface — matches zapp.whatsapp_connections physical columns. */
export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  instance_id?: string;
  instance_name?: string;
  status?: 'connected' | 'disconnected' | 'connecting' | 'qr_pending' | 'logged_out';
  qr_code?: string;
  is_default?: boolean;
  created_by?: string;
  is_active?: boolean;
  last_connected_at?: string;
  health_status?: string;
  health_reason?: string;
  health_response_ms?: number;
  last_health_check?: string;
  api_type?: string;
  routing_mode?: string;
  owner_jid?: string;
  created_at: string;
  updated_at: string;
}

/** Channel Connection interface — matches zapp.channel_connections physical columns. */
export interface ChannelConnection {
  id: string;
  channel_type: string;
  name: string;
  status: string;
  is_active?: boolean | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  credentials?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
  external_account_id?: string | null;
  external_page_id?: string | null;
  webhook_url?: string | null;
  whatsapp_connection_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Connection interface definition — used for whatsapp_connections display. */
export interface Connection {
  id: string;
  name?: string;
  status?: 'connected' | 'disconnected' | 'connecting' | 'qr_pending' | 'logged_out';
  created_at: string;
  updated_at: string;
}

// whatsapp_connections is a physical table in zapp schema; realtime subscription must use 'zapp'.
const whatsappBaseService = createService<WhatsAppConnection>('whatsapp_connections', { realtimeSchema: 'zapp' });

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
      .from('channel_connections')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    return { data: data || [], error, count };
  },

  async getChannelConnection(id: string) {
    const { data, error } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    return { data, error };
  },

  // Connection health
  async checkConnectionHealth(connectionId: string) {
    try {
      const { data, error } = await supabase
        .from('whatsapp_connections')
        .select('status, health_status, health_reason')
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
