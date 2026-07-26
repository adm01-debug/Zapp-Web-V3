import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getLogger } from '@/lib/logger';

const log = getLogger('useInboxDeepLinks');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normaliza um identificador de handshake para o `remote_jid` usado pela Inbox
 * em modo externo. Retorna `null` apenas quando o valor e um UUID legado, que
 * nao tem correspondencia direta com um JID.
 */
function toRemoteJid(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.includes('@')) return raw; // ja e JID (@s.whatsapp.net / @lid / @g.us)
  if (UUID_RE.test(raw)) return null; // UUID legado: sem traducao possivel
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  return digits + '@s.whatsapp.net';
}

interface DeepLinkHandlers {
  setPendingContactId: (id: string | null) => void;
  setPendingMessageId: (id: string | null) => void;
  useExternalDb: boolean;
}

/** Reads deep-link `?contact=` / `?message=` URL params, legacy window globals, and the `open-contact-chat` custom event to set the pending contact/message on mount. */
export function useInboxDeepLinks({
  setPendingContactId,
  setPendingMessageId,
  useExternalDb,
}: DeepLinkHandlers) {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const appWindow = window as Window & {
      __pendingOpenContactId?: string;
    };

    // 1) Handle URL search params
    const urlContact = searchParams.get('contact');
    const urlMessage = searchParams.get('message');

    if (urlContact?.trim()) {
      log.info('Deep-link: found pending contact', { contactId: urlContact.trim() });
      setPendingContactId(urlContact.trim());
    }

    if (urlMessage?.trim()) {
      log.info('Deep-link: found pending message highlight', { messageId: urlMessage.trim() });
      setPendingMessageId(urlMessage.trim());
    }

    // 2) Handle legacy global window pending contact (from non-React code or older logic)
    if (appWindow.__pendingOpenContactId) {
      const pending = appWindow.__pendingOpenContactId;
      // In external mode (FATOR X) the Inbox identifies contacts by `remote_jid`.
      // Um handshake chega em 3 formatos: (a) JID completo, (b) UUID legado ou
      // (c) telefone puro. Apenas (b) e inservivel. Antes, (c) tambem era
      // descartado -- por isso o deep-link com '556191039392' nunca abria a
      // conversa e so aparecia um WARN no console.
      const resolved = useExternalDb ? toRemoteJid(pending) : pending;
      if (resolved) {
        setPendingContactId(resolved);
      } else {
        log.warn('Ignoring legacy UUID handshake in external mode', { pending });
      }
      appWindow.__pendingOpenContactId = undefined;
    }

    // 3) Custom events
    // FIX B2: em external mode (FATOR X), a Inbox indexa por remote_jid; priorizar
    // o JID quando disponível para evitar que o UUID sobrescreva o handshake correto.
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { contactId?: string; remoteJid?: string; messageId?: string }
        | undefined;
      const resolvedId = useExternalDb
        ? (detail?.remoteJid ?? detail?.contactId)
        : detail?.contactId;
      if (resolvedId) {
        setPendingContactId(resolvedId);
        // Cancel the dispatch retry loop: the inbox has now received the event,
        // so there is no need to keep firing for up to 15 more iterations.
        (window as Window & { __cancelPendingOpenLoop?: () => void }).__cancelPendingOpenLoop?.();
      }
      if (detail?.messageId) setPendingMessageId(detail.messageId);
    };

    window.addEventListener('open-contact-chat', handler);
    return () => window.removeEventListener('open-contact-chat', handler);
  }, [searchParams, setPendingContactId, setPendingMessageId, useExternalDb]);
}
