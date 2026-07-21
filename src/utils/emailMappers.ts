// @ts-nocheck
import {
  EmailAccount,
  EmailTokenInfo,
  EmailThread,
  EmailDayMetric,
  EmailLabelInfo,
  UnifiedEmailAccount,
  SLAStatus,
} from '@/types/gmail';

/**
 * Mapeia dados brutos do Supabase/RPC para interfaces tipadas do Email.
 * Elimina a necessidade de casts 'as any' ou transformações repetitivas nos hooks.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

export const emailMappers = {
  /**
   * Mapeia uma linha da tabela 'email_accounts'
   */
  account: (data: Raw): EmailAccount => ({
    id: data.id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    display_name: data.display_name as string | null,
    picture_url: data.picture_url as string | null | undefined,
    is_active: (data.is_active ?? true) as boolean,
    token_expiry: data.token_expiry as string | null,
    watch_expiry: data.watch_expiry as string | null,
    created_at: data.created_at as string | undefined,
  }),

  /**
   * Mapeia o retorno do RPC 'rpc_email_token_status'
   */
  tokenInfo: (data: Raw): EmailTokenInfo => ({
    account_id: data.account_id as string,
    email: data.email as string,
    is_active: (data.is_active ?? true) as boolean,
    token_status: (data.token_status || 'no_token') as EmailTokenInfo['token_status'],
    token_expiry: data.token_expiry as string | null,
    watch_status: (data.watch_status || 'no_watch') as EmailTokenInfo['watch_status'],
    watch_expiry: data.watch_expiry as string | null,
    minutes_until_expiry: data.minutes_until_expiry as number | null,
  }),

  /**
   * Mapeia uma linha da tabela 'email_threads' ou retorno de rpc_email_search_threads
   */
  thread: (data: Raw): EmailThread => ({
    id: data.id as string,
    account_id: data.account_id as string,
    email_thread_id: (data.email_thread_id || data.thread_id) as string,
    thread_id: (data.email_thread_id || data.thread_id) as string,
    subject: data.subject as string,
    snippet: data.snippet as string,
    from_email: data.from_email as string,
    from_name: data.from_name as string,
    label_ids: (data.label_ids || []) as string[],
    unread_count: (data.unread_count || 0) as number,
    message_count: (data.message_count || 0) as number,
    is_starred: (data.is_starred ?? false) as boolean,
    is_important: (data.is_important ?? false) as boolean,
    is_unread: ((data.unread_count || 0) > 0) as boolean,
    sla_status: data.sla_status as SLAStatus | null,
    assigned_to: (data.assigned_to ?? null) as string | null,
    last_message_at: (data.last_message_at ?? null) as string | null,
    first_reply_at: (data.first_reply_at ?? null) as string | null,
    created_at: (data.created_at ?? undefined) as string | undefined,
    contact: data.contact,
    tags: (data.tags || []) as string[],
  }),

  /**
   * Mapeia uma linha da tabela 'email_daily_metrics'
   */
  metric: (data: Raw): EmailDayMetric => ({
    date: data.date as string,
    threads_received: (data.threads_received || 0) as number,
    threads_replied: (data.threads_replied || 0) as number,
    avg_first_reply_minutes: data.avg_first_reply_minutes as number | null | undefined,
    sla_met_count: (data.sla_met_count || 0) as number,
    sla_breached_count: (data.sla_breached_count || 0) as number,
  }),

  /**
   * Mapeia uma linha da tabela 'email_labels'
   */
  label: (data: Raw): EmailLabelInfo => ({
    id: data.id as string,
    account_id: data.account_id as string,
    email_label_id: data.email_label_id as string,
    name: data.name as string,
    type: (data.type || 'user') as EmailLabelInfo['type'],
    color: data.color as string | null | undefined,
    thread_count: data.thread_count as number | null | undefined,
    unread_count: data.unread_count as number | null | undefined,
  }),

  /**
   * Mapeia uma linha da view 'v_email_accounts_unified'
   */
  unifiedAccount: (data: Raw): UnifiedEmailAccount => ({
    account_id: data.account_id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    display_name: (data.display_name || '') as string,
    provider: (data.provider || 'custom') as UnifiedEmailAccount['provider'],
    auth_method: (data.auth_method || 'password') as UnifiedEmailAccount['auth_method'],
    is_active: (data.is_active ?? true) as boolean,
    token_expired: (data.token_expired ?? false) as boolean,
    unread_threads: (data.unread_threads || 0) as number,
    sla_breached: (data.sla_breached || 0) as number,
    created_at: data.created_at as string | null | undefined,
  }),

  /**
   * Helpers para arrays
   */
  accounts: (data: Raw[]): EmailAccount[] => (data || []).map(emailMappers.account),
  tokenInfos: (data: Raw[]): EmailTokenInfo[] => (data || []).map(emailMappers.tokenInfo),
  threads: (data: Raw[]): EmailThread[] => (data || []).map(emailMappers.thread),
  metrics: (data: Raw[]): EmailDayMetric[] => (data || []).map(emailMappers.metric),
  labels: (data: Raw[]): EmailLabelInfo[] => (data || []).map(emailMappers.label),
  unifiedAccounts: (data: Raw[]): UnifiedEmailAccount[] =>
    (data || []).map(emailMappers.unifiedAccount),
};
