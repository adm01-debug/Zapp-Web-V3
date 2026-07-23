
/**
 * External Supabase Client — SHIM DE COMPATIBILIDADE
 *
 * ⚠️ CONSOLIDAÇÃO (2026-07-15): arquitetura "dois Supabase" eliminada.
 * Todo o app usa uma única instância: https://supabase.atomicabr.com.br
 * Schema principal: `zapp` — configurado em `client.ts`.
 *
 * Este arquivo é mantido como shim para os ~37 arquivos consumidores.
 * Novos módulos devem importar de `@/integrations/supabase/client`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtendedDatabase } from './types-manual';
import { supabase } from './client';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalClient');

if (
  typeof import.meta !== 'undefined' &&
  import.meta.env?.DEV &&
  (import.meta.env?.VITE_EXTERNAL_SUPABASE_URL ||
    import.meta.env?.VITE_EXTERNAL_SUPABASE_ANON_KEY)
) {
  log.warn('VITE_EXTERNAL_SUPABASE_* são ignoradas — use apenas o Supabase self-hosted (schema zapp).');
}

/** Shim: sempre retorna o cliente principal. */
export const externalSupabase: SupabaseClient<ExtendedDatabase> =
  supabase as unknown as SupabaseClient<ExtendedDatabase>;

/** Shim: sempre true. */
export const isExternalConfigured = true;

/** Shim: sempre true. */
export function getIsExternalConfigured(): boolean {
  return true;
}

/** Shim: delega para o cliente principal. */
export function getExternalSupabase(): SupabaseClient<ExtendedDatabase> {
  return supabase as unknown as SupabaseClient<ExtendedDatabase>;
}

/** @deprecated No-op desde 2026-07-15. */
export function updateRuntimeExternalConfig(_url?: string, _key?: string): void {
  log.warn('updateRuntimeExternalConfig() é no-op — arquitetura consolidada.');
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Wrapper de RPC para funções não tipadas. */
export function callExtRpc(
  client: SupabaseClient<ExtendedDatabase, 'zapp' | 'public' | 'evo'>,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string } | null }> {
  return (client.rpc as unknown as UntypedRpc)(fn, args);
}

type UntypedRpcBuilder = (fn: string, args: Record<string, unknown>) => {
  abortSignal?: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
} & Promise<{ data: unknown; error: unknown }>;

/** Retorna o builder bruto para encadear .abortSignal() antes de aguardar. */
export function extRpcBuilder(
  client: SupabaseClient<ExtendedDatabase>,
  fn: string,
  args: Record<string, unknown>
): {
  abortSignal?: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
} & Promise<{ data: unknown; error: unknown }> {
  return (client.rpc as unknown as UntypedRpcBuilder)(fn, args);
}
