/**
 * useMediaRefresh — wrapper conveniente em torno de `useMediaUrl` que
 * funciona como no-op quando não há `refreshKey`. Permite que componentes
 * de mídia (`MessageImage`, `VideoPreview`, `AudioMessagePlayer`) aceitem
 * `refreshKey` como prop opcional sem quebrar usos existentes.
 *
 * Comportamento:
 * - Sem `refreshKey`: retorna { url: null, isRefreshing: false, onError: noop }.
 *   O componente continua usando seu `src` original e ignora erros silenciosamente.
 * - Com `refreshKey`: delega 100% para `useMediaUrl`, que faz o auto-refresh
 *   via `evolution-api/get-media-base64` quando o player dispara `onError`.
 */
import { useCallback } from 'react';
import { useMediaUrl } from './useMediaUrl';
import type { MediaRefreshKey } from '@/types/mediaRefresh';

import type { MediaError } from './useMediaUrl';

interface UseMediaRefreshResult {
  /** data: URL hidratada após refresh; null se ainda não houve refresh. */
  url: string | null;
  isRefreshing: boolean;
  /** Erro classificado da última tentativa (ou null). */
  error: MediaError | null;
  /** True quando esgotamos as tentativas automáticas — UI deve mostrar fallback. */
  failed: boolean;
  onError: () => void;
  /** Retry manual (zera o contador de tentativas). */
  retry: () => Promise<void>;
  /** @deprecated Alias para `retry`. */
  refresh: () => Promise<void>;
}

const noopRefresh = async () => {};

/** No-op wrapper around `useMediaUrl`; when `refreshKey` is omitted returns stable nulls so media components can accept the prop without special-casing it. */
export function useMediaRefresh(originalUrl: string | null | undefined, refreshKey?: MediaRefreshKey): UseMediaRefreshResult {
  const enabled = !!refreshKey;
  const result = useMediaUrl({
    instanceName: refreshKey?.instanceName ?? '',
    originalUrl,
    messageKey: refreshKey ? { remoteJid: refreshKey.remoteJid, fromMe: refreshKey.fromMe, id: refreshKey.id } : null,
    enabled,
  });

  const noopOnError = useCallback(() => {}, []);

  if (!enabled) {
    return {
      url: null,
      isRefreshing: false,
      error: null,
      failed: false,
      onError: noopOnError,
      retry: noopRefresh,
      refresh: noopRefresh,
    };
  }

  // When enabled, we want to surface a refreshed URL only when it actually
  // differs from the original — otherwise prefer keeping `null` so callers
  // fall back to `src ?? originalUrl`.
  const url = result.url && result.url !== originalUrl ? result.url : null;
  return {
    url,
    isRefreshing: result.isRefreshing,
    error: result.error,
    failed: result.failed,
    onError: result.onError,
    retry: result.retry,
    refresh: result.retry,
  };
}
