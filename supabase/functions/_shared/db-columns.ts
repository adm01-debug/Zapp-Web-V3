/**
 * db-columns.ts — MED-7 contract hardening
 *
 * Nomes canônicos de colunas usadas em Edge Functions críticas.
 * Toda Edge Function que consulta essas tabelas DEVE importar as
 * constantes daqui em vez de literal strings.
 *
 * Regressão histórica evitada: evolution-api usava `.eq('instance_id', instance)`
 * quando a coluna correta é `instance_name`. Um typo silencioso derrubou o
 * fluxo de conexão por semanas. Referenciar constantes garante detecção em
 * build-time (import inexistente) e simplifica refactors futuros.
 */

export const WHATSAPP_CONNECTIONS = {
  table: 'whatsapp_connections',
  columns: {
    id: 'id',
    /** Nome público da instância Evolution (chave lógica) */
    instance_name: 'instance_name',
    /** UUID interno; NÃO usar para filtrar por nome */
    instance_id: 'instance_id',
    status: 'status',
    qr_code: 'qr_code',
    phone_number: 'phone_number',
    whatsapp_connection_id: 'whatsapp_connection_id',
  },
} as const;

/** C O N T A C T S constant. */
export const CONTACTS = {
  table: 'contacts',
  columns: {
    id: 'id',
    phone: 'phone',
    remote_jid: 'remote_jid',
    push_name: 'push_name',
    instance: 'instance',
    assigned_to: 'assigned_to',
    queue_id: 'queue_id',
    contact_type: 'contact_type',
    status: 'status',
  },
} as const;

/** M E S S A G E S constant. */
export const MESSAGES = {
  table: 'messages',
  columns: {
    id: 'id',
    contact_id: 'contact_id',
    content: 'content',
    sender: 'sender',
    agent_id: 'agent_id',
    channel_type: 'channel_type',
    created_at: 'created_at',
    status: 'status',
    message_id: 'message_id',
  },
} as const;

/**
 * Type-check em compile time que uma string é uma coluna válida.
 * Uso: `.eq(col(WHATSAPP_CONNECTIONS, 'instance_name'), value)`
 */
export function col<T extends { columns: Record<string, string> }, K extends keyof T['columns']>(
  schema: T,
  column: K,
): T['columns'][K] {
  return schema.columns[column as string] as T['columns'][K];
}
