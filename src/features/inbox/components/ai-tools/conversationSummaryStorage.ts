import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

/**
 * Storage helpers for the dedicated conversation-summary cache
 * (zapp.conversation_summaries) — IA-07.
 *
 * The ai-conversation-summary edge persists analyses to `conversation_analyses`
 * via its admin client; this module mirrors that summary into
 * `conversation_summaries` so the SummaryTab can be hydrated from cache when
 * the conversation is reopened.
 *
 * RLS status (canonical schema 20260804000000, policy auth_secure_167):
 *  - SELECT:   authenticated only via zapp.is_admin_or_supervisor()
 *  - INSERT/UPDATE: NO policy exists -> blocked for every authenticated user
 * So both helpers degrade gracefully (log + null/ok:false) until a migration
 * adds contact-scoped policies mirroring conv_analyses_select
 * (is_contact_visible_to_user OR is_admin_or_supervisor).
 */

/** Row shape of zapp.conversation_summaries (mirrors generated types). */
export interface ConversationSummaryRow {
  id: string;
  conversation_id: string | null;
  summary: string | null;
  generated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConversationSummaryResult {
  ok: boolean;
  error?: string;
}

/**
 * Persist the latest AI summary for a conversation (best-effort).
 * Uses select-then-update/insert (no dependency on a unique constraint on
 * conversation_id, which is not declared in the canonical schema).
 * Failures (e.g. RLS) are logged and swallowed — the summary still renders.
 */
export async function persistConversationSummary(
  conversationId: string,
  summary: string,
  generatedBy?: string | null
): Promise<ConversationSummaryResult> {
  if (!isValidUUID(conversationId)) return { ok: false, error: 'invalid conversation id' };

  try {
    const { data: existing } = await supabase
      .from('conversation_summaries')
      .select('id')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    const payload = {
      summary,
      generated_by: generatedBy ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('conversation_summaries')
        .update(payload)
        .eq('id', existing.id);
      if (error) {
        log.warn('persistConversationSummary update failed (RLS?)', { conversationId, error: error.message });
        return { ok: false, error: error.message };
      }
      return { ok: true };
    }

    const { error } = await supabase
      .from('conversation_summaries')
      .insert({ ...payload, conversation_id: conversationId, created_at: new Date().toISOString() });
    if (error) {
      log.warn('persistConversationSummary insert failed (RLS?)', { conversationId, error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    log.warn('persistConversationSummary failed', { conversationId, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Load the latest cached summary for a conversation (cache-on-open).
 * Returns null when missing or when RLS blocks the read (non-admin today).
 */
export async function loadCachedConversationSummary(
  conversationId: string
): Promise<ConversationSummaryRow | null> {
  if (!isValidUUID(conversationId)) return null;

  try {
    const { data, error } = await supabase
      .from('conversation_summaries')
      .select('id, conversation_id, summary, generated_by, created_at, updated_at')
      .eq('conversation_id', conversationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // SELECT is admin/supervisor-only today (auth_secure_167); non-admins
      // get 42501 here — degrade to "no cache" silently (debug level).
      log.debug('loadCachedConversationSummary unavailable', { conversationId, error: error.message });
      return null;
    }

    return (data as ConversationSummaryRow | null) ?? null;
  } catch (err) {
    log.debug('loadCachedConversationSummary failed', { conversationId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
