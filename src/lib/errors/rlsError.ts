/**
 * Helpers para tratar erros de RLS (PostgreSQL `42501` / HTTP 403) de forma
 * consistente em toda a UI de Admin (DLQ, transfers, audit etc.).
 *
 * Uso:
 *   try { ... } catch (e) {
 *     if (isRlsDeniedError(e)) toast.error(rlsDeniedMessage('DLQ'));
 *   }
 */

/** Rls Denied Shape interface. */
export interface RlsDeniedShape {
  code?: string;
  status?: number;
  message?: string;
}

/** Returns true if the error is a Postgres RLS denial (code 42501) or HTTP 403. */
export function isRlsDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as RlsDeniedShape;
  if (e.code === '42501') return true;
  if (e.status === 403) return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('forbidden') || msg.includes('row-level security') || msg.includes('permission denied');
}

/** rls Denied Message function. */
export function rlsDeniedMessage(resource: string): string {
  return `Acesso negado a ${resource}. Apenas administradores ou supervisores podem visualizar este recurso.`;
}

/** Normaliza qualquer erro para mensagem amigável em PT-BR sem quebrar a lista. */
export function formatAdminError(err: unknown, resource: string): string {
  if (isRlsDeniedError(err)) return rlsDeniedMessage(resource);
  if (err instanceof Error) return err.message;
  return `Não foi possível carregar ${resource}.`;
}
