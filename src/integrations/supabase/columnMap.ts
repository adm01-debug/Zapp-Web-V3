/**
 * columnMap — fonte única da verdade para nomes físicos de coluna no Supabase.
 *
 * Motivação: divergências recorrentes entre nomes canônicos (`name`, `phone`,
 * `agent_id`) e legados (`instance_name`, `remote_jid`) geraram incidentes
 * (instância fantasma, envio para tabela errada, embed nulo virando string).
 * Este módulo descreve, por entidade lógica: coluna canônica, aliases legados
 * aceitos na leitura, `select()` recomendado e defaults para a UI.
 *
 * Convenção: TODO novo acesso a coluna referenciada em código passa por aqui.
 * O CI (`scripts/check-column-map.mjs`) impede regressão de strings legadas
 * (`'instance_name'` fora deste arquivo/aliases documentados).
 */

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface ColumnDescriptor {
  /** Nome físico da coluna no banco. */
  physical: string;
  /** Nomes legados aceitos APENAS na leitura (mapeados p/ canônico ao normalizar). */
  aliases?: readonly string[];
  nullable: boolean;
  /** Fallback para UI quando o valor físico é null/undefined. */
  default?: unknown;
}

export interface EmbedDescriptor {
  kind: 'one' | 'many';
  /** String de select() no formato Supabase, ex: 'profiles:profile_id (id,name)'. */
  select: string;
}

export interface EntityColumnMap<TCanonical extends Record<string, unknown>> {
  table: string;
  columns: { [K in keyof TCanonical]: ColumnDescriptor };
  embeds?: Readonly<Record<string, EmbedDescriptor>>;
  /**
   * Gera a string canônica de `select()`.
   * @param opts.include lista de embeds a incluir (default: nenhum)
   * @param opts.only    restringe a um subset das colunas canônicas
   */
  select(opts?: { include?: readonly string[]; only?: readonly (keyof TCanonical)[] }): string;
}

// -----------------------------------------------------------------------------
// Helper de construção
// -----------------------------------------------------------------------------

function makeSelect<T extends Record<string, unknown>>(
  columns: { [K in keyof T]: ColumnDescriptor },
  embeds?: Readonly<Record<string, EmbedDescriptor>>,
): EntityColumnMap<T>['select'] {
  return ({ include, only } = {}) => {
    const keys = (only ?? (Object.keys(columns) as (keyof T)[]));
    const physical = keys.map((k) => columns[k].physical);
    const parts = [...physical];
    if (include && embeds) {
      for (const name of include) {
        const e = embeds[name];
        if (e) parts.push(e.select);
      }
    }
    return parts.join(', ');
  };
}

// -----------------------------------------------------------------------------
// whatsapp_connections
// -----------------------------------------------------------------------------

export interface WhatsAppConnectionCanonical extends Record<string, unknown> {
  id: string;
  name: string;
  instance_id: string | null;
  status: string | null;
  phone_number: string | null;
  qr_code: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const whatsappConnectionsMap: EntityColumnMap<WhatsAppConnectionCanonical> = {
  table: 'whatsapp_connections',
  columns: {
    id:           { physical: 'id',           nullable: false },
    // Canônico: 'name'. Alias 'instance_name' aceito só na leitura (linhas legadas).
    name:         { physical: 'name',         aliases: ['instance_name'], nullable: false, default: 'Sem nome' },
    // UUID interno da Evolution. NÃO usar como identificador de roteamento —
    // toda chamada à Evolution API usa `name` (ver src/lib/evolutionInstance.ts).
    instance_id:  { physical: 'instance_id',  nullable: true },
    status:       { physical: 'status',       nullable: true, default: 'unknown' },
    phone_number: { physical: 'phone_number', nullable: true },
    qr_code:      { physical: 'qr_code',      nullable: true },
    created_at:   { physical: 'created_at',   nullable: true },
    updated_at:   { physical: 'updated_at',   nullable: true },
  },
  select: null as never,
};
whatsappConnectionsMap.select = makeSelect(whatsappConnectionsMap.columns);

// -----------------------------------------------------------------------------
// contacts
// -----------------------------------------------------------------------------

export interface ContactCanonical extends Record<string, unknown> {
  id: string;
  name: string;
  phone: string | null;
  /** Formato Evolution (`5511...@s.whatsapp.net`); coexiste com `phone` normalizado. */
  remote_jid: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export const contactsMap: EntityColumnMap<ContactCanonical> = {
  table: 'contacts',
  columns: {
    id:          { physical: 'id',          nullable: false },
    name:        { physical: 'name',        aliases: ['push_name'], nullable: false, default: 'Sem nome' },
    phone:       { physical: 'phone',       nullable: true },
    remote_jid:  { physical: 'remote_jid',  nullable: true },
    assigned_to: { physical: 'assigned_to', nullable: true },
    queue_id:    { physical: 'queue_id',    nullable: true },
    created_at:  { physical: 'created_at',  nullable: true },
    updated_at:  { physical: 'updated_at',  nullable: true },
  },
  select: null as never,
};
contactsMap.select = makeSelect(contactsMap.columns);

// -----------------------------------------------------------------------------
// profiles
// -----------------------------------------------------------------------------

export interface ProfileCanonical extends Record<string, unknown> {
  id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  is_active: boolean;
  max_chats: number;
}

export const profilesMap: EntityColumnMap<ProfileCanonical> = {
  table: 'profiles',
  columns: {
    id:         { physical: 'id',         nullable: false },
    user_id:    { physical: 'user_id',    nullable: true },
    name:       { physical: 'name',       nullable: false, default: 'Sem nome' },
    email:      { physical: 'email',      nullable: true },
    avatar_url: { physical: 'avatar_url', nullable: true },
    role:       { physical: 'role',       nullable: true },
    is_active:  { physical: 'is_active',  nullable: false, default: true },
    max_chats:  { physical: 'max_chats',  nullable: false, default: 5 },
  },
  select: null as never,
};
profilesMap.select = makeSelect(profilesMap.columns);

// -----------------------------------------------------------------------------
// messages
// -----------------------------------------------------------------------------

export interface MessageCanonical extends Record<string, unknown> {
  id: string;
  contact_id: string | null;
  whatsapp_connection_id: string | null;
  sender: string;
  content: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean | null;
  agent_id: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  transcription: string | null;
  transcription_status: string | null;
  status: string | null;
  status_updated_at: string | null;
  is_deleted: boolean | null;
  channel_type: string | null;
  channel_connection_id: string | null;
  is_edited: boolean;
  media_meta: Record<string, unknown> | null;
  media_type: string | null;
  media_mimetype: string | null;
  link_preview: Record<string, unknown> | null;
  reply_to_id: string | null;
  deleted_at: string | null;
}

export const messagesMap: EntityColumnMap<MessageCanonical> = {
  table: 'messages',
  columns: {
    id:                     { physical: 'id',                     nullable: false },
    contact_id:             { physical: 'contact_id',             nullable: true },
    whatsapp_connection_id: { physical: 'whatsapp_connection_id', nullable: true },
    sender:                 { physical: 'sender',                 nullable: false },
    content:                { physical: 'content',                nullable: false, default: '' },
    message_type:           { physical: 'message_type',           nullable: false, default: 'text' },
    media_url:              { physical: 'media_url',              nullable: true },
    is_read:                { physical: 'is_read',                nullable: true },
    // Canônico: 'agent_id'. Alias 'sender_id' aceito só na leitura de legados.
    agent_id:               { physical: 'agent_id',               aliases: ['sender_id'], nullable: true },
    external_id:            { physical: 'external_id',            nullable: true },
    created_at:             { physical: 'created_at',             nullable: false },
    updated_at:             { physical: 'updated_at',             nullable: false },
    transcription:          { physical: 'transcription',          nullable: true },
    transcription_status:   { physical: 'transcription_status',   nullable: true },
    status:                 { physical: 'status',                 nullable: true },
    status_updated_at:      { physical: 'status_updated_at',      nullable: true },
    is_deleted:             { physical: 'is_deleted',             nullable: true },
    channel_type:           { physical: 'channel_type',           nullable: true },
    channel_connection_id:  { physical: 'channel_connection_id',  nullable: true },
    is_edited:              { physical: 'is_edited',              nullable: false, default: false },
    media_meta:             { physical: 'media_meta',             nullable: true },
    media_type:             { physical: 'media_type',             nullable: true },
    media_mimetype:         { physical: 'media_mimetype',         nullable: true },
    link_preview:           { physical: 'link_preview',           nullable: true },
    reply_to_id:            { physical: 'reply_to_id',            nullable: true },
    deleted_at:             { physical: 'deleted_at',             nullable: true },
  },
  embeds: {
    contact:    { kind: 'one', select: 'contact:contact_id (id, name, phone, remote_jid)' },
    connection: { kind: 'one', select: 'connection:whatsapp_connection_id (id, name)' },
  },
  select: null as never,
};
messagesMap.select = makeSelect(messagesMap.columns, messagesMap.embeds);

// -----------------------------------------------------------------------------
// failed_messages (DLQ)
// -----------------------------------------------------------------------------

export interface FailedMessageCanonical extends Record<string, unknown> {
  id: string;
  instance_name: string | null;
  message_id: string | null;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  status: string | null;
  created_at: string | null;
}

export const failedMessagesMap: EntityColumnMap<FailedMessageCanonical> = {
  table: 'failed_messages',
  columns: {
    // Nota: `failed_messages.instance_name` É o nome canônico neste domínio
    // (o registro é escrito por edge functions que só conhecem o nome Evolution).
    id:            { physical: 'id',            nullable: false },
    instance_name: { physical: 'instance_name', nullable: true },
    message_id:    { physical: 'message_id',    nullable: true },
    error_message: { physical: 'error_message', nullable: true },
    retry_count:   { physical: 'retry_count',   nullable: false, default: 0 },
    next_retry_at: { physical: 'next_retry_at', nullable: true },
    status:        { physical: 'status',        nullable: true, default: 'pending' },
    created_at:    { physical: 'created_at',    nullable: true },
  },
  select: null as never,
};
failedMessagesMap.select = makeSelect(failedMessagesMap.columns);

// -----------------------------------------------------------------------------
// queue_members
// -----------------------------------------------------------------------------

export interface QueueMemberCanonical extends Record<string, unknown> {
  queue_id: string;
  profile_id: string;
  is_active: boolean;
}

export const queueMembersMap: EntityColumnMap<QueueMemberCanonical> = {
  table: 'queue_members',
  columns: {
    queue_id:   { physical: 'queue_id',   nullable: false },
    profile_id: { physical: 'profile_id', nullable: false },
    is_active:  { physical: 'is_active',  nullable: false, default: true },
  },
  select: null as never,
};
queueMembersMap.select = makeSelect(queueMembersMap.columns);

// -----------------------------------------------------------------------------
// Index agregado
// -----------------------------------------------------------------------------

export const columnMap = {
  whatsapp_connections: whatsappConnectionsMap,
  contacts:             contactsMap,
  profiles:             profilesMap,
  messages:             messagesMap,
  failed_messages:      failedMessagesMap,
  queue_members:        queueMembersMap,
} as const;

export type ColumnMapEntity = keyof typeof columnMap;

/**
 * Resolve nome físico de coluna a partir do canônico OU de um alias legado.
 * Útil em normalizers que aceitam ambos os shapes de linha.
 */
export function resolvePhysicalColumn<E extends ColumnMapEntity>(
  entity: E,
  key: string,
): string | undefined {
  const cols = columnMap[entity].columns as Record<string, ColumnDescriptor>;
  const direct = cols[key];
  if (direct) return direct.physical;
  for (const [canonical, desc] of Object.entries(cols)) {
    if (desc.aliases?.includes(key)) return columnMap[entity].columns[canonical as never].physical;
  }
  return undefined;
}
