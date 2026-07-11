/**
 * openContactInChat — utilitário centralizado para abrir o Inbox em um
 * contato específico e (opcionalmente) destacar uma mensagem.
 *
 * O Inbox identifica contatos pelo `id` interno (UUID em `contacts.id`).
 * Quando o caller só tem `remoteJid` (ex: AdminFailedMessages, busca
 * global) ou apenas o telefone, este helper faz o lookup contra a
 * tabela `contacts` antes de disparar o handshake.
 *
 * Handshake (compatível com `useContactsCRUD.openContactChat`):
 *  - `window.__pendingOpenContactId` cobre o "primeiro paint" do Inbox
 *    (módulo lazy ainda não carregado).
 *  - `window.__pendingOpenChatTarget` carrega `messageId` opcional.
 *  - Eventos `open-contact-chat` repetidos por ~3 s cobrem o caso
 *    "Inbox já montado / hash trocado".
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

export async function openContactInChat(opts: OpenContactInChatOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const contactId = await resolveContactId(opts);
  if (!contactId) return false;

  // Phone/JID resolution: o Inbox em modo externo (FATOR X) identifica
  // conversas pelo `remote_jid` (ex: `5511999@s.whatsapp.net`), não pelo
  // UUID local. Quando temos o telefone, derivamos o JID e o entregamos
  // ao handshake — caso contrário caímos no UUID legado.
  const phone = opts.phone ?? jidToPhone(opts.remoteJid) ?? null;
  const remoteJid = opts.remoteJid ?? (phone ? `${phone}@s.whatsapp.net` : undefined);
  const handshakeId = remoteJid ?? contactId;

  const target: PendingChatTarget = {
    contactId,
    remoteJid,
    phone: phone ?? undefined,
    messageId: opts.messageId,
  };

  window.__pendingOpenContactId = handshakeId;
  window.__pendingOpenChatTarget = target;

  // Persist the deep-link target in the URL query string so a refresh
  // (or sharing the link) keeps the inbox aimed at the same conversation
  // and message. The Inbox reads `?contact=<id>&message=<id>` on mount
  // and clears `message` after the highlight is consumed.
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
      // Notify hash listeners (replicates the side effect of assigning to
      // `location.hash`, which `pushState` doesn't trigger on its own).
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.history.replaceState(null, '', url.toString());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  } catch {
    // URL construction can fail in non-browser test envs — fall back to
    // the original hash-only behavior so the handshake still runs.
    if (window.location.hash !== '#inbox') {
      window.location.hash = 'inbox';
    } else {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }

  let attempts = 0;
  const tryDispatch = () => {
    attempts++;
    window.dispatchEvent(
      new CustomEvent('open-contact-chat', {
        detail: { contactId: handshakeId, messageId: target.messageId },
      })
    );
    if (attempts < 15) setTimeout(tryDispatch, 200);
  };
  setTimeout(tryDispatch, 150);

  return true;
}
