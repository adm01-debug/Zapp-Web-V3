/**
 * evolutionFetchers — constants and raw fetch helpers for evolution_messages.
 */
import { supabase } from '@/integrations/supabase/client';
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
  const primary = await supabase
    .from('evolution_messages')
    .select(SLIM_MESSAGE_COLUMNS)
    .eq('instance_name', DEFAULT_INSTANCE)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (primary.error) throw new Error(primary.error.message);
  const primaryRows = (primary.data ?? []) as unknown as EvolutionMessage[];
  if (primaryRows.length > 0) return primaryRows;

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
  const fallback = await supabase
    .from('evolution_messages')
    .select(SLIM_MESSAGE_COLUMNS)
    // SEM filtro de instance_name: traz msgs de todas as instâncias configuradas.
    // Garante que uma reconexão ou nova instância não apague a sidebar do usuário.
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []) as unknown as EvolutionMessage[];
}

/**
 * F4-01: busca a próxima página da sidebar (mensagens MAIS ANTIGAS que o
 * cursor `beforeCreatedAt`) via Supabase direto (schema `evo`). Mesmas colunas slim e
 * filtro de instância do `fetchRecentMessagesWindow`; sem fallback
 * multi-instância (o fallback só faz sentido quando a janela inicial vem
 * vazia — uma página de load-more vazia é o fim legítimo da lista).
 */
export async function fetchSidebarMessagesPage(
  beforeCreatedAt: string,
  limit = SIDEBAR_LIMIT
): Promise<EvolutionMessage[]> {
  const result = await supabase
    .from('evolution_messages')
    .select(SLIM_MESSAGE_COLUMNS)
    .eq('instance_name', DEFAULT_INSTANCE)
    .lt('created_at', beforeCreatedAt)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as unknown as EvolutionMessage[];
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
  let query = supabase
    .from('evolution_messages')
    .select(SLIM_MESSAGE_COLUMNS)
    .eq('remote_jid', remoteJid)
    .eq('instance_name', instanceName);
  if (beforeDate) query = query.lt('created_at', beforeDate);
  query = query.order('created_at', { ascending: false }).limit(limit);
  if (signal) query = query.abortSignal(signal);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return ((result.data ?? []) as unknown as EvolutionMessage[]).slice().reverse();
}

/** fetch Messages After function. */
export async function fetchMessagesAfter(
  remoteJid: string,
  afterDate: string,
  limit = CONVERSATION_PAGE_SIZE,
  /** Instância WhatsApp do contato. Padrão: DEFAULT_INSTANCE (wpp2). */
  instanceName: string = DEFAULT_INSTANCE
): Promise<EvolutionMessage[]> {
  const result = await supabase
    .from('evolution_messages')
    .select(SLIM_MESSAGE_COLUMNS)
    .eq('remote_jid', remoteJid)
    .eq('instance_name', instanceName)
    .gt('created_at', afterDate)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as unknown as EvolutionMessage[];
}
