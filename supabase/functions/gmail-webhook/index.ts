import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/mod.ts';
import { requireUser } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/hmac-validation.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC') ?? 'projects/your-project/topics/gmail';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const supabase = createClient(
    (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!,
    (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
  );

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    // ── Push notification do Google Pub/Sub (POST sem body action) ────
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { action } = body;

      // F2 security fix: fail-closed auth for Pub/Sub push notifications.
      // The 'registerWatch' action uses its own token auth via getValidToken().
      // All other POST requests (Pub/Sub pushes) MUST present a valid token.
      if (!action) {
        // F2+vault: read token from vault first (gmail_pubsub_token), env fallback for legacy
        const expectedToken = await getSecret('gmail_pubsub_token') ?? Deno.env.get('GMAIL_PUBSUB_TOKEN');
        if (!expectedToken) {
          return json({ error: 'Webhook authentication not configured' }, 401);
        }
        const receivedToken = new URL(req.url).searchParams.get('token');
        if (!receivedToken || !timingSafeEqual(receivedToken, expectedToken)) {
          return json({ error: 'Invalid or missing push token' }, 401);
        }
      }

      // ── registerWatch — registra Pub/Sub watch para uma conta ─────
      if (action === 'registerWatch') {
        const authed = await requireUser(req);
        if (authed instanceof Response) return authed;

        const { accountId } = body;

        // Verify the authenticated user owns this gmail_accounts row.
        const { data: accountCheck } = await supabase
          .from('gmail_accounts')
          .select('id')
          .eq('id', accountId)
          .eq('user_id', authed.user.id)
          .maybeSingle();
        if (!accountCheck) return json({ error: 'Conta não encontrada ou acesso negado' }, 403);

        const token = await getValidToken(supabase, accountId);
        if (!token) return json({ error: 'Token inválido' }, 401);

        const watchRes = await fetch(`${GMAIL_API}/watch`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicName: PUBSUB_TOPIC,
            labelIds: ['INBOX'],
            labelFilterBehavior: 'INCLUDE',
          }),
          signal: AbortSignal.timeout(15_000),
        });
        const watchData = await watchRes.json();
        if (watchData.error) {
          console.error('[gmail-webhook] watch setup error', watchData.error);
          return json({ error: 'Failed to setup Gmail watch' }, 400);
        }

        if (!watchRes.ok) return json({ error: 'Watch failed', detail: watchData }, 500);

        const expires = watchData.expiration ? new Date(parseInt(watchData.expiration)).toISOString() : null;
        await supabase.from('email_watch_history').upsert({
          account_id: accountId, history_id: watchData.historyId ?? null,
          expires_at: expires, watch_registered_at: new Date().toISOString(),
          status: 'active',
        }, { onConflict: 'account_id' });

        return json({ ok: true, historyId: watchData.historyId, expiresAt: expires });
      }

      // ── Pub/Sub push: process email notification ────────────────────
      const { message } = body;
      if (!message?.data) return json({ ok: true, skipped: 'no_message' });

      let decoded: { emailAddress?: string; historyId?: string };
      try {
        decoded = JSON.parse(atob(message.data));
      } catch {
        return json({ error: 'Bad payload' }, 400);
      }

      const { emailAddress, historyId } = decoded;
      if (!emailAddress || !historyId) return json({ ok: true, skipped: 'missing_fields' });

      const { data: account } = await supabase.from('email_accounts').select('id, access_token, refresh_token, token_expires_at').eq('email', emailAddress).maybeSingle();
      if (!account) return json({ ok: true, skipped: 'account_not_found' });

      const token = await getValidToken(supabase, account.id);
      if (!token) return json({ ok: true, skipped: 'invalid_token' });

      const { data: watch } = await supabase.from('email_watch_history').select('history_id').eq('account_id', account.id).maybeSingle();
      const startHistoryId = watch?.history_id ?? historyId;

      await processHistory(supabase, token, account.id, startHistoryId);

      await supabase.from('email_watch_history').upsert({
        account_id: account.id, history_id: historyId,
        status: 'active',
      }, { onConflict: 'account_id' });

      return json({ ok: true });
    }

    // ── GET: status endpoint ────────────────────────────────────────
    if (req.method === 'GET') {
      const tokenConfigured = !!(await getSecret('gmail_pubsub_token') ?? Deno.env.get('GMAIL_PUBSUB_TOKEN'));
      return json({ service: 'gmail-webhook', status: 'healthy', token_configured: tokenConfigured });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[gmail-webhook]', err instanceof Error ? (err.stack ?? err.message) : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

// Marks a Gmail message error that is deterministically non-retryable (e.g. 400 Bad Request,
// 403 Permission Denied). processHistory skips these so history_id can advance and the
// account is not permanently stalled. Transient errors (network, 429, 5xx) are thrown as
// plain Error so Pub/Sub retries the batch without advancing history_id.
class NonRetryableMessageError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NonRetryableMessageError'; }
}


async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: account, error } = await supabase.from('email_accounts').select('access_token, refresh_token, token_expires_at, client_id, client_secret').eq('id', accountId).maybeSingle();
  if (error || !account) return null;

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at) : null;
  const isExpired = !expiresAt || expiresAt <= new Date(Date.now() + 60_000);

  if (!isExpired) return account.access_token;

  if (!account.refresh_token) return null;

  const clientId = account.client_id ?? Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = account.client_secret ?? Deno.env.get('GOOGLE_CLIENT_SECRET')!;

  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!refreshRes.ok) return null;

  const refreshData = await refreshRes.json();
  const newToken = refreshData.access_token;
  const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

  await supabase.from('email_accounts').update({
    access_token: newToken, token_expires_at: newExpiry,
  }).eq('id', accountId);

  return newToken;
}

async function processHistory(
  supabase: ReturnType<typeof createClient>,
  token: string,
  accountId: string,
  startHistoryId: string
): Promise<void> {
  const histRes = await fetch(
    `${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
  );
  const histData = await histRes.json();
  if (histData.error) return;

  const addedMessages: string[] = [];
  for (const record of histData.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      addedMessages.push(added.message.id);
    }
  }

  // Fetch and persist all new messages in parallel.
  // Error taxonomy drives whether history_id advances:
  //   NonRetryableMessageError → poison-pill (bad request, permission denied) — skip and advance.
  //   Any other error (network timeout, AbortError, Gmail 429/5xx) → transient — throw so
  //   Pub/Sub retries the push notification and history_id is held in place, preventing data loss.
  const results = await Promise.allSettled(
    addedMessages.slice(0, 20).map(msgId => fetchAndPersistMessage(supabase, token, accountId, msgId))
  );
  const failures = results.filter(r => r.status === 'rejected');
  const transientFailures = failures.filter(f => !(f.reason instanceof NonRetryableMessageError));
  for (const r of results) {
    if (r.status === 'rejected') {
      const isPoison = r.reason instanceof NonRetryableMessageError;
      (isPoison ? console.warn : console.error)(
        '[gmail-webhook] processHistory message failed:',
        r.reason instanceof Error ? r.reason.message : String(r.reason),
      );
    }
  }
  // Transient failures: hold history_id so Pub/Sub can retry and recover the missed messages.
  // Non-retryable poison-pill failures: already skipped inside fetchAndPersistMessage or
  // thrown as NonRetryableMessageError; do not stall the account for deterministically bad msgs.
  if (transientFailures.length > 0) {
    throw new Error(`${transientFailures.length}/${results.length} messages had transient failures — deferring to Pub/Sub retry`);
  }
}

async function fetchAndPersistMessage(
  supabase: ReturnType<typeof createClient>,
  token: string,
  accountId: string,
  messageId: string
): Promise<void> {
  const msgRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const msg = await msgRes.json();
  if (msg.error) {
    // 404: message deleted before ingestion — expected and harmless, skip silently.
    if (msg.error.code === 404) return;

    // Inspect the reason/status fields for fine-grained retryability classification.
    // Coarse code-only checks misclassify retryable 401/403 variants as non-retryable,
    // causing processHistory to skip those messages and advance history_id, permanently
    // dropping emails that could have been recovered on the next Pub/Sub retry.
    const reason = ((msg.error.errors?.[0]?.reason) ?? '').toLowerCase();
    const status = ((msg.error.status) ?? '').toLowerCase();

    // Transient: hold history_id so Pub/Sub retries and recovers the missed messages.
    // 401 is NOT blanket-transient — only the specific UNAUTHENTICATED status (token-expiry)
    // qualifies. Blanket 401 classification causes persistent retry loops for account-level
    // auth failures where the token stays valid but the API keeps rejecting the request.
    const isTransient =
      msg.error.code === 429 ||                        // standard rate-limit header
      msg.error.code >= 500 ||                         // server errors
      reason === 'ratelimitexceeded' ||
      reason === 'userratelimitexceeded' ||
      reason === 'quotaexceeded' ||
      status === 'unauthenticated' ||                  // token expired — specific renewable failure
      status === 'resource_exhausted';

    if (isTransient) {
      throw new Error(`Gmail API transient error for message ${messageId}: ${msg.error.code} ${reason || (msg.error.message ?? '')}`);
    }

    // Non-retryable (e.g. insufficientPermissions, badRequest): skip as a poison pill so the
    // account is not permanently stalled by a single bad message.
    throw new NonRetryableMessageError(`Gmail API non-retryable error for message ${messageId}: ${msg.error.code} ${reason || (msg.error.message ?? '')}`);
  }

  const headers: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const threadId   = msg.threadId;
  const subject    = headers['subject'] ?? '(sem assunto)';
  const fromHeader = headers['from'] ?? '';
  const toHeader   = (headers['to'] ?? '').split(',').map((e: string) => e.trim());
  const ccHeader   = (headers['cc'] ?? '').split(',').filter(Boolean).map((e: string) => e.trim());
  const date       = headers['date'] ? new Date(headers['date']).toISOString() : new Date().toISOString();
  const snippet    = msg.snippet ?? '';

  // Extrai from_email e from_name
  const fromMatch  = fromHeader.match(/^(.*?)\s*<(.+?)>$/) ?? [];
  const fromName   = fromMatch[1]?.trim() ?? fromHeader;
  const fromEmail  = fromMatch[2] ?? fromHeader;

  // Extrai body
  let bodyPlain = '';
  let bodyHtml  = '';
  const extractParts = (parts: unknown[]): void => {
    for (const part of parts ?? []) {
      const p = part as Record<string, unknown>;
      if (p.mimeType === 'text/plain' && p.body) {
        bodyPlain = atob(((p.body as Record<string,string>).data ?? '').replace(/-/g, '+').replace(/_/g, '/'));
      } else if (p.mimeType === 'text/html' && p.body) {
        bodyHtml = atob(((p.body as Record<string,string>).data ?? '').replace(/-/g, '+').replace(/_/g, '/'));
      } else if (Array.isArray(p.parts)) {
        extractParts(p.parts as unknown[]);
      }
    }
  };
  if (msg.payload?.parts) {
    extractParts(msg.payload.parts);
  } else if (msg.payload?.body?.data) {
    const data = msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
    if (msg.payload.mimeType === 'text/html') bodyHtml = atob(data);
    else bodyPlain = atob(data);
  }

  const labelIds     = msg.labelIds ?? [];
  const isRead       = !labelIds.includes('UNREAD');
  const isSent       = labelIds.includes('SENT');
  const hasAttach    = !!(msg.payload?.parts ?? []).some((p: Record<string, unknown>) => p.filename);

  // Step 1: insert the thread row if it doesn't exist yet (no-op on conflict).
  await supabase.from('gmail_threads').upsert({
    account_id:      accountId,
    thread_id:       threadId,
    subject,
    snippet,
    label_ids:       labelIds,
    last_message_at: date,
  }, { onConflict: 'account_id,thread_id', ignoreDuplicates: true });

  // Step 2: update metadata only when this message is strictly more recent.
  // PostgreSQL row-level locking serialises concurrent writers; the WHERE
  // predicate guarantees the newest timestamp always wins, preventing an older
  // parallel message from clobbering subject / snippet / last_message_at.
  await supabase.from('gmail_threads')
    .update({ subject, snippet, label_ids: labelIds, last_message_at: date })
    .eq('account_id', accountId)
    .eq('thread_id', threadId)
    .lt('last_message_at', date);

  // Step 3: fetch the row id needed for the message upsert below.
  const { data: thread } = await supabase.from('gmail_threads')
    .select('id')
    .eq('account_id', accountId)
    .eq('thread_id', threadId)
    .single();

  if (!thread) return;

  // Upsert gmail_messages
  await supabase.from('gmail_messages').upsert({
    thread_id_ref:  thread.id,
    account_id:     accountId,
    message_id:     messageId,
    from_email:     fromEmail,
    from_name:      fromName,
    to_emails:      toHeader,
    cc_emails:      ccHeader,
    bcc_emails:     [],
    subject,
    body_plain:     bodyPlain.substring(0, 50000),
    body_html:      bodyHtml.substring(0, 200000),
    snippet,
    label_ids:      labelIds,
    is_read:        isRead,
    is_sent:        isSent,
    has_attachments: hasAttach,
    internal_date:  date,
  }, { onConflict: 'account_id,message_id' });

  // Recompute unread_count from actual message records — avoids the literal
  // 0/1 last-write-wins race when concurrent messages share the same thread.
  const { count: unreadCount } = await supabase
    .from('gmail_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id_ref', thread.id)
    .eq('is_read', false);

  if (unreadCount !== null) {
    await supabase.from('gmail_threads')
      .update({ unread_count: unreadCount })
      .eq('id', thread.id);
  }
}
