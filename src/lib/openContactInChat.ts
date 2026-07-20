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
 *
 * CORREÇÃO BUG #3: `remoteJid` é normalizado para sempre incluir o sufixo
 * `@s.whatsapp.net` quando fornecido como número puro (ex: "5564984450900").
 * Sem isso, o `handshakeId` ficava como bare phone, passava pelo guard
 * `!pending.includes('@')` em useInboxDeepLinks como se fosse UUID, e chegava
 * em markAsRead 15× via loop tryDispatch, gerando 15 WARNs por clique.
 */
import { supabase } from '@/integrations/supabase/client';

/** Options for opening the inbox on a specific contact, identified by UUID, JID, or phone number. */
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

/** Resolved contact target stored on window while the inbox navigates to the contact. */
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
    /** Cancels the current in-flight dispatch retry loop. Called by the inbox
     *  listener once it has successfully handled the open-contact-chat event,
     *  stopping the remaining up-to-15-attempt chain early. */
    __cancelPendingOpenLoop?: () => void;
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
  const { data } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle();
  return data?.id ?? null;
}

/** open Contact In Chat function. */
export async function openContactInChat(opts: OpenContactInChatOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const contactId = await resolveContactId(opts);
  if (!contactId) return false;

  const phone = opts.phone ?? jidToPhone(opts.remoteJid) ?? null;

  // FIX Bug#3: Normalize remoteJid — opts.remoteJid may arrive as a bare phone
  // number (e.g. "5564984450900") without the "@s.whatsapp.net" suffix.
  // Bare numbers bypass useInboxDeepLinks' `!pending.includes('@')` guard and
  // are mistakenly treated as UUIDs, causing markAsRead to warn 15× per click.
  const remoteJid = opts.remoteJid
    ? (opts.remoteJid.includes('@') ? opts.remoteJid : `${opts.remoteJid}@s.whatsapp.net`)
    : (phone ? `${phone}@s.whatsapp.net` : undefined);

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
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  // Expose cancel so the inbox listener can stop the loop early on first success.
  window.__cancelPendingOpenLoop = cancel;

  const tryDispatch = () => {
    // Bail out if a newer openContactInChat() call superseded this one,
    // or if cancel() was called externally (e.g. by the inbox on success).
    if (window.__pendingOpenLoopId !== loopId) return;

    retryTimer = null;
    attempts++;
    window.dispatchEvent(
      new CustomEvent('open-contact-chat', {
        detail: { contactId: handshakeId, messageId: target.messageId },
      })
    );
    if (attempts < 15) retryTimer = setTimeout(tryDispatch, 200);
  };
  retryTimer = setTimeout(tryDispatch, 150);

  return true;
}