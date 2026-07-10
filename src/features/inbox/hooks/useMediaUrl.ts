// @ts-nocheck
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
import { getLogger } from '@/lib/logger';
import { buildFileHash } from '@/lib/crypto';

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
}

export type MediaErrorReason =
  | 'expired'
  | 'not_found'
  | 'network'
  | 'unsupported'
  | 'unknown';

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

const refreshCache = new Map<string, string>();
const toastedKeys = new Set<string>();

function cacheKey(instance: string, key: MessageKey): string {
  return `${instance}::${key.remoteJid}::${key.id}`;
}

function classifyError(raw: unknown): MediaError {
  const err = raw instanceof Error ? raw : new Error(String(raw));
  const msg = err.message.toLowerCase();

  if (msg.includes('410') || msg.includes('expired') || msg.includes('gone')) {
    return {
      reason: 'expired',
      message: 'Esta mídia expirou no WhatsApp e não pôde ser recuperada.',
      cause: err,
    };
  }
  if (msg.includes('404') || msg.includes('not_found') || msg.includes('not found')) {
    return {
      reason: 'not_found',
      message: 'Mídia não encontrada no servidor do WhatsApp.',
      cause: err,
    };
  }
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('failed to fetch')) {
    return {
      reason: 'network',
      message: 'Falha de conexão ao baixar a mídia. Tente novamente em instantes.',
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

export function useMediaUrl(opts: UseMediaUrlOptions): UseMediaUrlResult {
  const { instanceName, originalUrl, messageKey, enabled = true, forceRefreshNonce, maxAttempts = DEFAULT_MAX_ATTEMPTS } = opts;
  const [url, setUrl] = useState<string | null>(originalUrl ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<MediaError | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [failed, setFailed] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  // Keep `url` in sync when the upstream metadata changes.
  useEffect(() => {
    setUrl(originalUrl ?? null);
    setError(null);
    setFailed(false);
    setAttempts(0);
  }, [originalUrl]);

  const runRefresh = useCallback(async (): Promise<void> => {
    if (!enabled || !messageKey || !instanceName) return;
    if (inFlightRef.current) return inFlightRef.current;

    const key = cacheKey(instanceName, messageKey);
    const cached = refreshCache.get(key);
    if (cached) {
      setUrl(cached);
      setError(null);
      setFailed(false);
      return;
    }

    // Otimização: Cache persistente via Storage Hash
    if (originalUrl) {
      try {
        const hash = await buildFileHash(originalUrl);
        const { data: cacheRow } = await supabase
          .from('media_cache')
          .select('storage_path')
          .eq('file_hash', hash)
          .maybeSingle();
        
        if (cacheRow?.storage_path) {
          log.info(`Media cache hit for ${key}`);
          setUrl(cacheRow.storage_path);
          setError(null);
          setFailed(false);
          return;
        }
      } catch (e) {
        log.warn('Cache hash check failed, proceeding with API refresh', e);
      }
    }

    setIsRefreshing(true);
    setError(null);
    const job = (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('evolution-api/get-media-base64', {
          method: 'POST',
          body: { instanceName, message: { key: messageKey } },
        });
        if (fnError) throw fnError;
        const payload = (data as { base64?: string; mimetype?: string } | null) ?? null;
        if (!payload?.base64) throw new Error('Empty media payload');
        const mime = payload.mimetype || 'application/octet-stream';
        const dataUrl = `data:${mime};base64,${payload.base64}`;
        refreshCache.set(key, dataUrl);

        // Audit & Cache Persistence
        try {
          const hash = await buildFileHash(dataUrl);
          await supabase.from('media_cache').upsert({
            file_hash: hash,
            storage_path: dataUrl, // Em cenários reais, enviaríamos para o storage e salvaríamos a URL
            mime_type: mime,
            size: Math.round(payload.base64.length * 0.75)
          }, { onConflict: 'file_hash' });
        } catch (e) {
          log.warn('Failed to persist media cache', e);
        }

        setUrl(dataUrl);
        setError(null);
        setFailed(false);
      } catch (err) {
        const classified = classifyError(err);
        log.warn(`media refresh failed for ${key}: ${classified.reason} — ${classified.cause?.message}`);
        setError(classified);
        setAttempts((prev) => {
          const next = prev + 1;
          if (next >= maxAttempts) {
            setFailed(true);
            // Anti-flood: 1 toast por mídia por sessão.
            if (!toastedKeys.has(key)) {
              toastedKeys.add(key);
              toast.error('Mídia indisponível', { description: classified.message });
            }
          }
          return next;
        });
      } finally {
        setIsRefreshing(false);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = job;
    return job;
  }, [enabled, instanceName, messageKey, maxAttempts]);

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