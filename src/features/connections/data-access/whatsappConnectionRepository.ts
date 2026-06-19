import { supabase } from '@/integrations/supabase/client';
import {
  getWhatsappConnections,
  invalidateWhatsappConnectionsCache,
} from '@/lib/whatsappConnectionsCache';

export const whatsappConnectionRepository = {
  /**
   * Reads go through the module-level cache (30s TTL + in-flight dedup).
   * Shape preserved as `{ data, error }` so existing callers don't change.
   */
  async fetchConnections() {
    try {
      const rows = await getWhatsappConnections();
      return { data: rows, error: null as null | Error };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  },

  async updateConnection(id: string, updates: any) {
    const res = await supabase
      .from('whatsapp_connections')
      .update(updates)
      .eq('id', id);
    invalidateWhatsappConnectionsCache();
    return res;
  },

  async insertConnection(data: any) {
    const res = await supabase.from('whatsapp_connections').insert(data).select().single();
    invalidateWhatsappConnectionsCache();
    return res;
  },

  async logQrAttempt(data: any) {
    return supabase.from('qr_attempts').insert(data).select('id').single();
  },

  async updateQrAttempt(id: string, updates: any) {
    return supabase.from('qr_attempts').update(updates).eq('id', id);
  },

  async callEvolutionApi(body: any) {
    return supabase.functions.invoke('evolution-api', { body });
  },

  async callEvolutionApiV2(path: string, options: any) {
    return supabase.functions.invoke(path, options);
  }
};
