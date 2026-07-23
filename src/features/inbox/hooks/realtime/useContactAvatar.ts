import { useState, useEffect } from 'react';
import { getContactAvatar, seedAvatarCache } from './avatarBatchStore';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactAvatar');

/**
 * Hook para obter o avatar de um contato com carregamento em lote e cache.
 *
 * - Se `initialUrl` é fornecido (já populado pela lista de conversas), usa
 *   imediatamente E semeia o cache para que outros chamadores do mesmo jid
 *   não disparem novo round-trip.
 * - Se não, agenda fetch em batch.
 * - Falhas do batch viram `null` (UI cai no AvatarFallback com iniciais).
 */
/** Resolves and caches a contact's WhatsApp profile picture URL; uses initialUrl immediately if available, otherwise batches the fetch via avatarBatchStore. */
export function useContactAvatar(jid: string | null | undefined, initialUrl?: string | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUrl || null);
  const [loading, setLoading] = useState(!initialUrl && !!jid);

  useEffect(() => {
    if (initialUrl) {
      // Sincroniza com o cache global para evitar refetch de outros consumidores
      // do mesmo jid (ChatHeader, MessageBubble, NewMessageIndicator, etc.).
      if (jid) seedAvatarCache(jid, initialUrl);
      setAvatarUrl(initialUrl);
      setLoading(false);
      return;
    }

    if (!jid) {
      setAvatarUrl(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    getContactAvatar(jid)
      .then((url) => {
        if (!mounted) return;
        if (!url && jid) {
          log.debug('Avatar resolveu para nulo/vazio', { jid });
        }
        setAvatarUrl(url);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Defesa em profundidade: o batchStore não lança, mas se algo mudar
        // no futuro, a UI não pode quebrar — apenas cai no fallback.
        if (!mounted) return;
        log.warn('Avatar fetch threw, falling back to null', {
          jid,
          error: err instanceof Error ? err.message : String(err),
        });
        setAvatarUrl(null);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [jid, initialUrl]);

  return { avatarUrl, loading };
}
