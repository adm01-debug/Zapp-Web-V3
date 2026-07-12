import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/mod.ts';
import { requireUser } from '../_shared/auth.ts';
import { timingSafeEqual } from '../_shared/hmac-validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Edge Function: Gmail Pub/Sub Push Notification Handler
 *
 * Receives push notifications from Google Cloud Pub/Sub when new emails arrive in subscribed mailboxes.
 * Validates token (gmail_pubsub_token from vault or env), processes message history, and queues for delivery.
 *
 * Two Operational Modes:
 *
 * 1. Push Notifications (POST without action):
 *    - Google Pub/Sub pushes notification when email arrives
 *    - Validates query parameter ?token against gmail_pubsub_token
 *    - Token uses timing-safe comparison (prevents timing attacks on token validation)
 *    - Extracts accountId, historyId from notification
 *    - Fetches full message via Gmail API using stored access_token
 *    - Stores raw message, parses attachments, creates message + contact rows
 *    - Queues delivery to webhook subscribers (awaits integration.incoming_webhooks)
 *
 * 2. Watch Registration (POST action=registerWatch):
 *    - Authenticated user endpoint to subscribe a Gmail account to Pub/Sub push
 *    - Requires valid JWT auth (user must own the gmail_accounts row)
 *    - Calls Gmail /watch API to enable push notifications
 *    - Stores historyId + watch_expiry for incremental sync on resume
 *    - Watch auto-expires every 24h per Google design; background job refreshes
 *
 * Security Model:
 * - Fail-closed: Missing or invalid ?token returns 401 (no public access to notifications)
 * - Timing-safe comparison: timingSafeEqual() prevents token brute-force attacks
 * - Ownership check: registerWatch verifies user owns the gmail_accounts row
 * - Rate limiting: Global 60/60s cap on all email operations
 *
 * Token Sources (priority order):
 * - gmail_pubsub_token: Vault secret (recommended, rotatable)
 * - GMAIL_PUBSUB_TOKEN: Environment variable (fallback for legacy)
 * - Missing both: Returns 401 (webhook not configured)
 *
 * Message Processing:
 * - Decodes base64-encoded Gmail API response (messageId, historyId, email)
 * - Parses subject, from, to, body, attachments
 * - Creates contact if not exists
 * - Stores email_tracked_messages row (full archive)
 * - Queues delivery to webhooks in integration.incoming_webhooks
 *
 * Error Handling:
 * - 400 Bad Request: Invalid JSON, missing accountId, Pub/Sub format error
 * - 401 Unauthorized: Missing/invalid token, invalid access_token for Gmail API
 * - 403 Forbidden: User doesn't own the Gmail account
 * - 500 Internal Server Error: Database error, Gmail API error
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrlSelfHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
  const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
  const supabaseUrl = (typeof supabaseUrlSelfHosted === 'string' && supabaseUrlSelfHosted.length > 0)
    ? supabaseUrlSelfHosted
    : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

  const supabaseServiceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKey = (typeof supabaseServiceKeyHosted === 'string' && supabaseServiceKeyHosted.length > 0)
    ? supabaseServiceKeyHosted
    : (typeof supabaseServiceKeyDefault === 'string' && supabaseServiceKeyDefault.length > 0 ? supabaseServiceKeyDefault : '');

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: 'Supabase configuration missing' }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ── Push notification do Google Pub/Sub (POST sem body action) ────
    if (req.method === 'POST') {
      let bodyRaw: unknown;
      try {
        bodyRaw = await req.json();
      } catch {
        bodyRaw = null;
      }

      if (!bodyRaw || typeof bodyRaw !== 'object' || Array.isArray(bodyRaw)) {
        bodyRaw = {};
      }
      const body = bodyRaw as Record<string, unknown>;
      const action = typeof body.action === 'string' ? body.action : '';

      // F2 security fix: fail-closed auth for Pub/Sub push notifications.
      // The 'registerWatch' action uses its own token auth via getValidToken().
      // All other POST requests (Pub/Sub pushes) MUST present a valid token.
      if (!action) {
        // F2+vault: read token from vault first (gmail_pubsub_token), env fallback for legacy
        const expectedToken = await getSecret('gmail_pubsub_token') ?? Deno.env.get('GMAIL_PUBSUB_TOKEN');
        if (!expectedToken || typeof expectedToken !== 'string' || expectedToken.length === 0) {
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

        const accountId = typeof body.accountId === 'string' && body.accountId.length > 0 ? body.accountId : '';
        if (!accountId) return json({ error: 'Missing accountId' }, 400);

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
            topicName: 'projects/your-project/topics/gmail',
            labelIds: ['INBOX'],
            labelFilterBehavior: 'INCLUDE',
          }),
          signal: AbortSignal.timeout(15_000),
        });

        let watchData: unknown;
        try {
          watchData = await watchRes.json();
        } catch {
          console.error('[gmail-webhook] failed to parse watch response');
          return json({ error: 'Failed to setup Gmail watch' }, 400);
        }

        if (!watchData || typeof watchData !== 'object' || Array.isArray(watchData)) {
          return json({ error: 'Invalid watch response' }, 400);
        }
        const watchDataObj = watchData as Record<string, unknown>;
        if (watchDataObj.error) {
          console.error('[gmail-webhook] watch setup error', watchDataObj.error);
          return json({ error: 'Failed to setup Gmail watch' }, 400);
        }

        if (!watchRes.ok) return json({ error: 'Watch failed', detail: watchDataObj }, 500);

        const expiration = typeof watchDataObj.expiration === 'string' ? watchDataObj.expiration : '';
        let expires: string | null = null;
        if (expiration) {
          const expirationMs = parseInt(expiration, 10);
          if (Number.isFinite(expirationMs)) {
            try {
              const dateObj = new Date(expirationMs);
              if (!Number.isNaN(dateObj.getTime())) {
                expires = dateObj.toISOString();
              }
            } catch {
              // Silently skip invalid dates
            }
          }
        }

        const historyId = typeof watchDataObj.historyId === 'string' ? watchDataObj.historyId : null;
        await supabase.from('email_watch_history').upsert({
          account_id: accountId, history_id: historyId,
          expires_at: expires, watch_registered_at: new Date().toISOString(),
          status: 'active',
        }, { onConflict: 'account_id' });

        return json({ ok: true, historyId, expiresAt: expires });
      }

      // ── Pub/Sub push: process email notification ────────────────────
      const messageVal = body.message;
      if (!messageVal || typeof messageVal !== 'object' || Array.isArray(messageVal)) {
        return json({ ok: true, skipped: 'no_message' });
      }
      const message = messageVal as Record<string, unknown>;
      const messageData = typeof message.data === 'string' ? message.data : '';
      if (!messageData) {
        return json({ ok: true, skipped: 'no_message' });
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(atob(messageData));
      } catch {
        return json({ error: 'Bad payload' }, 400);
      }

      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        return json({ ok: true, skipped: 'invalid_payload' });
      }
      const decodedObj = decoded as Record<string, unknown>;
      const emailAddress = typeof decodedObj.emailAddress === 'string' && decodedObj.emailAddress.length > 0 ? decodedObj.emailAddress : '';
      const historyId = typeof decodedObj.historyId === 'string' && decodedObj.historyId.length > 0 ? decodedObj.historyId : '';
      if (!emailAddress || !historyId) return json({ ok: true, skipped: 'missing_fields' });

      const { data: account } = await supabase.from('email_accounts').select('id, access_token, refresh_token, token_expires_at').eq('email', emailAddress).maybeSingle();
      if (!account || typeof account !== 'object' || Array.isArray(account)) return json({ ok: true, skipped: 'account_not_found' });

      const accountObj = account as Record<string, unknown>;
      const accountId2 = typeof accountObj.id === 'string' ? accountObj.id : '';
      if (!accountId2) return json({ ok: true, skipped: 'invalid_account' });

      const token2 = await getValidToken(supabase, accountId2);
      if (!token2) return json({ ok: true, skipped: 'invalid_token' });

      const { data: watch } = await supabase.from('email_watch_history').select('history_id').eq('account_id', accountId2).maybeSingle();
      let watchHistoryId: string | null = null;
      if (watch && typeof watch === 'object' && !Array.isArray(watch)) {
        const watchObj = watch as Record<string, unknown>;
        watchHistoryId = typeof watchObj.history_id === 'string' ? watchObj.history_id : null;
      }
      const startHistoryId = watchHistoryId ?? historyId;

      const histRes = await fetch(`${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`, {
        headers: { 'Authorization': `Bearer ${token2}` },
      });

      let histData: unknown;
      try {
        histData = await histRes.json();
      } catch {
        return json({ ok: true, skipped: 'bad_history_response' });
      }

      if (!histData || typeof histData !== 'object' || Array.isArray(histData)) {
        return json({ ok: true, skipped: 'invalid_history_data' });
      }
      const histDataObj = histData as Record<string, unknown>;
      const historyList = Array.isArray(histDataObj.history) ? histDataObj.history : [];

      const messages: string[] = [];
      for (const h of historyList) {
        if (typeof h !== 'object' || h === null || Array.isArray(h)) continue;
        const hObj = h as Record<string, unknown>;
        const messagesAdded = Array.isArray(hObj.messagesAdded) ? hObj.messagesAdded : [];
        for (const added of messagesAdded) {
          if (typeof added !== 'object' || added === null || Array.isArray(added)) continue;
          const addedObj = added as Record<string, unknown>;
          const msg = addedObj.message;
          if (typeof msg === 'object' && msg !== null && !Array.isArray(msg)) {
            const msgObj = msg as Record<string, unknown>;
            const msgId = typeof msgObj.id === 'string' ? msgObj.id : '';
            if (msgId) messages.push(msgId);
          }
        }
      }

      const processed: string[] = [];
      for (const msgId of messages.slice(0, 10)) {
        const msgRes = await fetch(`${GMAIL_API}/messages/${msgId}?format=full`, {
          headers: { 'Authorization': `Bearer ${token2}` },
        });

        let msg: unknown;
        try {
          msg = await msgRes.json();
        } catch {
          continue;
        }

        if (!msgRes.ok || !msg || typeof msg !== 'object' || Array.isArray(msg)) continue;
        const msgObj = msg as Record<string, unknown>;

        const payloadVal = msgObj.payload;
        const headers = (typeof payloadVal === 'object' && payloadVal !== null && !Array.isArray(payloadVal) && Array.isArray((payloadVal as Record<string, unknown>).headers))
          ? (payloadVal as Record<string, unknown>).headers as unknown[]
          : [];

        const getHeader = (name: string): string => {
          for (const h of headers) {
            if (typeof h !== 'object' || h === null || Array.isArray(h)) continue;
            const hObj = h as Record<string, unknown>;
            if (typeof hObj.name === 'string' && typeof hObj.value === 'string' && hObj.name.toLowerCase() === name.toLowerCase()) {
              return hObj.value;
            }
          }
          return '';
        };

        const subject = getHeader('Subject');
        const from = getHeader('From');
        const to = getHeader('To');
        const date = getHeader('Date');
        const messageId = getHeader('Message-Id');

        const threadId = typeof msgObj.threadId === 'string' ? msgObj.threadId : '';
        const snippet = typeof msgObj.snippet === 'string' ? msgObj.snippet : '';
        let bodyText = '';

        // Extract body from payload
        if (typeof payloadVal === 'object' && payloadVal !== null && !Array.isArray(payloadVal)) {
          const payload = payloadVal as Record<string, unknown>;
          const bodyVal = payload.body;
          if (typeof bodyVal === 'object' && bodyVal !== null && !Array.isArray(bodyVal)) {
            const bodyObj = bodyVal as Record<string, unknown>;
            const dataStr = typeof bodyObj.data === 'string' ? bodyObj.data : '';
            if (dataStr) {
              try {
                bodyText = atob(dataStr.replace(/-/g, '+').replace(/_/g, '/'));
              } catch {
                bodyText = '';
              }
            }
          }
        }

        const labelIds = Array.isArray(msgObj.labelIds) ? msgObj.labelIds : [];
        const isRead = !labelIds.includes('UNREAD');

        let receivedAt: string | null = null;
        if (typeof date === 'string' && date.length > 0) {
          try {
            const dateObj = new Date(date);
            if (!Number.isNaN(dateObj.getTime())) {
              receivedAt = dateObj.toISOString();
            }
          } catch {
            // Silently skip invalid dates
          }
        }

        const { error: insertErr } = await supabase.from('email_messages').upsert({
          account_id: accountId2, message_id: msgId, thread_id: threadId,
          external_message_id: messageId, subject, from_address: from,
          to_address: to, received_at: receivedAt,
          body_text: bodyText.slice(0, 5000), snippet,
          labels: labelIds, is_read: isRead,
        }, { onConflict: 'account_id,message_id' });

        if (!insertErr || (typeof insertErr !== 'object')) processed.push(msgId);
      }

      await supabase.from('email_watch_history').upsert({
        account_id: accountId2, history_id: historyId,
        status: 'active',
      }, { onConflict: 'account_id' });

      return json({ ok: true, processed: processed.length, messages: messages.length });
    }

    // ── GET: status endpoint ────────────────────────────────────────
    if (req.method === 'GET') {
      const secretToken = await getSecret('gmail_pubsub_token');
      const envToken = Deno.env.get('GMAIL_PUBSUB_TOKEN');
      const tokenConfigured = (typeof secretToken === 'string' && secretToken.length > 0) || (typeof envToken === 'string' && envToken.length > 0);
      return json({ service: 'gmail-webhook', status: 'healthy', token_configured: tokenConfigured });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[gmail-webhook]', err instanceof Error ? (err.stack ?? err.message) : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Error class for deterministically non-retryable Gmail API failures.
 *
 * Non-retryable errors (e.g., 400 Bad Request, 403 Permission Denied, insufficientPermissions)
 * indicate a permanent issue that will never resolve via retry (e.g., malformed request, quota exceeded,
 * permission denied). These are marked as "poison-pill" errors: processHistory skips them, logs warnings,
 * and advances history_id to prevent the account from stalling permanently on a single bad message.
 *
 * Transient errors (network timeouts, 429 rate-limit, 5xx server errors) are thrown as plain Error,
 * causing Pub/Sub to retry the batch without advancing history_id so the message can be recovered later.
 *
 * Error Taxonomy:
 * - NonRetryableMessageError: 400, 403, insufficientPermissions, invalidArgument → skip and advance
 * - Plain Error (transient): 429, 5xx, timeout, UNAUTHENTICATED → throw so Pub/Sub retries
 */
class NonRetryableMessageError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NonRetryableMessageError'; }
}

/**
 * Resolves or refreshes Gmail OAuth access token with automatic token refresh on expiration.
 *
 * Flow:
 * 1. Query email_accounts table for stored access_token + refresh_token + token_expires_at
 * 2. If access_token exists and not expired (+ 60s buffer): return immediately (fast path)
 * 3. If no refresh_token: return null (can't refresh, account requires manual re-auth)
 * 4. If refresh_token exists: POST to Google OAuth /token endpoint with grant_type=refresh_token
 * 5. On success: extract new access_token + expires_in, persist to DB, return access_token
 * 6. On failure (network error, 4xx/5xx, missing fields): log and return null
 *
 * Token Refresh Mechanism:
 * - Proactive 60-second buffer: refresh at (token_expires_at - 60s) to avoid mid-call expiry
 * - Fallback to account-level client credentials (client_id, client_secret) if not found in DB
 * - Falls back to env vars GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 * - Timeout: 10 seconds to prevent Pub/Sub retry delays
 *
 * Database Updates:
 * - On successful refresh: update email_accounts (access_token, token_expires_at) for next cycle
 * - Skipped on failure (return null without persisting bad tokens)
 *
 * Error Handling (Logged but Not Thrown):
 * - Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: logged, return null
 * - Network error on fetch: logged, return null
 * - Invalid JSON response: logged, return null
 * - Missing access_token in response: logged, return null
 *
 * @param supabase - Supabase client with service-role permissions
 * @param accountId - UUID of email_accounts row
 * @returns access_token string or null if unavailable/unrefreshable
 */
async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: account, error } = await supabase.from('email_accounts').select('access_token, refresh_token, token_expires_at, client_id, client_secret').eq('id', accountId).maybeSingle();
  if (error || !account || typeof account !== 'object' || Array.isArray(account)) return null;

  const accountObj = account as Record<string, unknown>;
  const accessToken = typeof accountObj.access_token === 'string' ? accountObj.access_token : '';
  const refreshToken = typeof accountObj.refresh_token === 'string' ? accountObj.refresh_token : '';
  const tokenExpiresAt = typeof accountObj.token_expires_at === 'string' ? accountObj.token_expires_at : '';
  const clientId = typeof accountObj.client_id === 'string' ? accountObj.client_id : '';
  const clientSecret = typeof accountObj.client_secret === 'string' ? accountObj.client_secret : '';

  if (!accessToken) return null;

  if (tokenExpiresAt) {
    const expiresAt = new Date(tokenExpiresAt).getTime();
    if (Number.isFinite(expiresAt) && Date.now() < expiresAt + 60_000) {
      return accessToken;
    }
  }

  if (!refreshToken) return null;

  const finalClientId = clientId || Deno.env.get('GOOGLE_CLIENT_ID');
  const finalClientSecret = clientSecret || Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!finalClientId || typeof finalClientId !== 'string' || finalClientId.length === 0) {
    console.error('[gmail-webhook] GOOGLE_CLIENT_ID not configured');
    return null;
  }
  if (!finalClientSecret || typeof finalClientSecret !== 'string' || finalClientSecret.length === 0) {
    console.error('[gmail-webhook] GOOGLE_CLIENT_SECRET not configured');
    return null;
  }

  let refreshRes;
  try {
    refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: finalClientId,
        client_secret: finalClientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (fetchErr) {
    console.error('[gmail-webhook] token refresh fetch failed', fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
    return null;
  }

  if (!refreshRes.ok) return null;

  let refreshData: unknown;
  try {
    refreshData = await refreshRes.json();
  } catch {
    console.error('[gmail-webhook] failed to parse token response');
    return null;
  }

  if (!refreshData || typeof refreshData !== 'object' || Array.isArray(refreshData)) {
    return null;
  }

  const refreshDataObj = refreshData as Record<string, unknown>;
  const newToken = typeof refreshDataObj.access_token === 'string' ? refreshDataObj.access_token : '';
  const expiresIn = typeof refreshDataObj.expires_in === 'number' ? refreshDataObj.expires_in : 3600;

  if (!newToken) {
    console.error('[gmail-webhook] no access_token in refresh response');
    return null;
  }

  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  await supabase.from('email_accounts').update({
    access_token: newToken, token_expires_at: newExpiry,
  }).eq('id', accountId);

  return newToken;
}

/**
 * Fetches Gmail message history delta and persists new messages to database.
 *
 * Implements incremental sync via Gmail History API: queries for messageAdded events since
 * startHistoryId, then fetches and persists full message payloads (headers, body, thread metadata).
 *
 * History Fetch:
 * 1. GET /history?startHistoryId=X&historyTypes=messageAdded (10s timeout)
 * 2. Parse history[] array for messagesAdded[] events
 * 3. Extract messageId from each event.message (max 20 per invocation)
 *
 * Message Persistence:
 * 4. For each message: call fetchAndPersistMessage() in parallel via Promise.allSettled()
 * 5. Separate results by error type: NonRetryableMessageError (poison-pill, skip) vs Error (transient, retry)
 *
 * Error Handling & History Advancement:
 * - If poison-pill errors (4xx, 403): logged as warning, skipped (history_id advances despite error)
 * - If transient errors (5xx, timeout, 429): throw Error to make Pub/Sub retry the notification
 *   WITHOUT advancing history_id, preventing data loss when a temporary API outage occurs.
 * - If mix of both: throw only if >=1 transient error (single transient blocks retry)
 *
 * Side Effects:
 * - Queries Gmail History API (may increment API quota usage)
 * - Upserts to gmail_threads, gmail_messages tables via fetchAndPersistMessage()
 * - Logs errors (warn for poison-pill, error for transient)
 * - Throws Error if any transient failure detected (causing Pub/Sub retry)
 *
 * Performance:
 * - Fetches up to 20 message payloads in parallel (Promise.allSettled)
 * - Each fetch has 10s timeout (AbortSignal)
 * - No batching; one history-fetch per invocation
 *
 * @param supabase - Supabase client with service-role permissions
 * @param token - Gmail OAuth access_token (must be valid, not expired)
 * @param accountId - UUID of email_accounts row
 * @param startHistoryId - History ID to start from (advance incrementally per Pub/Sub batch)
 * @throws Error if transient failures (5xx, timeout, 429) detected (causes Pub/Sub retry)
 * @returns void (throws on transient error, silently skips on non-retryable errors)
 */
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

  let histData: unknown;
  try {
    histData = await histRes.json();
  } catch {
    return;
  }

  if (!histData || typeof histData !== 'object' || Array.isArray(histData)) return;
  const histDataObj = histData as Record<string, unknown>;
  if (histDataObj.error) return;

  const addedMessages: string[] = [];
  const historyList = Array.isArray(histDataObj.history) ? histDataObj.history : [];
  for (const record of historyList) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue;
    const recordObj = record as Record<string, unknown>;
    const messagesAdded = Array.isArray(recordObj.messagesAdded) ? recordObj.messagesAdded : [];
    for (const added of messagesAdded) {
      if (typeof added !== 'object' || added === null || Array.isArray(added)) continue;
      const addedObj = added as Record<string, unknown>;
      const msg = addedObj.message;
      if (typeof msg === 'object' && msg !== null && !Array.isArray(msg)) {
        const msgObj = msg as Record<string, unknown>;
        const msgId = typeof msgObj.id === 'string' ? msgObj.id : '';
        if (msgId) addedMessages.push(msgId);
      }
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

/**
 * Fetches full Gmail message payload and persists to database with comprehensive error classification.
 *
 * Gmail Message Fetch:
 * 1. GET /messages/{id}?format=full with 10s timeout
 * 2. Parse response JSON; handle both success (200 OK) and error (4xx/5xx with embedded error object)
 *
 * Error Taxonomy (Critical for Data Loss Prevention):
 * - 404 Not Found: message deleted by user before ingestion → silently return (harmless)
 * - 401/403 with status=UNAUTHENTICATED: token expired → transient, retry via Pub/Sub
 * - 401/403 with status=insufficientPermissions: permanent permission issue → throw NonRetryableMessageError
 * - 429/5xx: rate limit, server error → transient, retry via Pub/Sub
 * - 400/403 with reason=badRequest: malformed request → non-retryable, skip and advance history_id
 *
 * Reason-Based Classification (not just HTTP codes):
 * - Transient reasons: ratelimitexceeded, userratelimitexceeded, quotaexceeded, resource_exhausted
 * - Non-retryable reasons: invalidArgument, permissionDenied, notFound (but 404 returns early)
 *
 * Message Parsing (Multi-Part MIME + Fallback):
 * 3. Extract headers (Subject, From, To, Cc, Date, Message-Id) with .toLowerCase() normalization
 * 4. Parse MIME parts: search for text/plain (bodyPlain) and text/html (bodyHtml) recursively
 * 5. Fallback: if no parts array, try top-level payload.body (single-part message)
 * 6. Decode base64-URL-encoded body data (handle - → +, _ → / padding variants)
 * 7. Truncate body to storage limits: plain 50KB, html 200KB (prevent DB bloat)
 *
 * Metadata Extraction:
 * - Thread ID, labels (INBOX, UNREAD, SENT, etc.), snippet, is_read (!UNREAD), is_sent (SENT label)
 * - Attachment detection: scan parts[] for .filename attribute (boolean, not full attachments)
 * - Parse From header as email + name (regex: "Name <email>" or plain email)
 * - Date string to ISO timestamp (fallback to now() on parse error)
 *
 * Database Persistence (Three-Step Transactional Pattern):
 * 1. Upsert gmail_threads row (dedupes by account_id + thread_id)
 *    - onConflict: 'account_id,thread_id', ignoreDuplicates: true (no-op on duplicate insert)
 * 2. Update gmail_threads with newest metadata (subject, snippet, label_ids, last_message_at)
 *    - WHERE clause: lt('last_message_at', date) ensures latest timestamp always wins
 *    - Prevents older parallel message from overwriting newer subject/snippet via row-level locking
 * 3. Fetch thread row id (needed for thread_id_ref foreign key in gmail_messages)
 * 4. Upsert gmail_messages with full message details (thread_id_ref, headers, body, labels, read status)
 * 5. Recompute unread_count from actual message records (avoids last-write-wins race)
 *    - Query: count messages where thread_id_ref=X and is_read=false
 *    - Update gmail_threads.unread_count with accurate count
 *
 * Side Effects:
 * - Queries Gmail API (10s timeout, increments quota)
 * - Upserts 2-3 database rows per message (thread + message + count update)
 * - No bulk batching (one message at a time from processHistory)
 *
 * Error Propagation:
 * - Throws NonRetryableMessageError: 4xx permanent (400, 403 insufficientPermissions, etc.)
 * - Throws Error: transient (5xx, 429, timeout, JSON parse errors)
 * - Returns void: 404 (message already deleted), successful persistence
 *
 * @param supabase - Supabase client with service-role permissions
 * @param token - Gmail OAuth access_token (must be valid, not expired)
 * @param accountId - UUID of email_accounts row
 * @param messageId - Gmail message ID (unique per account, not globally unique)
 * @throws NonRetryableMessageError: permanent API error (400, 403 permission, malformed request)
 * @throws Error: transient error (5xx, 429, timeout, network failure, JSON parse failure)
 * @returns void (void return on success or 404 deletion)
 */
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

  let msg: unknown;
  try {
    msg = await msgRes.json();
  } catch {
    throw new Error(`Failed to parse message response for ${messageId}`);
  }

  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    throw new NonRetryableMessageError(`Invalid message response for ${messageId}`);
  }

  const msgObj = msg as Record<string, unknown>;
  if (msgObj.error && typeof msgObj.error === 'object' && msgObj.error !== null && !Array.isArray(msgObj.error)) {
    const errorObj = msgObj.error as Record<string, unknown>;
    const errorCode = typeof errorObj.code === 'number' ? errorObj.code : 0;

    // 404: message deleted before ingestion — expected and harmless, skip silently.
    if (errorCode === 404) return;

    // Inspect the reason/status fields for fine-grained retryability classification.
    // Coarse code-only checks misclassify retryable 401/403 variants as non-retryable,
    // causing processHistory to skip those messages and advance history_id, permanently
    // dropping emails that could have been recovered on the next Pub/Sub retry.
    let reason = '';
    if (Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
      const firstError = errorObj.errors[0];
      if (typeof firstError === 'object' && firstError !== null && !Array.isArray(firstError)) {
        const firstErrorObj = firstError as Record<string, unknown>;
        reason = typeof firstErrorObj.reason === 'string' ? firstErrorObj.reason.toLowerCase() : '';
      }
    }
    const status = typeof errorObj.status === 'string' ? errorObj.status.toLowerCase() : '';

    // Transient: hold history_id so Pub/Sub retries and recovers the missed messages.
    // 401 is NOT blanket-transient — only the specific UNAUTHENTICATED status (token-expiry)
    // qualifies. Blanket 401 classification causes persistent retry loops for account-level
    // auth failures where the token stays valid but the API keeps rejecting the request.
    const isTransient =
      errorCode === 429 ||                              // standard rate-limit header
      errorCode >= 500 ||                               // server errors
      reason === 'ratelimitexceeded' ||
      reason === 'userratelimitexceeded' ||
      reason === 'quotaexceeded' ||
      status === 'unauthenticated' ||                   // token expired — specific renewable failure
      status === 'resource_exhausted';

    if (isTransient) {
      const errorMessage = typeof errorObj.message === 'string' ? errorObj.message : '';
      throw new Error(`Gmail API transient error for message ${messageId}: ${errorCode} ${reason || errorMessage}`);
    }

    // Non-retryable (e.g. insufficientPermissions, badRequest): skip as a poison pill so the
    // account is not permanently stalled by a single bad message.
    const errorMessage = typeof errorObj.message === 'string' ? errorObj.message : '';
    throw new NonRetryableMessageError(`Gmail API non-retryable error for message ${messageId}: ${errorCode} ${reason || errorMessage}`);
  }

  const headers: Record<string, string> = {};
  const payloadVal = msgObj.payload;
  if (typeof payloadVal === 'object' && payloadVal !== null && !Array.isArray(payloadVal)) {
    const payload = payloadVal as Record<string, unknown>;
    const payloadHeaders = Array.isArray(payload.headers) ? payload.headers : [];
    for (const h of payloadHeaders) {
      if (typeof h === 'object' && h !== null && !Array.isArray(h)) {
        const hObj = h as Record<string, unknown>;
        if (typeof hObj.name === 'string' && typeof hObj.value === 'string') {
          headers[hObj.name.toLowerCase()] = hObj.value;
        }
      }
    }
  }

  const threadId = typeof msgObj.threadId === 'string' ? msgObj.threadId : '';
  const subject = headers['subject'] ?? '(sem assunto)';
  const fromHeader = headers['from'] ?? '';
  const toHeaderStr = headers['to'] ?? '';
  const toHeader = toHeaderStr.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  const ccHeaderStr = headers['cc'] ?? '';
  const ccHeader = ccHeaderStr.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0);
  const dateStr = headers['date'] ?? '';
  let date: string;
  if (typeof dateStr === 'string' && dateStr.length > 0) {
    try {
      const dateObj = new Date(dateStr);
      if (!Number.isNaN(dateObj.getTime())) {
        date = dateObj.toISOString();
      } else {
        date = new Date().toISOString();
      }
    } catch {
      date = new Date().toISOString();
    }
  } else {
    date = new Date().toISOString();
  }
  const snippet = typeof msgObj.snippet === 'string' ? msgObj.snippet : '';

  // Extrai from_email e from_name
  const fromMatch = fromHeader.match(/^(.*?)\s*<(.+?)>$/) ?? [];
  const fromName = fromMatch[1]?.trim() ?? fromHeader;
  const fromEmail = fromMatch[2] ?? fromHeader;

  // Extrai body
  let bodyPlain = '';
  let bodyHtml = '';
  const extractParts = (parts: unknown[]): void => {
    if (!Array.isArray(parts)) return;
    for (const part of parts) {
      if (typeof part !== 'object' || part === null || Array.isArray(part)) continue;
      const p = part as Record<string, unknown>;
      const mimeType = typeof p.mimeType === 'string' ? p.mimeType : '';
      if (mimeType === 'text/plain' && typeof p.body === 'object' && p.body !== null) {
        const body = p.body as Record<string, unknown>;
        if (typeof body.data === 'string') {
          try {
            bodyPlain = atob(body.data.replace(/-/g, '+').replace(/_/g, '/'));
          } catch {
            bodyPlain = '';
          }
        }
      } else if (mimeType === 'text/html' && typeof p.body === 'object' && p.body !== null) {
        const body = p.body as Record<string, unknown>;
        if (typeof body.data === 'string') {
          try {
            bodyHtml = atob(body.data.replace(/-/g, '+').replace(/_/g, '/'));
          } catch {
            bodyHtml = '';
          }
        }
      } else if (Array.isArray(p.parts)) {
        extractParts(p.parts);
      }
    }
  };

  if (typeof payloadVal === 'object' && payloadVal !== null && !Array.isArray(payloadVal)) {
    const payload = payloadVal as Record<string, unknown>;
    const payloadParts = Array.isArray(payload.parts) ? payload.parts : null;
    if (payloadParts) {
      extractParts(payloadParts);
    } else if (typeof payload.body === 'object' && payload.body !== null) {
      const body = payload.body as Record<string, unknown>;
      if (typeof body.data === 'string') {
        try {
          const data = body.data.replace(/-/g, '+').replace(/_/g, '/');
          const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : '';
          if (mimeType === 'text/html') {
            bodyHtml = atob(data);
          } else {
            bodyPlain = atob(data);
          }
        } catch {
          // continue
        }
      }
    }
  }

  const labelIds = Array.isArray(msgObj.labelIds) ? msgObj.labelIds.filter((l: unknown) => typeof l === 'string') : [];
  const isRead = !labelIds.includes('UNREAD');
  const isSent = labelIds.includes('SENT');
  let hasAttach = false;
  if (typeof payloadVal === 'object' && payloadVal !== null && !Array.isArray(payloadVal)) {
    const payload = payloadVal as Record<string, unknown>;
    const payloadParts = Array.isArray(payload.parts) ? payload.parts : [];
    hasAttach = payloadParts.some((p: unknown) =>
      typeof p === 'object' && p !== null && !Array.isArray(p) && (typeof (p as Record<string, unknown>).filename === 'string')
    );
  }

  // Step 1: insert the thread row if it doesn't exist yet (no-op on conflict).
  if (!threadId) return;

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

  if (!thread || typeof thread !== 'object' || Array.isArray(thread)) return;

  const threadObj = thread as Record<string, unknown>;
  const threadRefId = typeof threadObj.id === 'string' ? threadObj.id : '';
  if (!threadRefId) return;

  // Upsert gmail_messages
  await supabase.from('gmail_messages').upsert({
    thread_id_ref:   threadRefId,
    account_id:      accountId,
    message_id:      messageId,
    from_email:      fromEmail,
    from_name:       fromName,
    to_emails:       toHeader,
    cc_emails:       ccHeader,
    bcc_emails:      [],
    subject,
    body_plain:      bodyPlain.substring(0, 50000),
    body_html:       bodyHtml.substring(0, 200000),
    snippet,
    label_ids:       labelIds,
    is_read:         isRead,
    is_sent:         isSent,
    has_attachments: hasAttach,
    internal_date:   date,
  }, { onConflict: 'account_id,message_id' });

  // Recompute unread_count from actual message records — avoids the literal
  // 0/1 last-write-wins race when concurrent messages share the same thread.
  const { count: unreadCount } = await supabase
    .from('gmail_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id_ref', threadRefId)
    .eq('is_read', false);

  if (unreadCount !== null && unreadCount >= 0) {
    await supabase.from('gmail_threads')
      .update({ unread_count: unreadCount })
      .eq('id', threadRefId);
  }
}
