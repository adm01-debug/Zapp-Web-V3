/**
 * rowNormalizers — wrappers finos sobre `columnMap` que devolvem shapes canônicos.
 *
 * Regra: sempre que uma linha de leitura pode chegar em formatos divergentes
 * (aliases legados, embed null vs objeto vs array), este arquivo é o único ponto
 * de conversão. Consumidores importam daqui, nunca acessam colunas legadas direto.
 */

import {
  columnMap,
  type WhatsAppConnectionCanonical,
  type ContactCanonical,
  type MessageCanonical,
} from './columnMap';

// Re-exporta os normalizadores de profile já consolidados em features/admin,
// documentando que aquele arquivo é o "caso especial" do columnMap.
export {
  normalizeProfileRef,
  normalizeAgentProfile,
  type AdminProfileRef,
  type AdminAgentProfile,
} from '@/features/admin/utils/profileMappers';

// -----------------------------------------------------------------------------
// whatsapp_connections
// -----------------------------------------------------------------------------

type ConnRow = Partial<WhatsAppConnectionCanonical> & {
  /** Alias legado — algumas linhas antigas guardam o nome aqui. */
  instance_name?: string | null;
};

export function normalizeConnection(row: ConnRow | null | undefined): WhatsAppConnectionCanonical | null {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
  const nameDefault = columnMap.whatsapp_connections.columns.name.default as string;
  const name = (row.name ?? row.instance_name ?? '').toString().trim() || nameDefault;
  return {
    id: row.id,
    name,
    instance_id: row.instance_id ?? null,
    status: row.status ?? (columnMap.whatsapp_connections.columns.status.default as string),
    phone_number: row.phone_number ?? null,
    qr_code: row.qr_code ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * Nome de instância utilizável nas rotas da Evolution API.
 * Delega para o descriptor `whatsapp_connections` para conhecer aliases legados.
 * Retorna `null` quando só há UUID (a chamada NÃO deve ser feita nesse caso).
 */
export function evolutionInstanceName(
  conn: { name?: string | null; instance_name?: string | null; instance_id?: string | null } | null | undefined,
): string | null {
  if (!conn) return null;
  const canonical = conn.name?.trim();
  const legacyAlias = conn.instance_name?.trim(); // alias documentado em columnMap
  const legacyId = conn.instance_id?.trim();
  const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const pick = [canonical, legacyAlias, legacyId].find((v) => v && !isUuid(v));
  return pick || null;
}

// -----------------------------------------------------------------------------
// contacts
// -----------------------------------------------------------------------------

type ContactRow = Partial<ContactCanonical> & {
  push_name?: string | null;
};

export function normalizeContact(row: ContactRow | null | undefined): ContactCanonical | null {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
  const nameDefault = columnMap.contacts.columns.name.default as string;
  const name = (row.name ?? row.push_name ?? '').toString().trim() || nameDefault;
  return {
    id: row.id,
    name,
    phone: row.phone ?? null,
    remote_jid: row.remote_jid ?? null,
    assigned_to: row.assigned_to ?? null,
    queue_id: row.queue_id ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

// -----------------------------------------------------------------------------
// messages
// -----------------------------------------------------------------------------

type MessageRow = Partial<MessageCanonical> & {
  sender_id?: string | null; // alias legado
  external_message_id?: string | null; // alias legado (schema antigo)
};

export function normalizeMessage(row: MessageRow | null | undefined): MessageCanonical | null {
  if (!row || typeof row !== 'object' || typeof row.id !== 'string') return null;
  const cols = columnMap.messages.columns;
  return {
    id: row.id,
    contact_id: row.contact_id ?? null,
    whatsapp_connection_id: row.whatsapp_connection_id ?? null,
    sender: row.sender ?? '',
    content: row.content ?? (cols.content.default as string),
    message_type: row.message_type ?? (cols.message_type.default as string),
    media_url: row.media_url ?? null,
    is_read: row.is_read ?? null,
    agent_id: row.agent_id ?? row.sender_id ?? null,
    external_id: row.external_id ?? row.external_message_id ?? null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    transcription: row.transcription ?? null,
    transcription_status: row.transcription_status ?? null,
    status: row.status ?? null,
    status_updated_at: row.status_updated_at ?? null,
    is_deleted: row.is_deleted ?? null,
    channel_type: row.channel_type ?? null,
    channel_connection_id: row.channel_connection_id ?? null,
    is_edited: row.is_edited ?? (cols.is_edited.default as boolean),
    media_meta: row.media_meta ?? null,
    media_type: row.media_type ?? null,
    media_mimetype: row.media_mimetype ?? null,
    link_preview: row.link_preview ?? null,
    reply_to_id: row.reply_to_id ?? null,
    deleted_at: row.deleted_at ?? null,
  };
}
