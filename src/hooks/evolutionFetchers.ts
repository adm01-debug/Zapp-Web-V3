/**
 * evolutionFetchers — constants and raw fetch helpers for evolution_messages.
 */
import { queryExternalProxy } from '@/lib/externalProxy';
import type { EvolutionMessage } from '@/types/evolutionExternal';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

export const POLL_INTERVAL = 5000;
export const DEFAULT_INSTANCE = DEFAULT_WHATSAPP_INSTANCE;
export const SIDEBAR_DAYS_BACK = 7;
export const SIDEBAR_LIMIT = 200;
export const CONVERSATION_PAGE_SIZE = 100;

// Slim select — drops `payload` and `raw_data` (each can be 10KB+).
const SLIM_MESSAGE_COLUMNS = [
  'id',
  'message_id',
  'remote_jid',
  'from_me',
  'message_type',
  'content',
  'media_url',
  'media_mimetype',
  'media_type',
  'media_filename',
  'media_size',
  'caption',
  'quoted_message_id',
  'is_starred',
  'is_important',
  'category',
  'sentiment',
  'tags',
  'notes',
  'follow_up_at',
  'follow_up_done',
  'created_at',
  'contact_id',
  'conversation_id',
  'direction',
  'status',
  'status_at',
  'sent_by_bot',
  'template_name',
  'instance_name',
  'push_name',
  'deleted_at',
].join(',');

// Mocks are strictly opt-in AND only in DEV.
export const USE_MOCKS =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.localStorage?.getItem('mockConversations') === '1';

export async function fetchRecentMessagesWindow(
  daysBack = SIDEBAR_DAYS_BACK,
  limit = SIDEBAR_LIMIT
): Promise<EvolutionMessage[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'gte', value: since },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  });
  return result.data;
}

export async function fetchMessagesByJid(
  remoteJid: string,
  limit = CONVERSATION_PAGE_SIZE,
  beforeDate?: string,
  signal?: AbortSignal
): Promise<EvolutionMessage[]> {
  const filters: { column: string; operator: string; value: unknown }[] = [
    { column: 'remote_jid', operator: 'eq', value: remoteJid },
    { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
  ];
  if (beforeDate) {
    filters.push({ column: 'created_at', operator: 'lt', value: beforeDate });
  }
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters,
    order: { column: 'created_at', ascending: false },
    limit,
    signal,
  });
  return result.data.slice().reverse();
}

export async function fetchMessagesAfter(
  remoteJid: string,
  afterDate: string,
  limit = CONVERSATION_PAGE_SIZE
): Promise<EvolutionMessage[]> {
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'remote_jid', operator: 'eq', value: remoteJid },
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'gt', value: afterDate },
    ],
    order: { column: 'created_at', ascending: true },
    limit,
  });
  return result.data;
}
