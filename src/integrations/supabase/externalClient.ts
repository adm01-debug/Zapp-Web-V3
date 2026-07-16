/**
 * External Supabase Client — SHIM DE COMPATIBILIDADE
 *
 * ⚠️ CONSOLIDAÇÃO (2026-07-15): a arquitetura "dois Supabase" (Lovable Cloud +
 * CRM externo) foi eliminada. Todo o app usa **uma única instância**:
 *   https://supabase.atomicabr.com.br  (self-hosted VPS AtomicaBR)
 *   Schema principal: `zapp` — configurado em `client.ts` (db: { schema: 'zapp' })
 *   Schema secundário: `evo` — usado via `.schema('evo')` quando necessário.
 *
 * Este arquivo é mantido como shim para os ~37 arquivos consumidores existentes.
 * Novos módulos devem importar diretamente de `@/integrations/supabase/client`.
 *
 * Comportamento:
 *  - `externalSupabase`, `getExternalSupabase()`  → sempre retornam o `supabase` principal.
 *  - `isExternalConfigured`                        → sempre `true`.
 *  - `updateRuntimeExternalConfig()`               → no-op com deprecation warning.
 *  - `callExtRpc(client, fn, args)`                → wrapper de RPC sem tipagem.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExtendedDatabase } from './types-manual';
import { supabase } from './client';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalClient');

// Aviso único caso o dev ainda esteja setando as envs legadas.
if (
  typeof import.meta !== 'undefined' &&
  import.meta.env?.DEV &&
  (import.meta.env?.VITE_EXTERNAL_SUPABASE_URL || import.meta.env?.VITE_EXTERNAL_SUPABASE_ANON_KEY)
) {
  log.warn(
    'VITE_EXTERNAL_SUPABASE_* estão definidas mas são ignoradas — o app usa apenas o Supabase self-hosted (schema zapp). Remova essas variáveis.'
  );
}

export const externalSupabase: SupabaseClient<ExtendedDatabase> = supabase;
export const isExternalConfigured = true;

export function getIsExternalConfigured(): boolean {
  return true;
}

export function getExternalSupabase(): SupabaseClient<ExtendedDatabase> {
  return supabase;
}

/**
 * @deprecated Single-database desde 2026-07-15. Chamada é ignorada.
 */
export function updateRuntimeExternalConfig(_url?: string, _key?: string): void {
  log.warn(
    'updateRuntimeExternalConfig() é no-op — arquitetura consolidada em um único Supabase self-hosted (schema zapp).'
  );
}

/**
 * Wrapper de RPC para funções cujos nomes não estão na tipagem gerada.
 * Mantido para compat; prefira `supabase.rpc(...)` com tipos gerados.
 */
type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>;

export function callExtRpc(
  client: SupabaseClient<ExtendedDatabase>,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string } | null }> {
  return (client.rpc as unknown as UntypedRpc)(fn, args);
}

/**
 * Retorna o PostgrestBuilder bruto para funções RPC não tipadas,
 * permitindo encadear `.abortSignal()` antes de aguardar o resultado.
 * Use somente quando o builder precisar ser configurado antes de ser resolvido
 * (ex.: cancelamento via AbortController). Para RPCs sem abortSignal, use
 * `callExtRpc` ou adicione a função às tipagens geradas.
 */
type UntypedRpcBuilder = (
  fn: string,
  args: Record<string, unknown>
) => {
  abortSignal?: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
} & Promise<{ data: unknown; error: unknown }>;

export function extRpcBuilder(
  client: SupabaseClient<ExtendedDatabase>,
  fn: string,
  args: Record<string, unknown>
): {
  abortSignal?: (signal: AbortSignal) => Promise<{ data: unknown; error: unknown }>;
} & Promise<{ data: unknown; error: unknown }> {
  return (client.rpc as unknown as UntypedRpcBuilder)(fn, args);
}
