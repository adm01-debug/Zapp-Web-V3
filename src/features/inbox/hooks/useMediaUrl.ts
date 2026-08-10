/**
 * useMediaUrl — auto-refresh de URLs WhatsApp expiradas.
 *
 * As URLs assinadas servidas pelo WhatsApp expiram em ~24h. Quando o
 * frontend tenta exibir um <img>/<video> antigo, retorna 410/403 e o
 * usuário vê uma área quebrada. Este hook interpreta o erro de carga,
 * pede um refresh via `getMediaBase64` (Evolution `chat/getBase64`) e
 * devolve uma data URL utilizável no lugar.
 *
 * Garantias adicionais (lote atual):
 *  - Não entra em loop: bloqueia novas tentativas enquanto outra está em
 *    voo e respeita um limite de 2 tentativas por messageKey antes de
 *    desistir e marcar `failed=true`.
 *  - Mensagem de erro humana classificada (`expired | not_found | network |
 *    unsupported | unknown`) consumível pela UI.
 *  - Toast único por mídia (anti-flood) avisando o usuário.
 *  - Permite retry manual (botão na UI) que zera o contador.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import { buildFileHash } from '@/lib/crypto';
// F4-20: cache LRU com maxSize (50 MB de bytes) + cap de 200 entradas.
// Data URLs base64 são ASCII → length ≈ bytes. Módulo puro em mediaRefreshCache.
import { mediaCacheGet, mediaCacheSet } from './mediaRefreshCache';

const log = getLogger('useMediaUrl');

interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

interface UseMediaUrlOptions {
  instanceName: string;
  originalUrl: string | null | undefined;
  messageKey: MessageKey | null;
  /** Disable auto-refresh (e.g. while still loading the message metadata). */
  enabled?: boolean;
  /** Forces a refresh even before the first error (rare; mainly for retries). */
  forceRefreshNonce?: number;
  /** Override default 2-attempt cap (use 0 to disable retries entirely). */
  maxAttempts?: number;
  /** Message type from WhatsApp — used to skip refresh for known-unsupported types. */
  messageType?: string | null;
}

/** Reason category for a media load failure; used to show targeted fallback messages to the agent. */
export type MediaErrorReason =
  'expired' | 'not_found' | 'network' | 'unsupported' | 'forbidden' | 'unknown';

/** Structured media load error with reason category and a human-readable pt-BR message for fallback UI. */
export interface MediaError {
  reason: MediaErrorReason;
  /** Human, pt-BR. Safe to show in fallback UI. */
  message: string;
  /** Underlying Error for diagnostics/logging. */
  cause?: Error;
}

interface UseMediaUrlResult {
  url: string | null;
  isRefreshing: boolean;
  /** Structured error after refresh failed (or null when healthy). */
  error: MediaError | null;
  /** True when we've exhausted automatic retries — UI should show fallback. */
  failed: boolean;
  /** Number of refresh attempts performed in this hook lifetime. */
  attempts: number;
  /** Attach to <img onError={onError}> / <video onError={onError}>. */
  onError: () => void;
  /** Manually trigger a refresh — resets the attempt counter. */
  retry: () => Promise<void>;
  /** @deprecated alias kept for back-compat. Use `retry`. */
  refresh: () => Promise<void>;
}

const toastedKeys = new Set<string>();

function cacheKey(instance: string, key: MessageKey): string {
  return `${instance}::${key.remoteJid}::${key.id}`;
}

/**
 * Extrai status HTTP + texto do body de um erro de `supabase.functions.invoke`.
 *
 * supabase-js v2 (>= 2.39) lança `FunctionsHttpError` com `message` genérica
 * ('Edge Function returned a non-2xx status code') e o `Response` real em
 * `err.context` — o status HTTP fica em `context.status` e o body JSON do
 * envelope {version,error,status,code,message} em `context.data` (versões
 * novas) ou lido via `context.json()` (Response cru). Sem essa extração,
 * TODO erro HTTP viraria reason 'unknown'.
 */
async function extractErrorDetails(
  raw: unknown
): Promise<{ status?: number; code?: string; text: string }> {
  const err = raw instanceof Error ? raw : new Error(String(raw));
  let status: number | undefined;
  let code: string | undefined;
  let bodyText = '';
  const ctx = (err as Error & { context?: unknown }).context;

  if (ctx && typeof ctx === 'object') {
    const ctxObj = ctx as {
      status?: unknown;
      data?: unknown;
      json?: () => Promise<unknown>;
    };
    if (typeof ctxObj.status === 'number') status = ctxObj.status;

    let body: unknown = ctxObj.data;
    if (body === undefined && typeof ctxObj.json === 'function') {
      try {
        body = await ctxObj.json();
      } catch {
        body = undefined; // body já consumido/indisponível — segue só com status/message
      }
    }

    if (body !== undefined) {
      if (typeof body === 'string') {
        bodyText = body;
        // Body como string crua (ex.: mock de context.json() devolvendo
        // string): tenta extrair o `code` do envelope JSON mesmo assim.
        try {
          const parsed = JSON.parse(body) as { code?: unknown };
          if (parsed !== null && typeof parsed === 'object' && typeof parsed.code === 'string') {
            code = parsed.code;
          }
        } catch {
          // não é JSON — segue só com status/texto
        }
      } else if (body !== null && typeof body === 'object') {
        // O envelope {version,error,status,code,message} também carrega o
        // status e o code quando o Response cru não os expõe (ex.:
        // testes/mocks). Campos aditivos (contract, details, …) são
        // ignorados — o parse não quebra com envelope mais rico.
        const bodyObj = body as { status?: unknown; code?: unknown };
        if (status === undefined && typeof bodyObj.status === 'number') status = bodyObj.status;
        if (typeof bodyObj.code === 'string') code = bodyObj.code;
        try {
          bodyText = JSON.stringify(body);
        } catch {
          bodyText = String(body);
        }
      } else {
        bodyText = String(body);
      }
    }
  }

  const text = `${err.message}\n${bodyText}`.toLowerCase();
  return { status, code, text };
}

export async function classifyError(raw: unknown): Promise<MediaError> {
  const err = raw instanceof Error ? raw : new Error(String(raw));
  const { status, code, text: msg } = await extractErrorDetails(raw);

  // Classificação por CODE do envelope primeiro (mais robusto que
  // status/substring: o code é o contrato estruturado da edge fn e não
  // muda com idioma/formato da message). Os branches de status/substring
  // abaixo permanecem como fallback para erros sem code (upstream cru,
  // rede, mocks antigos).
  if (code === 'MEDIA_EXPIRED') {
    return {
      reason: 'expired',
      message: 'Esta mídia expirou no WhatsApp e não pode mais ser recuperada.',
      cause: err,
    };
  }
  if (code === 'FORBIDDEN' || code === '403') {
    return {
      reason: 'forbidden',
      message: 'Sem permissão para baixar esta mídia. Tente novamente em instantes.',
      cause: err,
    };
  }

  // Expired tem prioridade sobre network: a edge fn evolution-api re-emite o
  // status HTTP real do upstream (400/410/403) e o body pode conter
  // 'Failed to fetch stream' — que contém 'fetch' e cairia em network se a
  // ordem fosse invertida.
  if (
    status === 410 ||
    msg.includes('410') ||
    msg.includes('expired') ||
    msg.includes('gone') ||
    msg.includes('media_expired') ||
    msg.includes('failed to fetch stream')
  ) {
    return {
      reason: 'expired',
      message: 'Esta mídia expirou no WhatsApp e não pode mais ser recuperada.',
      cause: err,
    };
  }
  // R6 (regression review 2026-08-06): 403 NÃO é expired. Pode ser auth/
  // permissão transitória da credencial da edge fn (ou do S3 do WhatsApp) —
  // classificar como 'expired' tornava a mídia irrecuperável (falha imediata
  // na 1ª tentativa) e escondia o problema em log.debug. Agora é 'forbidden':
  // retryável (gasta as tentativas) e logado em warn/toast.
  if (
    status === 403 ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('permission denied')
  ) {
    return {
      reason: 'forbidden',
      message: 'Sem permissão para baixar esta mídia. Tente novamente em instantes.',
      cause: err,
    };
  }
  if (
    status === 404 ||
    msg.includes('404') ||
    msg.includes('not_found') ||
    msg.includes('not found')
  ) {
    return {
      reason: 'not_found',
      message: 'Mídia não encontrada no servidor do WhatsApp.',
      cause: err,
    };
  }
  if (
    status === 504 ||
    msg.includes('504') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  ) {
    return {
      reason: 'network',
      message: 'Falha de conexão ao baixar a mídia. Tente novamente em instantes.',
      cause: err,
    };
  }
  // R5 (regression review 2026-08-06): 415 (Unsupported Media Type) reemitido
  // pela edge fn era classificado como 'unknown' com toast genérico. Agora
  // vira 'unsupported' (debug, sem toast de erro — esperado p/ tipos sem
  // visualização).
  if (status === 415 || msg.includes('415') || msg.includes('unsupported media type')) {
    return {
      reason: 'unsupported',
      message: 'Formato de mídia não suportado para visualização.',
      cause: err,
    };
  }
  if (msg.includes('empty media payload') || msg.includes('mimetype')) {
    return {
      reason: 'unsupported',
      message: 'Formato de mídia não suportado para visualização.',
      cause: err,
    };
  }
  return {
    reason: 'unknown',
    message: 'Não foi possível carregar esta mídia.',
    cause: err,
  };
}

const DEFAULT_MAX_ATTEMPTS = 2;

/**
 * Cap global de refresh attempts por sessão (anti-storm).
 *
 * Incidente 2026-08-06: bucket `whatsapp-media` ficou privado (migração
 * LGPD) e TODAS as mídias do inbox falharam → cada <img>/<video> onError
 * disparava `evolution-api/get-media-base64` (2 tentativas cada), gerando
 * centenas de GET/POST no console. Este contador em module scope limita o
 * total de invokes da edge fn por janela de tempo; estourado, o refresh
 * falha silenciosamente (`failed=true`, sem invoke, sem toast).
 *
 * R3 (regression review 2026-08-06): o contador era monotônico — nunca
 * resetava e o retry MANUAL não furava o cap (mídia morta até reload).
 * Agora: (a) janela deslizante de 5min — passado o prazo, o contador zera
 * sozinho; (b) o retry() manual zera o contador global (o usuário pediu
 * explicitamente — a UI não fica presa em 'failed' para sempre).
 */
export const MAX_SESSION_REFRESH_ATTEMPTS = 40;
const SESSION_REFRESH_WINDOW_MS = 5 * 60 * 1000;
let sessionRefreshAttempts = 0;
let sessionRefreshWindowStart = Date.now();

/**
 * Test-only: reseta (ou pré-define) o contador global de refresh attempts
 * da sessão. `mediaCacheClear`-style — nada em produção chama isto.
 */
export function resetSessionRefreshAttempts(count = 0): void {
  sessionRefreshAttempts = count;
  sessionRefreshWindowStart = Date.now();
}

/** True quando a janela deslizante expirou — o contador pode zerar. */
function isSessionRefreshWindowExpired(): boolean {
  return Date.now() - sessionRefreshWindowStart >= SESSION_REFRESH_WINDOW_MS;
}

/** WhatsApp message types that never produce valid base64 via the Evolution API. */
const UNREFRESHABLE_MESSAGE_TYPES = new Set([
  'sticker',
  'ephemeral',
  'ptv', // view-once video
  'viewOnce',
  'vcard',
  'contact',
  'location',
  'liveLocation',
  'reaction',
  'poll',
  'pollUpdate',
]);

/** Auto-refreshes expired WhatsApp media URLs via Evolution `chat/getBase64`; deduplicates in-flight requests, caps retry attempts, and surfaces structured errors for fallback UI. */
export function useMediaUrl(opts: UseMediaUrlOptions): UseMediaUrlResult {
  const {
    instanceName,
    originalUrl,
    messageKey,
    enabled = true,
    forceRefreshNonce,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    messageType,
  } = opts;
  const [url, setUrl] = useState<string | null>(originalUrl ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<MediaError | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const originalUrlRef = useRef(originalUrl);
  originalUrlRef.current = originalUrl;
  // Guard de mounted: supabase.functions.invoke (supabase-js v2) não aceita
  // AbortSignal — client.ts descarta deliberadamente o signal do caller
  // (fix 2026-08-03 anti retry storm). O padrão correto é mountedRef para
  // suprimir setState/toast/log.warn quando o componente desmonta com um
  // refresh ainda em voo.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep `url` in sync when the upstream metadata changes.
  useEffect(() => {
    setUrl(originalUrl ?? null);
    setError(null);
    setFailed(false);
    setAttempts(0);
  }, [originalUrl]);

  const runRefresh = useCallback(async (): Promise<void> => {
    // Guard de unmount na entrada: componente desmontado ⇒ nenhum trabalho
    // roda — nem invoke, nem upsert, nem setState (defesa contra chamadas
    // stale de onError/retry que sobrevivam ao unmount).
    if (!mountedRef.current) return;
    if (!enabled || !messageKey || !instanceName) return;
    if (inFlightRef.current) return inFlightRef.current;

    // Skip refresh for message types known to return empty payload
    if (messageType && UNREFRESHABLE_MESSAGE_TYPES.has(messageType)) {
      return;
    }

    const key = cacheKey(instanceName, messageKey);
    const cached = mediaCacheGet(key);
    if (cached) {
      setUrl(cached);
      setError(null);
      setFailed(false);
      return;
    }

    // Otimização: Cache persistente via Storage Hash
    if (originalUrlRef.current) {
      try {
        const hash = await buildFileHash(originalUrlRef.current);
        const { data: cacheRows } = await safeClient.from('media_cache', (q) =>
          q.select('storage_path').eq('file_hash', hash).limit(1)
        );
        const cacheRow = (cacheRows?.[0] ?? null) as { storage_path: string } | null;

        if (cacheRow?.storage_path) {
          // Guard de mounted: o await acima pode ter atravessado unmount —
          // checado ANTES do log para nem log.info rodar desmontado.
          if (!mountedRef.current) return;
          log.info(`Media cache hit for ${key}`);
          setUrl(cacheRow.storage_path);
          setError(null);
          setFailed(false);
          return;
        }
      } catch (e) {
        // Guard de mounted: o await do hash/select pode ter atravessado
        // unmount — sem log.warn pós-desmontagem.
        if (!mountedRef.current) return;
        log.warn('Cache hash check failed, proceeding with API refresh', e);
      }
    }

    if (!mountedRef.current) return;

    // Cap global anti-storm: em falha em massa (ex.: bucket privado) não
    // deixa centenas de invokes da edge fn dispararem. Estourou ⇒ falha
    // silenciosa: marca failed (UI mostra fallback) sem chamar a edge fn
    // nem disparar toast. Janela deslizante de 5min: passado o prazo, o
    // contador zera (R3 — antes era monotônico e matava a mídia até reload).
    if (isSessionRefreshWindowExpired()) {
      sessionRefreshAttempts = 0;
      sessionRefreshWindowStart = Date.now();
    }
    if (sessionRefreshAttempts >= MAX_SESSION_REFRESH_ATTEMPTS) {
      setFailed(true);
      log.debug(
        `session refresh cap (${MAX_SESSION_REFRESH_ATTEMPTS}) reached — skipping refresh for ${key}`
      );
      return;
    }
    sessionRefreshAttempts += 1;

    setIsRefreshing(true);
    setError(null);
    const job = (async () => {
      try {
        // ADR-004: shortcut para buckets Supabase privados (whatsapp-media, audio-messages)
        // Quando a URL original é do storage local, criar signed URL diretamente
        // sem chamar a edge function (que só sabe buscar no CDN WhatsApp).
        const localStorageUrl = originalUrlRef.current ?? '';
        const storageMarkers = [
          '/storage/v1/object/public/whatsapp-media/',
          '/storage/v1/object/public/audio-messages/',
        ];
        for (const marker of storageMarkers) {
          const idx = localStorageUrl.indexOf(marker);
          if (idx !== -1) {
            const bucketName = marker.split('/object/public/')[1].replace('/', '');
            const pathWithQuery = localStorageUrl.substring(idx + marker.length);
            const storagePath = decodeURIComponent(pathWithQuery.split('?')[0]);
            try {
              const { data: signedData } = await supabase.storage
                .from(bucketName)
                .createSignedUrl(storagePath, 3600); // 1h TTL
              if (signedData?.signedUrl) {
                if (!mountedRef.current) return;
                mediaCacheSet(key, signedData.signedUrl);
                setUrl(signedData.signedUrl);
                setError(null);
                setFailed(false);
                return;
              }
            } catch (_signedErr) {
              // Falha no signed URL → continuar para edge function como fallback
            }
            break;
          }
        }

        const { data, error: fnError } = await supabase.functions.invoke(
          'evolution-api/get-media-base64',
          {
            method: 'POST',
            body: { instanceName, message: { key: messageKey } },
          }
        );
        if (fnError) throw fnError;
        const payload = (data as { base64?: string; mimetype?: string } | null) ?? null;
        if (!payload?.base64) throw new Error('Empty media payload');
        const mime = payload.mimetype || 'application/octet-stream';
        const dataUrl = `data:${mime};base64,${payload.base64}`;
        mediaCacheSet(key, dataUrl);

        // F4-21: chave unificada — SEMPRE buildFileHash(originalUrl) como
        // identidade da mídia. O fallback antigo para buildFileHash(dataUrl)
        // gerava chave DIFERENTE a cada refresh (dataUrl muda) → media_cache
        // nunca dava hit. Sem originalUrl não há identidade estável → não
        // persiste (evita linhas órfãs com chave volátil).
        try {
          const hash = originalUrlRef.current ? await buildFileHash(originalUrlRef.current) : null;
          if (hash) {
            await safeClient.from('media_cache', (q) =>
              q.upsert(
                {
                  file_hash: hash,
                  storage_path: dataUrl,
                  mime_type: mime,
                  size: Math.round((payload.base64 ?? '').length * 0.75),
                },
                { onConflict: 'file_hash' }
              )
            );
          }
        } catch (e) {
          // Guard de mounted: o upsert pode ter atravessado unmount — sem
          // log.warn pós-desmontagem. (Persistência fire-and-forget segue,
          // mas silenciosa; o setUrl abaixo já é guardado.)
          if (mountedRef.current) {
            log.warn('Failed to persist media cache', e);
          }
        }

        // Guard de mounted: componente desmontado ⇒ nenhum setState roda.
        if (!mountedRef.current) return;
        setUrl(dataUrl);
        setError(null);
        setFailed(false);
      } catch (err) {
        const classified = await classifyError(err);
        // Empty media payload é esperado para certos tipos de mídia do WhatsApp
        // (ex.: stickers animados, vídeos efêmeros) — não poluir o console.
        // Mídia expirada (410/403/expired) também: é irrecuperável e esperado
        // em conversas antigas — debug, não warn.
        const logLevel =
          classified.reason === 'unsupported' || classified.reason === 'expired' ? 'debug' : 'warn';
        if (!mountedRef.current) {
          // Desmontado: suprime log.warn e toast.error — apenas debug para
          // rastreabilidade (refresh que terminou após navegação).
          log.debug(
            `media refresh failed after unmount for ${key}: ${classified.reason} — ${classified.cause?.message}`
          );
        } else {
          log[logLevel](
            `media refresh failed for ${key}: ${classified.reason} — ${classified.cause?.message}`
          );
          setError(classified);
          setAttempts((prev) => {
            const next = prev + 1;
            // Irrecuperável (expirada): o WhatsApp não vai "desexpirar" a
            // URL — falha imediata na 1ª tentativa, sem gastar a 2ª.
            const unrecoverable = classified.reason === 'expired';
            if (unrecoverable || next >= maxAttempts) {
              setFailed(true);
              // Anti-flood: 1 toast por mídia por sessão.
              if (!toastedKeys.has(key)) {
                toastedKeys.add(key);
                toast.error('Mídia indisponível', { description: classified.message });
              }
            }
            return next;
          });
        }
      } finally {
        // isRefreshing só é resetado se ainda montado; o dedupe inFlightRef
        // SEMPRE é liberado, mesmo com o componente desmontado.
        if (mountedRef.current) {
          setIsRefreshing(false);
        }
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = job;
    return job;
  }, [enabled, instanceName, messageKey, maxAttempts, messageType]);

  // Automatic onError trigger: respeita o cap de tentativas.
  const onError = useCallback(() => {
    if (failed) return;
    void runRefresh();
  }, [failed, runRefresh]);

  // Manual retry — zera contador e remove flag de toast (deixa avisar de novo).
  const retry = useCallback(async (): Promise<void> => {
    if (messageKey && instanceName) {
      toastedKeys.delete(cacheKey(instanceName, messageKey));
    }
    // R3: o retry MANUAL também zera o cap global — o usuário pediu
    // explicitamente uma nova tentativa; sem isso a mídia ficava 'failed'
    // para sempre depois de uma rajada (mesmo com janela, o reset só
    // ocorria na próxima chamada de runRefresh que fosse bloqueada).
    sessionRefreshAttempts = 0;
    sessionRefreshWindowStart = Date.now();
    setAttempts(0);
    setFailed(false);
    setError(null);
    await runRefresh();
  }, [instanceName, messageKey, runRefresh]);

  // Manual refresh trigger via nonce (mantém compat).
  useEffect(() => {
    if (forceRefreshNonce != null && forceRefreshNonce > 0) {
      void retry();
    }
  }, [forceRefreshNonce, retry]);

  return {
    url,
    isRefreshing,
    error,
    failed,
    attempts,
    onError,
    retry,
    refresh: retry,
  };
}
