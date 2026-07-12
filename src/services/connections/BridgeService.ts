import { externalSupabase } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';
import { HealthRow, BridgeStatus } from '@/components/connections/types';

/**
 * Serviço para lidar com a comunicação com o Supabase Externo (Fator X).
 */
export class BridgeService {
  static async checkHealth(): Promise<{ health: HealthRow | null; error: string | null; status: BridgeStatus }> {
    if (!externalSupabase) {
      return { health: null, error: 'Cliente externo não configurado.', status: 'offline' };
    }

    try {
      // Connectivity probe — a successful query proves the external DB is reachable.
      // v_webhook_health view may not exist yet; use a minimal select as ping instead.
      const { error: pingErr } = await externalSupabase
        .from('contacts')
        .select('id')
        .limit(1);

      if (pingErr && (pingErr.message?.includes('does not exist') || pingErr.code === '42P01')) {
        // Table missing but DB is reachable — report online with no health detail
        return { health: null, error: null, status: 'online' };
      }
      if (pingErr) throw pingErr;

      return {
        health: null,
        error: null,
        status: 'online'
      };
    } catch (e) {
      log.error('[BridgeService] health check failed', e);
      return {
        health: null,
        error: e instanceof Error ? e.message : 'Falha ao verificar.',
        status: 'offline'
      };
    }
  }
}
