/**
 * Filtro de ruído benigno de console — fonte única da verdade.
 *
 * Usado por:
 * - src/main.tsx: handlers globais de window 'error' / 'unhandledrejection'
 *   (suppress silencioso: event.preventDefault() + return, SEM log)
 * - src/lib/sentry.ts: beforeSend (drop do evento no Sentry)
 *
 * O que é considerado ruído (NUNCA suprimir erros reais):
 * - 'ResizeObserver loop ...' (loop completed / loop limit exceeded): aviso
 *   esperado do browser em apps com layout observation contínuo — não indica
 *   bug e não tem stack acionável.
 * - 'Script error.': erro cross-origin sem stack (CORS) — sem informação útil.
 * - 'Extension context invalidated' / chrome-extension:// / moz-extension://:
 *   erros de extensões do browser, fora do controle do app.
 * - TimeoutError / InvalidStateError (por error.name): timeouts esperados de
 *   storage/IDB e lifecycle de service worker (rejeições de promise).
 * - name 'ResizeObserver': erros originados de callbacks do ResizeObserver.
 * - 'Non-Error promise rejection': rejeição sem Error (paridade Sentry).
 *
 * EXPLICITAMENTE NÃO filtrado: 'ResizeObserver is not defined' — isso é bug
 * real de runtime (ReferenceError) e precisa ser logado.
 */
const BENIGN_MESSAGE_SUBSTRINGS: readonly string[] = [
  'resizeobserver loop',
  'script error.',
  'extension context invalidated',
  'chrome-extension://',
  'moz-extension://',
  'non-error promise rejection',
];

const BENIGN_ERROR_NAMES: readonly string[] = [
  'ResizeObserver',
  'TimeoutError',
  'InvalidStateError',
];

function extractName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = error.name;
    return typeof name === 'string' ? name : '';
  }
  return '';
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = error.message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

/**
 * Retorna true se `error` for ruído benigno conhecido (browser/extensões) que
 * deve ser suprimido silenciosamente nos handlers globais — sem log e sem
 * envio ao Sentry. Erros reais retornam false e seguem o fluxo normal.
 */
export function isBenignConsoleNoise(error: unknown): boolean {
  if (BENIGN_ERROR_NAMES.includes(extractName(error))) return true;
  const message = extractMessage(error).toLowerCase();
  return BENIGN_MESSAGE_SUBSTRINGS.some((substring) => message.includes(substring));
}
