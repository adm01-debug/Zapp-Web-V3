/**
 * queryErrors.ts — classificacao centralizada de erros de query permanentes.
 *
 * REGRA: erros permanentes NUNCA devem gerar retry. Eles serao iguais na
 * proxima tentativa e so geram ruido no console, saturacao no banco e
 * experiencia degradada para o usuario.
 *
 * Erros classificados como permanentes:
 *  - HTTP 401 / 403  — auth/permission no nivel HTTP (edge functions, PostgREST)
 *  - PGRST301        — GoTrue "JWT expired" ou "JWT invalid"
 *  - 42501           — PostgreSQL permission denied (sem campo status)
 *  - 42P01 / 42883   — relacao ou funcao inexistente (schema drift)
 *  - Mensagens textuais: permission denied, must be owner, insufficient privilege
 *
 * Exportado como funcao PURA (sem side effects) para uso em:
 *  - AppProviders.tsx (QueryClient defaultOptions.queries.retry)
 *  - queryFactory.ts  (createListQuery, createDetailQuery, etc)
 *  - useAgents.ts     (retry individual)
 *  - qualquer useQuery que precise de retry semantico
 *
 * Design decision: funcao simples vs classe/enum para manter o bundle small.
 * Sendo pure function, e tree-shakeable e testavel isoladamente.
 */

export function isPermanentQueryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  // ── Nivel HTTP ──────────────────────────────────────────────────────────
  if (e['status'] === 401 || e['status'] === 403) return true;

  // ── Nivel Supabase / GoTrue ─────────────────────────────────────────────
  if (e['code'] === 'PGRST301') return true; // JWT expired / invalid

  // ── Nivel PostgreSQL ────────────────────────────────────────────────────
  if (e['code'] === '42501') return true; // permission denied
  if (e['code'] === '42P01') return true; // relation does not exist
  if (e['code'] === '42883') return true; // function does not exist

  // ── Fallback textual ────────────────────────────────────────────────────
  // Cobre mensagens traduzidas e variantes nao mapeadas acima.
  const msg = ((e['message'] as string) ?? '').toLowerCase();
  if (msg.includes('permission denied')) return true;
  if (msg.includes('must be owner')) return true;
  if (msg.includes('insufficient privilege')) return true;
  if (msg.includes('does not exist')) return true; // relacao ou funcao ausente
  if (msg.includes('jwt expired')) return true;
  if (msg.includes('jwt invalid')) return true;

  return false;
}

/**
 * Funcao de retry para TanStack Query.
 * Substitui `retry: 2` (numero) que nao diferencia tipos de erro.
 *
 * Uso:
 *   useQuery({ ..., retry: tanstackRetry })
 *   useQuery({ ..., retry: (count, err) => tanstackRetry(count, err, 3) })
 */
export function tanstackRetry(failureCount: number, error: unknown, maxAttempts = 2): boolean {
  if (isPermanentQueryError(error)) return false;
  return failureCount < maxAttempts;
}
