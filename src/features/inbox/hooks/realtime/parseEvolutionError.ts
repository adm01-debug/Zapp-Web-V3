/**
 * parseEvolutionError — extrai um motivo humanizado a partir do envelope
 * de erro do proxy `evolution-api` (que embrulha falhas de upstream em
 * `{ error: true, message, status, response }`).
 *
 * Retorna `{ reason, detail }` onde:
 *  - `reason` é uma frase curta amigável para exibir no banner.
 *  - `detail` é o payload bruto/`message` original — útil no "Ver detalhes".
 */
export interface EvolutionErrorInfo {
  reason: string;
  detail: string | null;
  status?: number;
}

const HUMANIZED: Array<{ test: RegExp; reason: string }> = [
  { test: /invalid\s*number|number.*invalid|not.*on.*whatsapp/i, reason: 'Número inválido ou sem WhatsApp ativo.' },
  { test: /unauthor|forbidden|401|403/i, reason: 'Sessão da instância expirou — reconecte o WhatsApp.' },
  { test: /not\s*found|404/i, reason: 'Instância ou recurso não encontrado.' },
  { test: /timeout|timed?\s*out|ETIMEDOUT/i, reason: 'Tempo esgotado ao falar com o servidor da Evolution.' },
  { test: /network|fetch|ECONN|ENOTFOUND|ENETUNREACH/i, reason: 'Falha de rede ao contatar o servidor.' },
  { test: /rate.*limit|too\s*many/i, reason: 'Muitos envios em sequência — aguarde alguns segundos.' },
  { test: /media|audio|file.*too\s*(big|large)/i, reason: 'Arquivo de mídia inválido ou muito grande.' },
  { test: /jid|recipient/i, reason: 'Destinatário inválido para esta instância.' },
  { test: /5\d{2}/i, reason: 'O servidor da Evolution está instável agora.' },
];

/** Normalises an unknown Evolution API error into a typed EvolutionErrorInfo with a human-readable pt-BR message and an HTTP status category. */
export function parseEvolutionError(input: unknown): EvolutionErrorInfo {
  // Normaliza para objeto manipulável.
  const env = (typeof input === 'object' && input ? input : {}) as Record<string, unknown>;
  const rawMessage =
    typeof (env as { message?: unknown }).message === 'string'
      ? ((env as { message: string }).message)
      : input instanceof Error
        ? input.message
        : typeof input === 'string'
          ? input
          : '';

  const status = typeof (env as { status?: unknown }).status === 'number'
    ? ((env as { status: number }).status)
    : undefined;

  // Tenta extrair string mais profunda do upstream (Evolution costuma
  // devolver `response.message[0]` ou `response.message`).
  let nested: string | null = null;
  const response = (env as { response?: unknown }).response;
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    if (typeof r.message === 'string') nested = r.message;
    else if (Array.isArray(r.message) && typeof r.message[0] === 'string') nested = r.message[0];
    else if (typeof r.error === 'string') nested = r.error;
  }

  const haystack = `${rawMessage} ${nested ?? ''} ${status ?? ''}`;
  const matched = HUMANIZED.find((h) => h.test.test(haystack));
  const reason = matched
    ? matched.reason
    : (nested || rawMessage || 'A Evolution API recusou o envio.');

  // `detail` mantém a mensagem original mais completa para inspeção.
  const detailParts = [
    status ? `HTTP ${status}` : null,
    rawMessage || null,
    nested && nested !== rawMessage ? nested : null,
  ].filter(Boolean) as string[];
  const detail = detailParts.length ? detailParts.join(' · ') : null;

  return { reason, detail, status };
}
