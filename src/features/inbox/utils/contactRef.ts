/**
 * Identidade canônica de um contato no inbox.
 *
 * PROBLEMA: o módulo trata `contact.id` de forma ambígua:
 * - Modo externo (USE_EXTERNAL_DB=true)  → remote_jid (WhatsApp JID)
 * - Modo local                            → UUID (Postgres)
 *
 * Filtrar uma coluna `uuid` com um JID gera PostgREST 400:
 *   "invalid input syntax for type uuid"
 *
 * Cada consulta ao banco DEVE resolver a identidade aqui primeiro.
 *
 * Uso:
 *   import { resolveContactRef, isUuidRef } from '@/features/inbox/utils/contactRef';
 *   const ref = resolveContactRef(selectedContactId);
 *   if (!ref) return;
 *   if (isUuidRef(ref)) { ...supabase.from('contacts').eq('id', ref.uuid)... }
 *   else                { ...supabase.from('evolution_contacts').eq('remote_jid', ref.remoteJid)... }
 */

import { isValidUUID } from '@/utils/uuid';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContactRef =
  | { kind: 'uuid'; uuid: string; raw: string }
  | {
      kind: 'jid';
      remoteJid: string;
      /** Telefone extraído do JID (sem sufixo e sem não-dígitos), ou null para grupos. */
      phone: string | null;
      /** true quando o JID termina com @g.us (grupo). */
      isGroup: boolean;
      raw: string;
    };

// ── Constants ─────────────────────────────────────────────────────────────────

const JID_SUFFIXES = ['@s.whatsapp.net', '@g.us', '@lid', '@broadcast'] as const;

/** Número de telefone puro: 8 a 15 dígitos, comum em JIDs sem sufixo explícito. */
const PHONE_ONLY_RE = /^\d{8,15}$/;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a identidade canônica de um contato a partir do valor bruto.
 *
 * - UUID (formato 8-4-4-4-12)  → `{ kind: 'uuid', uuid, raw }`
 * - JID (com ou sem sufixo @s.whatsapp.net / @g.us / @lid / @broadcast)
 *   → `{ kind: 'jid', remoteJid, phone, isGroup, raw }`
 * - Número de telefone puro (8-15 dígitos) → tratado como JID sem sufixo
 * - null / undefined / string vazia → `null`
 *
 * Um valor que não se encaixa em nenhuma das categorias é tratado como JID
 * (degradação segura — o banco rejeitará se for inválido).
 */
export function resolveContactRef(raw: string | null | undefined): ContactRef | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // ── Caminho UUID ──────────────────────────────────────────
  if (isValidUUID(value)) {
    return { kind: 'uuid', uuid: value.toLowerCase(), raw: value };
  }

  // ── Caminho JID ───────────────────────────────────────────
  const str = value as string;
  // @broadcast JIDs (status@broadcast) are not groups but have no phone either
  const isGroup = str.endsWith('@g.us');
  // @lid JIDs use a device privacy identifier — numeric portion is NOT an E.164 phone
  const isLid = str.endsWith('@lid');
  const hasSuffix = JID_SUFFIXES.some((s) => str.endsWith(s));
  const remoteJid = hasSuffix
    ? value
    : PHONE_ONLY_RE.test(value)
      ? `${value}@s.whatsapp.net`
      : value;

  const phone = isGroup || isLid ? null : remoteJid.split('@')[0]?.replace(/\D/g, '') || null;

  return { kind: 'jid', remoteJid, phone, isGroup, raw: value };
}

/**
 * Type guard: `true` quando a referência pode ser usada como filtro
 * em coluna `uuid` (ex.: `contacts.id`, `messages.contact_id`).
 */
export function isUuidRef(ref: ContactRef | null): ref is Extract<ContactRef, { kind: 'uuid' }> {
  return ref?.kind === 'uuid';
}

/**
 * Type guard: `true` quando a referência pode ser usada como filtro
 * em coluna `remote_jid` (ex.: `evolution_messages.remote_jid`).
 */
export function isJidRef(ref: ContactRef | null): ref is Extract<ContactRef, { kind: 'jid' }> {
  return ref?.kind === 'jid';
}

/**
 * Converte um ContactRef para string bruta (útil para logs e comparações).
 */
export function contactRefToString(ref: ContactRef | null): string {
  if (!ref) return '(null)';
  return ref.raw;
}
