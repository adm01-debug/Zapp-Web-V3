/**
 * True when the error is an intentional abort (AbortController.abort(),
 * page unload / navigation).
 *
 * Matches by `err.name` — NEVER by `message.includes(...)`: the real browser
 * message behind an AbortError during page unload is "Page unload", and
 * matching on message text is fragile across environments.
 */
export function isIntentionalAbort(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Amplitude ampliada do check de abort: cobre DOMException crua, Error com
 * name='AbortError', o padrão do postgrest-js que embrulha o abort em `message`
 * (ex: `{message: 'AbortError: ...'}`), e strings específicas do semáforo interno
 * ('signal is aborted', 'slot acquire aborted', 'page unload').
 * Usar este em todo código que consome APIs Supabase/PostgREST.
 *
 * RCA 2026-08-22: vivia em src/lib/retry.ts, que importa getLogger no escopo
 * do módulo — qualquer arquivo que importasse isAbortLikeError de lá puxava
 * essa dependência de logger junto, quebrando os ~106 arquivos de teste que
 * fazem vi.mock('@/lib/logger', ...) parcial (sem getLogger). Extraído para
 * um módulo puro, sem I/O nem dependências, para poder ser usado em qualquer
 * queryFn/catch sem efeito colateral em testes. retry.ts re-exporta os dois
 * símbolos para não quebrar os callers existentes.
 */
export function isAbortLikeError(err: unknown): boolean {
  if (isIntentionalAbort(err)) return true;
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name;
    if (name === 'AbortError') return true;
    const msg = (err as { message?: string }).message ?? '';
    if (/^AbortError/i.test(msg) || /\bAbortError\b/i.test(msg)) return true;
    // Strings específicas do semáforo e unload de página
    const msgLower = msg.toLowerCase();
    if (
      msgLower.includes('signal is aborted') ||
      msgLower.includes('slot acquire aborted') ||
      msgLower.includes('page unload')
    ) return true;
  }
  return false;
}
