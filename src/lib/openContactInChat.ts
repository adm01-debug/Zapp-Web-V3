/**
 * openContactInChat — utilitário centralizado para abrir o Inbox em um
 * contato específico e (opcionalmente) destacar uma mensagem.
 *
 * CORREÇÃO BUG #1: o evento `open-contact-chat` agora carrega o UUID real em
 * `contactId` e o JID em `remoteJid` como campo separado. Anteriormente
 * `contactId` recebia o `handshakeId` que podia ser o JID quando `remoteJid`
 * estava disponível, causando 15 WARNs por navegação em RealtimeMessages
 * (markAsRead recebe JID, UUID guard bloqueia corretamente mas o loop de 15
 * tentativas continuava até o fim — gerando 15 WARN no console).
 *
 * CORREÇÃO BUG #2: `__pendingOpenLoopId` cancela o retry loop quando uma
 * chamada mais nova substitui a anterior, evitando acúmulo de múltiplos loops
 * de 15 tentativas simultâneos quando o usuário navega rapidamente entre
 * contatos.
 */
import { supabase } from '@/integrations/supabase/client';

export interface OpenContactInChatOptions {
  /** UUID interno (`contacts.id`). Quando presente, evita o lookup. */
  contactId?: string;
  /** JID Whatsapp completo (ex: `5511999999999@s.whatsapp.net`). */
  remoteJid?: string;
  /** Telefone normalizado (somente dígitos). */
  phone?: string;
  /** ID interno (`messages.id`) ou `external_id` para destacar. */
  messageId?: string;
}

export interface PendingChatTarget {
  contactId?: string;
  remoteJid?: string;
  phone?: string;
  messageId?: string;
}

declare global {
  interface Window {
    __pendingOpenContactId?: string;
    __pendingOpenChatTarget?: PendingChatTarget;
    /** Symbol refreshed on every openContactInChat() call. Old retry loops
     *  compare their captured snapshot against this value and bail out when
     *  superseded — prevents multiple 15-attempt loops from stacking up. */
    __pendingOpenLoopId?: symbol;
  }
}

/** Extrai dígitos de um JID `<number>@s.whatsapp.net` (ou variantes). */
export function jidToPhone(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const at = jid.indexOf('@');
  const raw = at === -1 ? jid : jid.slice(0, at);
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

async function resolveContactId(opts: OpenContactInChatOptions): Promise<string | null> {
  if (opts.contactId) return opts.contactId;
  const phone = opts.phone ?? jidToPhone(opts.remoteJid);
  if (!phone) return null;
  const { data, error } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  return data?.id ?? null;
}

export async function openContactInChat(opts: OpenContactInChatOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const contactId = await resolveContactId(opts);
  if (!contactId) return false;

  const phone = opts.phone ?? jidToPhone(opts.remoteJid) ?? null;
  const remoteJid = opts.remoteJid ?? (phone ? `${phone}@s.whatsapp.net` : undefined);

  // handshakeId para os globals legacy — Inbox em modo externo procura o JID
  const handshakeId = remoteJid ?? contactId;

  const target: PendingChatTarget = {
    contactId,
    remoteJid,
    phone: phone ?? undefined,
    messageId: opts.messageId,
  };

  window.__pendingOpenContactId = handshakeId;
  window.__pendingOpenChatTarget = target;

  // Loop ID: detecta quando uma chamada mais nova substitui esta
  const loopId = Symbol();
  window.__pendingOpenLoopId = loopId;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('contact', handshakeId);
    if (target.messageId) {
      url.searchParams.set('message', target.messageId);
    } else {
      url.searchParams.delete('message');
    }
    if (url.hash !== '#inbox') {
      url.hash = 'inbox';
      window.history.pushState(null, '', url.toString());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.history.replaceState(null, '', url.toString());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch {
    if (window.location.hash !== '#inbox') {
      window.location.hash = 'inbox';
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }

  let attempts = 0;
  const tryDispatch = () => {
    // Bail out if a newer openContactInChat() call superseded this one
    if (window.__pendingOpenLoopId !== loopId) return;

    attempts++;
    window.dispatchEvent(
      new CustomEvent('open-contact-chat', {
        detail: {
          /**
           * CRITICAL FIX: always the real DB UUID, never the JID.
           *
           * Previously `handshakeId` (which could be a JID like
           * "5564984450900@s.whatsapp.net") was used here as `contactId`.
           * RealtimeMessages.markAsRead() received the JID, the UUID guard
           * correctly blocked it but logged a WARN on all 15 retry attempts,
           * flooding the console.
           */
          contactId,
          /** JID for external-mode (FATOR X) receivers that need remoteJid. */
          remoteJid: remoteJid ?? undefined,
          phone: phone ?? undefined,
          messageId: target.messageId,
        },
      }),
    );
    if (attempts < 15) setTimeout(tryDispatch, 200);
  };
  setTimeout(tryDispatch, 150);

  return true;
}
