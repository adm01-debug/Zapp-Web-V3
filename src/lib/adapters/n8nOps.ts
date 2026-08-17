/**
 * n8nOps — fachada única para a edge function zapp-n8n-sync (contrato n8n).
 *
 * Padrão do repo (gate check-edge-function-sync.sh): chamadas a edge functions
 * administrativas passam por src/lib/adapters/ — nomes literais no invoke.
 *
 * Contrato zapp-n8n-sync@v1 (estado HONESTO):
 *   - status 'not_configured' → nada configurado em zapp.n8n_config
 *   - status 'disabled'       → config salva, integração desligada (enabled=false)
 *   - status 'configured'     → config salva e habilitada
 * A edge nunca expõe webhook_secret; a UI não mantém estado local de conexão.
 */
import { supabase } from '@/integrations/supabase/client';

/** Estado real da integração n8n (contrato zapp-n8n-sync@v1). */
export interface N8nSyncStatus {
  ok: boolean;
  configured: boolean;
  status: 'not_configured' | 'disabled' | 'configured';
  baseUrl: string | null;
  updatedAt: string | null;
  error?: string;
}

const UNAVAILABLE: N8nSyncStatus = {
  ok: false,
  configured: false,
  status: 'not_configured',
  baseUrl: null,
  updatedAt: null,
};

async function invokeN8n<T = unknown>(
  body: Record<string, unknown>
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke('zapp-n8n-sync', {
    method: 'POST',
    body,
  } as never);
  return { data: (data ?? null) as T | null, error: (error ?? null) as Error | null };
}

/** Estado real da integração (not_configured honesto quando nada configurado). */
export async function n8nSyncStatus(): Promise<N8nSyncStatus> {
  const { data, error } = await invokeN8n<N8nSyncStatus>({ action: 'status' });
  if (error) return { ...UNAVAILABLE, error: error.message };
  if (!data || data.ok !== true) {
    return { ...UNAVAILABLE, error: 'Resposta inválida da edge zapp-n8n-sync' };
  }
  return data;
}

/**
 * Persiste a URL base da instância n8n. A integração permanece DESLIGADA
 * (enabled=false): nenhum evento é enviado ao n8n até a ativação do pipeline
 * de dispatch — o retorno reflete esse estado (status 'disabled').
 */
export async function n8nSyncConfigure(baseUrl: string): Promise<N8nSyncStatus> {
  const { data, error } = await invokeN8n<N8nSyncStatus>({ action: 'configure', baseUrl });
  if (error) return { ...UNAVAILABLE, error: error.message };
  if (!data || data.ok !== true) {
    return { ...UNAVAILABLE, error: 'Resposta inválida da edge zapp-n8n-sync' };
  }
  return data;
}
