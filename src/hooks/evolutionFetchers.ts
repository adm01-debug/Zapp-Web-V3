/**
 * evolutionFetchers — constants and raw fetch helpers for evolution_messages.
 */
import { queryExternalProxy } from '@/lib/externalProxy';
import type { EvolutionMessage } from '@/types/evolutionExternal';
import { ACTIVE_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { getLogger } from '@/lib/logger';

const fetcherLog = getLogger('evolutionFetchers');

const _sidebarEmptyWarned = new Set<string>();

/** Polling interval (ms). 15 s = -67% vs 5 s anterior. Configurável via VITE_POLL_INTERVAL (mín 3000). */
const _configuredInterval = Number(import.meta.env.VITE_POLL_INTERVAL ?? '');
export const POLL_INTERVAL: number =
  Number.isFinite(_configuredInterval) && _configuredInterval >= 3_000
    ? _configuredInterval
    : 15_000;
/**
 * Default WhatsApp instance identifier used when none is specified.
 * Aponta para a instância ATIVA (que recebe mensagens novas), não para a legada.
 */
export const DEFAULT_INSTANCE = ACTIVE_WHATSAPP_INSTANCE;
/** Number of days back to fetch sidebar conversations. */
export const SIDEBAR_DAYS_BACK = 7;
/** Maximum number of conversations loaded in the sidebar. */
export const SIDEBAR_LIMIT = 200;
/** C O N V E R S A T I O N_ P A G E_ S I Z E constant. */
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
/** U S E_ M O C K S constant. */
export const USE_MOCKS =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.localStorage?.getItem('mockConversations') === '1';

/** fetch Recent Messages Window function. */
export async function fetchRecentMessagesWindow(
  daysBack = SIDEBAR_DAYS_BACK,
  limit = SIDEBAR_LIMIT
): Promise<EvolutionMessage[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  const primary = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'gte', value: since },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  });
  if (primary.data.length > 0) return primary.data;

  // FALLBACK (defensivo): instância ativa não retornou mensagens nos últimos N dias.
  // Isso NÃO deveria acontecer em produção desde 2026-07-26 quando ACTIVE_WHATSAPP_INSTANCE
  // foi corrigida para 'wpp2' (is_active=true, 12.527 conversas, 78 msgs/7d).
  // Se este warn aparecer novamente, a instância ativa pode ter perdido conectividade
  // ou ter sido trocada sem atualizar a constante.
  // Ref: fix/console-bugs-2026-07-26 (PR #535).
  const warnKey = `${DEFAULT_INSTANCE}:${daysBack}`;
  if (!_sidebarEmptyWarned.has(warnKey)) {
    _sidebarEmptyWarned.add(warnKey);
    fetcherLog.warn(
      '[INESPERADO] Sidebar vazia para a instância ativa. ' +
      'Verifique se ACTIVE_WHATSAPP_INSTANCE está correta e se a instância está conectada. ' +
      'Tentando fallback multi-instância.',
      { instance: DEFAULT_INSTANCE, daysBack, limit }
    );
  }
  const fallback = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    // SEM filtro de instance_name: traz msgs de todas as instâncias configuradas.
    // Garante que uma reconexão ou nova instância não apague a sidebar do usuário.
    filters: [{ column: 'created_at', operator: 'gte', value: since }],
    order: { column: 'created_at', ascending: false },
    limit,
  });
  return fallback.data;
}

/**
 * F4-01: busca a próxima página da sidebar (mensagens MAIS ANTIGAS que o
 * cursor `beforeCreatedAt`) via external-db-proxy. Mesmas colunas slim e
 * filtro de instância do `fetchRecentMessagesWindow`; sem fallback
 * multi-instância (o fallback só faz sentido quando a janela inicial vem
 * vazia — uma página de load-more vazia é o fim legítimo da lista).
 */
export async function fetchSidebarMessagesPage(
  beforeCreatedAt: string,
  limit = SIDEBAR_LIMIT
): Promise<EvolutionMessage[]> {
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'lt', value: beforeCreatedAt },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  });
  return result.data;
}

/** fetch Messages By Jid function. */
export async function fetchMessagesByJid(
  remoteJid: string,
  limit = CONVERSATION_PAGE_SIZE,
  beforeDate?: string,
  signal?: AbortSignal,
  /** Instância WhatsApp do contato. Padrão: DEFAULT_INSTANCE (wpp2).
   *  Sempre passe conversation.instance_name quando disponível para evitar
   *  mensagens vazias ao adicionar uma segunda instância ao sistema. */
  instanceName: string = DEFAULT_INSTANCE
): Promise<EvolutionMessage[]> {
  const filters: { column: string; operator: string; value: unknown }[] = [
    { column: 'remote_jid', operator: 'eq', value: remoteJid },
    { column: 'instance_name', operator: 'eq', value: instanceName },
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

/** fetch Messages After function. */
export async function fetchMessagesAfter(
  remoteJid: string,
  afterDate: string,
  limit = CONVERSATION_PAGE_SIZE,
  /** Instância WhatsApp do contato. Padrão: DEFAULT_INSTANCE (wpp2). */
  instanceName: string = DEFAULT_INSTANCE
): Promise<EvolutionMessage[]> {
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'remote_jid', operator: 'eq', value: remoteJid },
      { column: 'instance_name', operator: 'eq', value: instanceName },
      { column: 'created_at', operator: 'gt', value: afterDate },
    ],
    order: { column: 'created_at', ascending: true },
    limit,
  });
  return result.data;
}
