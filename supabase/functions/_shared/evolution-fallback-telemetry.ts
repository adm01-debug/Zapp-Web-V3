/**
 * Telemetria de fallback FATOR X — registra quando uma resposta da Evolution
 * API v2.3.7 indicaria a necessidade de acionar o fallback documentado em
 * `mem://integrations/evolution-api` (find-chats / find-contacts → RPC do
 * FATOR X; fetch-profile → /instance/fetchInstances).
 *
 * O fallback funcional ainda NÃO está implementado nessas três actions — esta
 * infra serve como ponto de hook único para que, no momento da implementação,
 * basta trocar o `mode: 'detected'` por `mode: 'triggered'` quando o caminho
 * alternativo for acionado de fato.
 *
 * Os logs saem como JSON estruturado (uma linha por evento) com prefixo
 * `[evolution-fallback]` para serem facilmente filtrados em
 * `supabase--edge_function_logs` e auditados pelo painel admin.
 *
 * Contrato do evento (estável — front e admin podem parsear):
 *   {
 *     tag: 'evolution-fallback',
 *     ts: ISO-8601,
 *     action: 'find-chats' | 'find-contacts' | 'fetch-profile',
 *     endpoint: string,           // path Evolution chamado
 *     instance: string | null,
 *     status: number,             // HTTP status do upstream
 *     reason: 'http_404' | 'not_found_payload' | 'empty_payload' | 'upstream_error',
 *     mode: 'detected' | 'triggered',
 *     fallback_target: string,    // ex.: 'rpc:rpc_list_chats' | 'instance/fetchInstances'
 *     primary_ms?: number,
 *   }
 */

export type EvolutionFallbackAction =
  | 'find-chats'
  | 'find-contacts'
  | 'fetch-profile';

export type EvolutionFallbackReason =
  | 'http_404'
  | 'http_405'
  | 'http_501'
  | 'not_found_payload'
  | 'method_not_allowed_payload'
  | 'not_implemented_payload'
  | 'empty_payload'
  | 'upstream_error';

export type EvolutionFallbackMode = 'detected' | 'triggered';

export interface EvolutionFallbackEvent {
  tag: 'evolution-fallback';
  ts: string;
  action: EvolutionFallbackAction;
  endpoint: string;
  instance: string | null;
  status: number;
  reason: EvolutionFallbackReason;
  mode: EvolutionFallbackMode;
  fallback_target: string;
  primary_ms?: number;
}

/** Mapa estável action → endpoint alternativo previsto na memória do projeto. */
const FALLBACK_TARGETS: Record<EvolutionFallbackAction, string> = {
  'find-chats': 'rpc:rpc_list_conversations',
  'find-contacts': 'rpc:rpc_list_contacts',
  'fetch-profile': 'instance/fetchInstances',
};

/**
 * Inspeciona o status HTTP + payload do upstream e decide se a resposta indica
 * uma situação onde o fallback FATOR X deveria ser disparado.
 *
 * Retorna o motivo (`reason`) ou `null` quando a resposta foi bem sucedida.
 */
export function detectFallbackReason(
  action: EvolutionFallbackAction,
  status: number,
  data: unknown,
): EvolutionFallbackReason | null {
  // Status HTTP — sinais diretos de endpoint indisponível na v2.3.7.
  if (status === 404) return 'http_404';
  if (status === 405) return 'http_405';
  if (status === 501) return 'http_501';

  // Evolution v2.3.7 às vezes responde 200/4xx/5xx com payload tipo
  // { error: true, message: 'Not Found' | 'Method Not Allowed' | 'Not Implemented' }
  // ou wrappers de proxy (Cloudflare/nginx) que devolvem o status no body.
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const msg = String(d.message ?? d.error ?? d.detail ?? d.reason ?? '').toLowerCase();
    const code = String(d.code ?? d.statusCode ?? d.status ?? '').toLowerCase();

    // 405 — Method Not Allowed e variações comuns ("cannot POST/GET ...",
    // "method ... not allowed", "verb not supported").
    if (
      code === '405' ||
      code === 'method_not_allowed' ||
      msg.includes('method not allowed') ||
      msg.includes('method is not allowed') ||
      /\bcannot (post|get|put|delete|patch)\b/.test(msg) ||
      msg.includes('verb not supported') ||
      msg.includes('http method')
    ) {
      return 'method_not_allowed_payload';
    }

    // 501 — Not Implemented e variações ("not implemented", "unsupported
    // operation", "feature disabled/unavailable", "deprecated endpoint").
    if (
      code === '501' ||
      code === 'not_implemented' ||
      msg.includes('not implemented') ||
      msg.includes('unsupported operation') ||
      msg.includes('endpoint not available') ||
      msg.includes('endpoint disabled') ||
      msg.includes('endpoint deprecated') ||
      msg.includes('feature unavailable') ||
      msg.includes('feature not available') ||
      msg.includes('route disabled')
    ) {
      return 'not_implemented_payload';
    }

    // 404 em payload.
    if (
      code === 'not_found' ||
      code === '404' ||
      msg.includes('not found') ||
      msg.includes('no such route') ||
      msg.includes('route not found')
    ) {
      return 'not_found_payload';
    }

    if (d.error === true && status >= 500) return 'upstream_error';
  }

  // Payload vazio em endpoints conhecidos por estarem quebrados na v2.3.7.
  if (action === 'fetch-profile') {
    if (data === null || data === undefined) return 'empty_payload';
    if (
      data && typeof data === 'object' && !Array.isArray(data) &&
      Object.keys(data as Record<string, unknown>).filter((k) => k !== 'version').length === 0
    ) {
      return 'empty_payload';
    }
  }

  return null;
}

/**
 * Emite um evento de telemetria de fallback. Use `mode: 'detected'` enquanto o
 * fallback funcional não estiver implementado e `mode: 'triggered'` quando o
 * caminho alternativo for efetivamente executado.
 *
 * Nunca lança — falhas de log nunca devem derrubar a request.
 */
export function logFallbackEvent(event: Omit<EvolutionFallbackEvent, 'tag' | 'ts' | 'fallback_target'> & {
  fallback_target?: string;
}): EvolutionFallbackEvent {
  const full: EvolutionFallbackEvent = {
    tag: 'evolution-fallback',
    ts: new Date().toISOString(),
    fallback_target: event.fallback_target ?? FALLBACK_TARGETS[event.action],
    ...event,
  } as EvolutionFallbackEvent;

  try {
    // Linha única JSON, prefixada para grep — preserva o objeto pra Supabase
    // structured logs também conseguirem indexar campos.
    console.log(`[evolution-fallback] ${JSON.stringify(full)}`);
  } catch {
    // Ignora — telemetria não pode quebrar fluxo principal.
  }
  return full;
}

/**
 * Helper combinado: detecta + loga em uma chamada. Retorna o evento emitido
 * (ou `null` quando nada foi detectado).
 */
export function maybeLogFallback(params: {
  action: EvolutionFallbackAction;
  endpoint: string;
  instance: string | null;
  status: number;
  data: unknown;
  primary_ms?: number;
  mode?: EvolutionFallbackMode;
  /**
   * Cliente Supabase com service_role para persistir o evento em
   * `zapp.evolution_fallback_events`. Quando ausente, o evento sai apenas
   * via console.log (modo legado).
   *
   * A persistência é fire-and-forget: nunca bloqueia a request principal e
   * nunca propaga falhas (silencia erros de rede/RLS para não cascatear).
   */
  supabase?: { from: (table: string) => { insert: (row: unknown) => Promise<unknown> | unknown } };
}): EvolutionFallbackEvent | null {
  const reason = detectFallbackReason(params.action, params.status, params.data);
  if (!reason) return null;
  const event = logFallbackEvent({
    action: params.action,
    endpoint: params.endpoint,
    instance: params.instance,
    status: params.status,
    reason,
    mode: params.mode ?? 'detected',
    primary_ms: params.primary_ms,
  });

  // Persistência best-effort. Roda fora do caminho crítico — qualquer erro é
  // engolido pra não derrubar a action.
  if (params.supabase) {
    try {
      const row = {
        ts: event.ts,
        action: event.action,
        endpoint: event.endpoint,
        instance: event.instance,
        status: event.status,
        reason: event.reason,
        mode: event.mode,
        fallback_target: event.fallback_target,
        primary_ms: event.primary_ms ?? null,
      };
      const result = params.supabase.from('evolution_fallback_events').insert(row);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>).catch(() => { /* silencia */ });
      }
    } catch {
      // ignora
    }
  }
  return event;
}
