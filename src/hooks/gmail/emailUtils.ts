/**
 * emailUtils — pure helpers shared across useEmail sub-hooks.
 */
import { emailMappers } from '@/utils/emailMappers';
import type { EmailThread } from '@/types/gmail';

/** IDs from GMAIL_MOCKS (e.g. 'mock-account-123') are not UUIDs — skip DB calls. */
export const isMockId = (id?: string | null): boolean => !!id && id.startsWith('mock-');

/**
 * The base table email_app.email_threads lacks view-derived columns
 * (thread_id, email_thread_id, account_id, unread_count). This adapter
 * replicates the view expressions for realtime payloads.
 */
export const mapBaseThreadRow = (row: Record<string, unknown>): EmailThread =>
  emailMappers.thread({
    ...row,
    thread_id: row['id'],
    email_thread_id: row['gmail_thread_id'] != null ? String(row['gmail_thread_id']) : null,
    account_id: row['gmail_account_id'],
    unread_count: row['is_unread'] ? Math.max(Number(row['message_count'] ?? 1), 1) : 0,
  });

/**
 * Removes undefined keys before UPDATE spread — prevents overwriting previously
 * loaded fields (e.g. contact) that the raw row doesn't include.
 */
export const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
