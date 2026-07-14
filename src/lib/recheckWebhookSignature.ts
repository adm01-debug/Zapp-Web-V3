/**
 * Client helper para a edge function `recheck-webhook-signature`.
 * Recomputa o HMAC de um evento e devolve o diagnóstico — sem gravar nada.
 */
import { supabase } from '@/integrations/supabase/client';

export interface RecheckResult {
  event_id: string;
  instance_name: string | null;
  event_type: string | null;
  created_at: string | null;
  secret_configured: boolean;
  observed_signature: string | null;
  computed_signature: string | null;
  signature_valid: boolean | null;
  reason: string;
}

export async function recheckWebhookSignature(eventId: string): Promise<RecheckResult> {
  const { data, error } = await supabase.functions.invoke('recheck-webhook-signature', {
    body: { event_id: eventId },
  });
  if (error) throw new Error(error.message || 'Falha ao revalidar assinatura');
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as RecheckResult; // ignore-audit: narrows Supabase query result to local interface
}
