/**
 * channelErrorLogging — classificação de erros de canal Realtime.
 *
 * Contexto (bug de produção): durante restart do Kong (~1min) o WebSocket do
 * Realtime cai; o supabase-js reconecta sozinho, mas os handlers de
 * `CHANNEL_ERROR` logavam `warn` — ruído que poluía Sentry/console sem ser
 * erro real. Regra aplicada nos handlers de channel error:
 *
 *  1. Canal recém-conectado (transiente < TRANSIENT_CHANNEL_WINDOW_MS desde o
 *     último SUBSCRIBED) → `debug` (reconexão automática do supabase-js).
 *  2. Conectividade global degradada (`backend-down`/`offline` no
 *     connectivityMonitor) → `info` (infra caiu, não é erro do canal).
 *  3. Qualquer outro caso (online + erro persistente) → `warn` (erro real).
 *
 * O `connectivityMonitor` é importado DINAMICAMENTE para evitar ciclo de
 * módulos (o monitor também importa `./client` dinamicamente).
 */
export const TRANSIENT_CHANNEL_WINDOW_MS = 30_000;

export type ChannelErrorSeverity = 'warn' | 'info' | 'debug';

/** Subconjunto do Logger (src/lib/logger.ts) usado pelos handlers de channel. */
export interface ChannelErrorLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Decide o nível de log de um `CHANNEL_ERROR` do realtime.
 *
 * @param connectedAtMs timestamp do último status `SUBSCRIBED` do canal
 *   (null se o canal nunca chegou a conectar nesta montagem).
 * @param now injetável para testes.
 */
export async function classifyChannelError(
  connectedAtMs: number | null,
  now = Date.now()
): Promise<ChannelErrorSeverity> {
  // Transiente: o canal conectou há pouco e já caiu — o supabase-js está
  // reconectando sozinho. Ruído, não é erro de negócio.
  if (connectedAtMs !== null && now - connectedAtMs < TRANSIENT_CHANNEL_WINDOW_MS) {
    return 'debug';
  }
  try {
    const { getSupabaseConnectivityStatus } = await import('./connectivityMonitor');
    const status = getSupabaseConnectivityStatus();
    if (status === 'backend-down' || status === 'offline') return 'info';
  } catch {
    // Monitor indisponível: assume erro real — nunca engole alerta por falha do monitor.
  }
  return 'warn';
}

/**
 * Loga um `CHANNEL_ERROR` no nível adequado: `warn` apenas para erros reais
 * (conectividade online + erro persistente). Não altera nenhuma lógica de
 * negócio — apenas o nível de logging.
 */
export async function logChannelError(
  logger: ChannelErrorLogger,
  message: string,
  connectedAtMs: number | null,
  ...args: unknown[]
): Promise<void> {
  const severity = await classifyChannelError(connectedAtMs);
  if (severity === 'info') {
    logger.info(message, ...args);
  } else if (severity === 'debug') {
    logger.debug(message, ...args);
  } else {
    logger.warn(message, ...args);
  }
}
