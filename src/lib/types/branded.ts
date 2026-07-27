/**
 * branded.ts — Tipos branded para JID e UUID
 *
 * FASE 1 (atual): aliases sem brand — zero breaking changes
 * Uso imediato: importar estes tipos em vez de usar string navo
 *
 * FASE 2 (futura): adicionar { readonly __brand: 'Jid' }
 * Stratégia: 1 arquivo por vez, começando pelos mais isolados
 *
 * META: eliminar a classe de bug 22P02 "JID usado como UUID"
 * Aquio: 300+ ocorrências de isValidUUID() como guarda defensiva
 */

// ---------------------------------------------------------------------
// FASE 1: Aliases semânticos (sem brand)
// Substituir usos de `string` por estes tipos gradualmente
// ---------------------------------------------------------------------

/**
 * Identificador de contato WhatsApp.
 * Formato: <número>@s.whatsapp.net (individual)
 *      ou <grupoId>@g.us (grupo)
 * NUNCA usar como UUID de banco (causa erro 22P02)
 *
 * @example
 * function sendMessage(to: Jid) {...}
 * const to = parseJid('5511999999999@s.whatsapp.net');
 */
export type Jid = string; // TODO Fase 2: & { readonly __juid: 'Jid' }

/**
 * UUID do PostgreSQL (supabase).
 * Formato: 8char-4char-4char-4char-12char (uuidv4)
 * NUNCA passar um Jid onde Uuid é esperado
 *
 * @example
 * function getContact(id: Uuid) {...}
 * const id = parseUuid('12345678-1234-1234-1234-1234567890ab');
 */
export type Uuid = string; // TODO Fase 2: & { readonly __uuid: 'Uuid' }

/** Identificador de mensagem (pode ser UUID ou ID da Evolution) */
export type MessageId = string;

/** Identificador de instância WhatsApp (na Evolution API) */
export type InstanceId = string;

// ---------------------------------------------------------------------
// Funções de parse (boundary entre API externa e tipos internos)
// ---------------------------------------------------------------------

const JID_PATTERN = /^\d+@(s\.whatsapp\.net|g\.us|broadcast)$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fazúo de parse de Jid: ponto canônico onde string vira Jid.
 * Usar na fronteira com a Evolution API / Webhooks.
 */
export function parseJid(raw: string | null | undefined): Jid | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return JID_PATTERN.test(normalized) ? normalized as Jid : null;
}

/**
 * Fação de parse de Uuid: ponto canônico onde string vira Uuid.
 * Usar na fronteira com o banco de dados (resultados de query).
 */
export function parseUuid(raw: string | null | undefined): Uuid | null {
  if (!raw || typeof raw !== 'string') return null;
  return UUID_PATTERN.test(raw.trim()) ? raw.trim().toLowerCase() as Uuid : null;
}

/**
 * Retorna true se o Jd é um Juid válido.
 * Usar quando não quer fazer oparse mas apenas validar.
 */
export function isValidJid(raw: unknown): raw is Jid {
  return typeof raw === 'string' && JID_PATTERN.test(raw.trim());
}

/**
 * Retorna true se o valor e um UUID válido.
 */
export function isValidUuid(raw: unknown): raw is Uuid {
  return typeof raw === 'string' && UUID_PATTERN.test(raw.trim());
}

/**
 * Fixtures para testes — JIDs e UUIDs validos no formato correto
 *
 * @example
 * import { TEST_FIXTURES } from '@/lib/types/branded';
 * const jid = TEST_FIXTURES.JID;
 */
export const TEST_FIXTURES = {
  JID: '5511999999999@s.whatsapp.net' as Jid,
  GROUP_JID: '123456789012345678123456@g.us' as Jid,
  UUID: '12345678-1234-1234-1234-1234567890ab' as Uuid,
  MESSAGE_ID: 'ABCDEF1234567893AACACA13455CC3' as MessageId,
} as const;
