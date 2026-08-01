/**
 * Cliente do endpoint interno para acionar a edge function `migrate-helper`.
 *
 * Regras de segurança aplicadas aqui (defensivas, por design):
 * - A ação `credentials` é BLOQUEADA no cliente: ela devolveria a service role
 *   key e a URL do banco para o browser, o que seria um vazamento crítico.
 * - A chave de acesso (`x-access-key`) NUNCA é persistida em disco
 *   (sem localStorage/sessionStorage): ela vive apenas em memória, no state
 *   do painel, durante a sessão do operador.
 */

/** Ações permitidas ao acionar a migrate-helper a partir do painel. */
export const MIGRATE_ACTIONS = ['ping', 'status', 'migrate', 'verify', 'logs'] as const;

/** União das ações permitidas. */
export type MigrateAction = (typeof MIGRATE_ACTIONS)[number];

/** Ações explicitamente proibidas de serem acionadas pelo frontend. */
const FORBIDDEN_ACTIONS = new Set(['credentials', 'secrets', 'env']);

/** Resultado normalizado de uma invocação da migrate-helper. */
export interface MigrateHelperResult {
  /** Ação executada. */
  action: MigrateAction;
  /** `true` quando a resposta HTTP foi 2xx e o corpo não trouxe `error`. */
  ok: boolean;
  /** Código HTTP retornado (0 quando a requisição sequer completou). */
  status: number;
  /** Duração total da chamada em milissegundos. */
  durationMs: number;
  /** Momento (ISO) em que a chamada terminou. */
  finishedAt: string;
  /** Corpo da resposta já parseado, quando for JSON válido. */
  payload: unknown;
  /** Mensagem de erro legível, quando `ok` for `false`. */
  error?: string;
}

/** Base das edge functions, priorizando a instância self-hosted. */
function functionsBase(): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  if (supabaseUrl && !supabaseUrl.includes('.supabase.co')) {
    return supabaseUrl.replace(/\/$/, '') + '/functions/v1';
  }
  return 'https://supabase.atomicabr.com.br/functions/v1';
}

/** Converte a resposta HTTP em mensagem de erro legível em pt-BR. */
function describeError(status: number, payload: unknown): string {
  const fromBody =
    payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : null;
  if (status === 401) return 'Chave de acesso inválida (401). Verifique o x-access-key.';
  if (status === 404) return 'Edge function migrate-helper não encontrada (404).';
  if (status === 400) return `Ação recusada pela função: ${fromBody ?? 'unknown_action'}`;
  if (fromBody) return fromBody;
  return `Falha HTTP ${status}`;
}

/**
 * Aciona a edge function `migrate-helper` com a ação informada.
 *
 * @param action Ação a executar (`ping`, `status`, `migrate`, `verify`).
 * @param accessKey Chave enviada no header `x-access-key`.
 * @param signal AbortSignal opcional para cancelamento.
 */
export async function invokeMigrateHelper(
  action: MigrateAction,
  accessKey: string,
  signal?: AbortSignal,
): Promise<MigrateHelperResult> {
  const startedAt = performance.now();
  const finish = (partial: Omit<MigrateHelperResult, 'action' | 'durationMs' | 'finishedAt'>) => ({
    action,
    durationMs: Math.round(performance.now() - startedAt),
    finishedAt: new Date().toISOString(),
    ...partial,
  });

  if (FORBIDDEN_ACTIONS.has(action)) {
    return finish({
      ok: false,
      status: 0,
      payload: null,
      error: 'Ação bloqueada: exporia credenciais de servidor ao navegador.',
    });
  }
  if (!accessKey.trim()) {
    return finish({ ok: false, status: 0, payload: null, error: 'Informe a chave de acesso.' });
  }

  try {
    const url = `${functionsBase()}/migrate-helper?action=${encodeURIComponent(action)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-access-key': accessKey.trim() },
      signal,
    });

    const raw = await response.text();
    let payload: unknown = raw;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      /* resposta não-JSON: mantém o texto bruto */
    }

    const hasBodyError =
      !!payload && typeof payload === 'object' && 'error' in (payload as Record<string, unknown>);

    return finish({
      ok: response.ok && !hasBodyError,
      status: response.status,
      payload,
      error: response.ok && !hasBodyError ? undefined : describeError(response.status, payload),
    });
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return finish({
      ok: false,
      status: 0,
      payload: null,
      error: aborted ? 'Requisição cancelada.' : `Falha de rede: ${String(err)}`,
    });
  }
}
