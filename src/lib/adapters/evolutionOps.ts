/**
 * evolutionOps — fachada única para edge functions administrativas do provider
 * WhatsApp (E81/I9). Envio de mensagens NÃO mora aqui: use o whatsappAdapter.
 *
 * Regra do gate: nenhum arquivo fora de src/lib/adapters/ pode chamar
 * supabase.functions.invoke de função evolution-*. Ao trocar de provider,
 * este arquivo (e o whatsappAdapter) são os únicos pontos de corte.
 */
import { supabase } from '@/integrations/supabase/client';

type InvokeResult<T = unknown> = { data: T | null; error: Error | null };

async function invokeOps<T = unknown>(fn: string, init?: { method?: string; body?: unknown }): Promise<InvokeResult<T>> {
  const { data, error } = await supabase.functions.invoke(fn, init as never);
  return { data: (data ?? null) as T | null, error: (error ?? null) as Error | null };
}

/** Credenciais da Evolution (save/delete/list) — edge `evolution-credentials`. */
export function evolutionCredentials<T = unknown>(body: Record<string, unknown>) {
  return invokeOps<T>('evolution-credentials', { method: 'POST', body });
}

/** Sincronizações administrativas — edge `evolution-sync`. */
export function evolutionSync<T = unknown>(body: Record<string, unknown>) {
  return invokeOps<T>('evolution-sync', { body });
}

/** Lista templates de mensagem — edge `evolution-templates`. */
export function evolutionTemplatesGet<T = unknown>() {
  return invokeOps<T>('evolution-templates', { method: 'GET' });
}

/** Injeta evento sintético no webhook (ferramenta de monitoração). */
export function evolutionWebhookTest<T = unknown>(body: Record<string, unknown>) {
  return invokeOps<T>('evolution-webhook', { method: 'POST', body });
}

/**
 * @deprecated evolution-proxy é DEPRECATED (E82). Único uso sancionado:
 * ZappWebbDemoPage (admin). Não adicionar novos call sites.
 */
export function evolutionProxyLegacy<T = unknown>(body: Record<string, unknown>) {
  return invokeOps<T>('evolution-proxy', { body });
}
