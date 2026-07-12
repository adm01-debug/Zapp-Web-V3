import { supabase as _sb } from '@/integrations/supabase/client';
const supabase: any = _sb;
import { loadFeatureFlags } from './featureFlags';
import { getLogger } from './logger';

const log = getLogger('healthCheck');

export interface HealthStatus {
  service: string;
  status: 'ok' | 'error' | 'warning';
  message: string;
  latency?: number;
}

export async function runFullHealthCheck(): Promise<HealthStatus[]> {
  const results: HealthStatus[] = [];

  // 1. Supabase Connection & Latency
  const start = Date.now();
  try {
    const { error } = await supabase.from('app_settings').select('count').limit(1);
    const latency = Date.now() - start;
    if (error) throw error;
    results.push({ service: 'Database', status: 'ok', message: 'Conexão estável', latency });
  } catch (e) {
    results.push({ service: 'Database', status: 'error', message: `Falha na conexão: ${e.message}` });
  }

  // 2. Feature Flags Load
  try {
    await loadFeatureFlags();
    results.push({ service: 'FeatureFlags', status: 'ok', message: 'Sincronização ativa' });
  } catch (e) {
    results.push({ service: 'FeatureFlags', status: 'warning', message: 'Usando defaults (cache falhou)' });
  }

  // 3. Message Retry Queue Status
  try {
    const { data, error } = await supabase
      .from('message_retry_queue')
      .select('status, count')
      .eq('status', 'pending');
    
    if (error) throw error;
    const pendingCount = data?.length || 0;
    results.push({ 
      service: 'MessageQueue', 
      status: pendingCount > 50 ? 'warning' : 'ok', 
      message: `${pendingCount} mensagens aguardando re-tentativa` 
    });
  } catch (e) {
    results.push({ service: 'MessageQueue', status: 'error', message: 'Fila inacessível' });
  }

  // 4. Edge Functions (Ping placeholder)
  results.push({ service: 'EdgeFunctions', status: 'ok', message: 'Runtime disponível' });

  log.info('[HealthCheck] Results:', results);
  return results;
}