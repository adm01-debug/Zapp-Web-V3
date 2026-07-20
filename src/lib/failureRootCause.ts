/**
 * Classificador de causa raiz para mensagens com falha (DLQ).
 *
 * Mapeia (error_code, http_status, error_message, payload) para uma das
 * categorias canônicas abaixo, permitindo agrupamento consistente no painel
 * admin e em métricas.
 *
 * Pure module — sem efeitos colaterais. Coberto por testes unitários.
 */

/** Root Cause type alias. */
export type RootCause =
  | 'rate_limit'
  | 'unavailable'
  | 'timeout'
  | 'auth'
  | 'network'
  | 'invalid_payload'
  | 'not_found'
  | 'server_error'
  | 'unknown';

/** Root Cause Meta interface definition. */
export interface RootCauseMeta {
  /** Categoria canônica. */
  cause: RootCause;
  /** Label curta em PT-BR para exibição em chips/badges. */
  label: string;
  /** Tom semântico do design system (mapeia para classes existentes). */
  tone: 'warning' | 'destructive' | 'info' | 'muted';
  /** Descrição operacional curta para tooltip. */
  hint: string;
}

const META: Record<RootCause, RootCauseMeta> = {
  rate_limit:      { cause: 'rate_limit',      label: 'Rate limit',          tone: 'warning',     hint: 'Limite de requisições atingido (HTTP 429). Backoff resolve.' },
  unavailable:     { cause: 'unavailable',     label: 'Indisponibilidade',   tone: 'warning',     hint: 'Serviço fora do ar (502/503/504). Aguarde reprocesso.' },
  timeout:         { cause: 'timeout',         label: 'Timeout',             tone: 'warning',     hint: 'Requisição estourou o tempo limite. Geralmente transitório.' },
  auth:            { cause: 'auth',            label: 'Autenticação',        tone: 'destructive', hint: 'Credencial inválida (401/403). Verifique token/instância.' },
  network:         { cause: 'network',         label: 'Rede',                tone: 'warning',     hint: 'Falha de conectividade entre o backend e a Evolution API.' },
  invalid_payload: { cause: 'invalid_payload', label: 'Payload inválido',    tone: 'destructive', hint: 'Dados malformados (400/422). Não recupera por retry.' },
  not_found:       { cause: 'not_found',       label: 'Não encontrado',      tone: 'destructive', hint: 'Recurso ausente (404). Não recupera por retry.' },
  server_error:    { cause: 'server_error',    label: 'Erro do servidor',    tone: 'destructive', hint: 'Erro genérico 5xx fora do conjunto transitório conhecido.' },
  unknown:         { cause: 'unknown',         label: 'Desconhecido',        tone: 'muted',       hint: 'Sem contexto suficiente para classificar.' },
};

/** get Root Cause Meta function. */
export function getRootCauseMeta(cause: RootCause): RootCauseMeta {
  return META[cause] ?? META.unknown;
}

/** A L L_ R O O T_ C A U S E S constant. */
export const ALL_ROOT_CAUSES: RootCause[] = [
  'rate_limit', 'unavailable', 'timeout', 'auth',
  'network', 'invalid_payload', 'not_found', 'server_error', 'unknown',
];

interface ClassifyInput {
  error_code?: string | null;
  http_status?: number | null;
  error_message?: string | null;
  payload?: Record<string, unknown> | null;
}

/**
 * Classifica uma falha em uma RootCause canônica.
 * Ordem de precedência: error_code explícito → http_status → heurísticas em error_message.
 */
export function classifyRootCause(input: ClassifyInput): RootCause {
  const code = (input.error_code ?? '').toLowerCase().trim();
  const status = input.http_status ?? null;
  const msg = (input.error_message ?? '').toLowerCase();

  // 1) error_code explícito tem precedência.
  if (code) {
    if (code === 'timeout' || code === 'etimedout' || code.includes('timeout')) return 'timeout';
    if (code === 'network_error' || code === 'enetunreach' || code === 'econnreset' || code === 'econnrefused') return 'network';
    if (code === 'rate_limit' || code === 'throttled') return 'rate_limit';
    if (code === 'unauthorized' || code === 'forbidden' || code === 'invalid_token' || code === 'auth_failed') return 'auth';
    if (code === 'invalid_payload' || code === 'validation_error' || code === 'bad_request') return 'invalid_payload';
    if (code === 'not_found') return 'not_found';
    if (code === 'unavailable' || code === 'service_unavailable' || code === 'bad_gateway' || code === 'gateway_timeout') return 'unavailable';

    // Padrão "http_xxx" — extrai o status se disponível.
    const httpMatch = /^http[_-]?(\d{3})$/.exec(code);
    if (httpMatch) {
      return classifyByStatus(Number(httpMatch[1]));
    }
  }

  // 2) HTTP status explícito.
  if (status != null) {
    return classifyByStatus(status);
  }

  // 3) Heurísticas em texto livre (último recurso).
  if (msg) {
    if (/timeout|timed out|etimedout/.test(msg)) return 'timeout';
    if (/rate ?limit|too many requests|429/.test(msg)) return 'rate_limit';
    if (/unauthor|forbidden|invalid token|auth/.test(msg)) return 'auth';
    if (/unavailable|503|502|504|bad gateway|gateway timeout/.test(msg)) return 'unavailable';
    if (/network|econnreset|econnrefused|enetunreach|fetch failed|socket/.test(msg)) return 'network';
    if (/not found|404/.test(msg)) return 'not_found';
    if (/invalid|validation|malformed|400|422/.test(msg)) return 'invalid_payload';
  }

  return 'unknown';
}

function classifyByStatus(status: number): RootCause {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'invalid_payload';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  if (status >= 500 && status < 600) return 'server_error';
  return 'unknown';
}

/** Agrega contagens por causa raiz a partir de uma lista de falhas. */
export function aggregateByRootCause<T extends ClassifyInput>(
  rows: T[],
): Array<{ cause: RootCause; count: number; meta: RootCauseMeta }> {
  const map = new Map<RootCause, number>();
  for (const r of rows) {
    const c = classifyRootCause(r);
    map.set(c, (map.get(c) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([cause, count]) => ({ cause, count, meta: META[cause] }))
    .sort((a, b) => b.count - a.count);
}
