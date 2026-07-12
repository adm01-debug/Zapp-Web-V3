import {
  EmailAccount,
  EmailTokenInfo,
  EmailThread,
  EmailDayMetric,
  EmailLabelInfo,
  UnifiedEmailAccount,
  SLAStatus,
} from '@/types/gmail';

type RawRow = Record<string, unknown>;

/**
 * Mapeia dados brutos do Supabase/RPC para interfaces tipadas do Email.
 * Elimina a necessidade de casts 'as any' ou transformações repetitivas nos hooks.
 */
export const emailMappers = {
  /**
   * Mapeia uma linha da tabela 'email_accounts'
   */
  account: (data: RawRow): EmailAccount => ({
    id: data.id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    display_name: data.display_name as string,
    picture_url: (data.picture_url as string | null) ?? null,
    is_active: (data.is_active as boolean) ?? true,
    token_expiry: (data.token_expiry as string | null) ?? null,
    watch_expiry: (data.watch_expiry as string | null) ?? null,
    created_at: data.created_at as string,
  }),

  /**
   * Mapeia o retorno do RPC 'rpc_email_token_status'
   */
  tokenInfo: (data: RawRow): EmailTokenInfo => ({
    account_id: data.account_id as string,
    email: data.email as string,
    is_active: (data.is_active as boolean) ?? true,
    token_status: (data.token_status as string) || 'no_token',
    token_expiry: (data.token_expiry as string | null) ?? null,
    watch_status: (data.watch_status as string) || 'no_watch',
    watch_expiry: (data.watch_expiry as string | null) ?? null,
    minutes_until_expiry: data.minutes_until_expiry as number | null,
  }),

  /**
   * Mapeia uma linha da tabela 'email_threads' ou retorno de rpc_email_search_threads
   */
  thread: (data: RawRow): EmailThread => ({
    id: data.id as string,
    account_id: data.account_id as string,
    email_thread_id: ((data.email_thread_id || data.thread_id) as string | null) ?? null,
    thread_id: ((data.email_thread_id || data.thread_id) as string | null) ?? null,
    subject: (data.subject as string | null) ?? null,
    snippet: (data.snippet as string | null) ?? null,
    from_email: (data.from_email as string | null) ?? null,
    from_name: (data.from_name as string | null) ?? null,
    label_ids: (data.label_ids as string[]) || [],
    unread_count: (data.unread_count as number) || 0,
    message_count: (data.message_count as number) || 0,
    is_starred: (data.is_starred as boolean) ?? false,
    is_important: (data.is_important as boolean) ?? false,
    is_unread: ((data.unread_count as number) || 0) > 0,
    sla_status: (data.sla_status as SLAStatus | null) ?? null,
    assigned_to: (data.assigned_to as string | null) ?? null,
    last_message_at: (data.last_message_at as string | null) ?? null,
    first_reply_at: (data.first_reply_at as string | null) ?? null,
    created_at: data.created_at as string,
    contact: (data.contact as EmailThread['contact']) ?? null,
    tags: (data.tags as string[]) || [],
  }),

  /**
   * Mapeia uma linha da tabela 'email_daily_metrics'
   */
  metric: (data: RawRow): EmailDayMetric => ({
    date: data.date as string,
    threads_received: (data.threads_received as number) || 0,
    threads_replied: (data.threads_replied as number) || 0,
    avg_first_reply_minutes: (data.avg_first_reply_minutes as number | null) ?? null,
    sla_met_count: (data.sla_met_count as number) || 0,
    sla_breached_count: (data.sla_breached_count as number) || 0,
  }),

  /**
   * Mapeia uma linha da tabela 'email_labels'
   */
  label: (data: RawRow): EmailLabelInfo => ({
    id: data.id as string,
    account_id: data.account_id as string,
    email_label_id: data.email_label_id as string,
    name: data.name as string,
    type: (data.type as string) || 'user',
    color: (data.color as string | null) ?? null,
    thread_count: (data.thread_count as number | null) ?? null,
    unread_count: (data.unread_count as number | null) ?? null,
  }),

  /**
   * Mapeia uma linha da view 'v_email_accounts_unified'
   */
  unifiedAccount: (data: RawRow): UnifiedEmailAccount => ({
    account_id: data.account_id as string,
    user_id: data.user_id as string,
    email: data.email as string,
    display_name: (data.display_name as string) || '',
    provider: (data.provider as string) || 'custom',
    auth_method: (data.auth_method as string) || 'password',
    is_active: (data.is_active as boolean) ?? true,
    token_expired: (data.token_expired as boolean) ?? false,
    unread_threads: (data.unread_threads as number) || 0,
    sla_breached: (data.sla_breached as number) || 0,
    created_at: data.created_at as string,
  }),

  /**
   * Helpers para arrays
   */
  accounts: (data: unknown[]): EmailAccount[] =>
    (data || []).map((r) => emailMappers.account(r as RawRow)),
  tokenInfos: (data: unknown[]): EmailTokenInfo[] =>
    (data || []).map((r) => emailMappers.tokenInfo(r as RawRow)),
  threads: (data: unknown[]): EmailThread[] =>
    (data || []).map((r) => emailMappers.thread(r as RawRow)),
  metrics: (data: unknown[]): EmailDayMetric[] =>
    (data || []).map((r) => emailMappers.metric(r as RawRow)),
  labels: (data: unknown[]): EmailLabelInfo[] =>
    (data || []).map((r) => emailMappers.label(r as RawRow)),
  unifiedAccounts: (data: unknown[]): UnifiedEmailAccount[] =>
    (data || []).map((r) => emailMappers.unifiedAccount(r as RawRow)),
};
