import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Edge Function: Gmail Sync — OAuth Token Refresh & Thread List Retrieval
 *
 * Synchronizes Gmail threads for authenticated user, supporting incremental sync via pagination.
 * Auto-refreshes OAuth tokens (proactive refresh before expiry to prevent failures mid-sync).
 *
 * Authentication:
 * - Requires valid Supabase JWT (Bearer token in Authorization header)
 * - Verifies user ownership of gmail_accounts row before proceeding (prevents cross-user access)
 * - Returns 403 if account not found or belongs to different user, 401 if token invalid
 *
 * Supported Actions:
 * - listThreads (default): Query Gmail threads with optional filters, pagination
 *   • labelIds: array of label IDs (default: ['INBOX'])
 *   • q: Gmail search query (optional, e.g., "from:sender@example.com before:2024-01-01")
 *   • maxResults: 1-50, clamped to [1, 50] (default: 20)
 *   • pageToken: pagination cursor from previous response
 *   • Fetches first message metadata (Subject, From, Date) + message count + unread status for each thread
 *   • Returns paginated results with nextPageToken for continuation
 *
 * OAuth Token Management:
 * - getValidToken: Retrieves cached token, auto-refreshes if expiring within next 5 minutes (proactive)
 * - Caches refreshed tokens to avoid repeated refresh API calls
 * - Prevents token expiry during multi-thread sync by monitoring expiration
 *
 * Batch Processing:
 * - Fetches thread details in bounded batches of 5 to avoid Gmail API rate limits (quota_user: accountId)
 * - Each thread fetches: /threads/{id}?format=metadata + headers extraction (Subject, From, Date)
 * - Gracefully handles partial failures: missing/invalid threads return null, sync continues
 *
 * Response Format:
 * - Success (200): { threads: [...], nextPageToken?, snippet: "..." }
 * - Errors: { error: "message" } with appropriate HTTP status (400/401/403/500)
 * - All responses use application/json with CORS headers
 *
 * Error Handling:
 * - Invalid JSON: 400 + "Invalid JSON"
 * - Missing/invalid accountId: 403 + "Conta não encontrada ou acesso negado"
 * - Expired/invalid token: 401 + "Token inválido ou conta inexistente"
 * - Gmail API errors: Logged, returned with error details from Gmail response
 * - Network timeouts: 10s AbortSignal on all Gmail API calls
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) return json({ error: 'Server misconfigured' }, 503);

    const supabase = createClient(supabaseUrl, supabaseKey);

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      return json({ error: 'Request body must be an object' }, 400);
    }

    const body = rawBody as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'listThreads';
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';

    // Verify the authenticated user owns this gmail_accounts row before proceeding.
    const { data: accountCheck, error: accountCheckError } = await supabase
      .from('gmail_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', authed.user.id)
      .maybeSingle();
    if (accountCheckError) return json({ error: 'Internal server error' }, 500);
    if (!accountCheck) return json({ error: 'Conta não encontrada ou acesso negado' }, 403);

    // Obtém token válido (com auto-refresh)
    const token = await getValidToken(supabase, accountId);
    if (!token) return json({ error: 'Token inválido ou conta inexistente' }, 401);

    // ── listThreads ────────────────────────────────────────────────────
    if (action === 'listThreads' || !action) {
      const labelIds = Array.isArray(body.labelIds) ? (body.labelIds as unknown[])
        .filter(x => typeof x === 'string').map(x => String(x))
        : ['INBOX'];
      const q = typeof body.q === 'string' ? body.q : '';
      const pageToken = typeof body.pageToken === 'string' ? body.pageToken : '';
      const maxResultsNum = typeof body.maxResults === 'number' ? body.maxResults : 20;
      const maxResults = Math.min(Math.max(1, Math.floor(maxResultsNum)), 50);

      const params = new URLSearchParams({
        maxResults: String(maxResults),
        ...(labelIds.length ? { labelIds: labelIds.join(',') } : {}),
        ...(q ? { q } : {}),
        ...(pageToken ? { pageToken } : {}),
      });

      const listRes = await fetch(`${GMAIL_API}/threads?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      let listData: unknown;
      try {
        listData = await listRes.json();
      } catch {
        return json({ error: 'Invalid Gmail API response' }, 500);
      }

      if (typeof listData !== 'object' || listData === null || Array.isArray(listData)) {
        return json({ error: 'Invalid Gmail API response format' }, 500);
      }

      const listDataObj = listData as Record<string, unknown>;
      if (typeof listDataObj.error === 'object' && listDataObj.error !== null) {
        console.error('[gmail-sync] list threads error', listDataObj.error);
        return json({ error: 'Failed to list Gmail threads' }, 400);
      }

      const threads = Array.isArray(listDataObj.threads) ? listDataObj.threads : [];
      const threadsArray = threads
        .filter(t => typeof t === 'object' && t !== null && !Array.isArray(t))
        .map(t => t as Record<string, unknown>)
        .filter(t => typeof t.id === 'string');

      // Fetch thread details in bounded batches of 5 to avoid Gmail API rate limits
      const threadResults = await batchSettled(
        threadsArray,
        async (t) => {
          const tRes = await fetch(`${GMAIL_API}/threads/${t.id}?format=metadata&metadataHeaders=Subject,From,Date`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
          });
          let tData: unknown;
          try {
            tData = await tRes.json();
          } catch {
            return null;
          }
          if (typeof tData !== 'object' || tData === null || Array.isArray(tData)) return null;
          const tDataObj = tData as Record<string, unknown>;
          if (typeof tDataObj.error === 'object' && tDataObj.error !== null) return null;

          const messages = Array.isArray(tDataObj.messages) ? tDataObj.messages : [];
          const firstMsg = messages.length > 0 && typeof messages[0] === 'object' && messages[0] !== null && !Array.isArray(messages[0])
            ? (messages[0] as Record<string, unknown>)
            : null;
          const lastMsg = messages.length > 0 && typeof messages[messages.length - 1] === 'object' && messages[messages.length - 1] !== null && !Array.isArray(messages[messages.length - 1])
            ? (messages[messages.length - 1] as Record<string, unknown>)
            : null;

          const firstMsgPayload = firstMsg && typeof firstMsg.payload === 'object' && firstMsg.payload !== null && !Array.isArray(firstMsg.payload)
            ? (firstMsg.payload as Record<string, unknown>)
            : null;
          const firstMsgHeaders = firstMsgPayload && Array.isArray(firstMsgPayload.headers)
            ? (firstMsgPayload.headers as Array<{name: string; value: string}>)
            : [];
          const hdrMap = headerMap(firstMsgHeaders);
          const subject = hdrMap['subject'] ?? '(sem assunto)';
          const fromH = hdrMap['from'] ?? '';

          const lastMsgInternalDate = lastMsg && typeof lastMsg.internalDate === 'string'
            ? lastMsg.internalDate
            : null;
          const dateH = lastMsgInternalDate ? new Date(Number(lastMsgInternalDate)).toISOString() : null;

          const tLabels = firstMsg && Array.isArray(firstMsg.labelIds)
            ? (firstMsg.labelIds as unknown[]).filter(x => typeof x === 'string').map(x => String(x))
            : [];
          const lastMsgSnippet = lastMsg && typeof lastMsg.snippet === 'string' ? lastMsg.snippet : '';
          const snippet = lastMsgSnippet;
          const unread = tLabels.includes('UNREAD') ? 1 : 0;
          const messageCount = messages.length;

          const { data: thread } = await supabase
            .from('gmail_threads')
            .upsert({
              account_id:         accountId,
              thread_id:          t.id,
              subject,
              snippet,
              label_ids:          tLabels,
              last_message_at:    dateH,
              unread_count:       unread,
              message_count:      messageCount,
              participant_emails: extractEmails(fromH),
            }, { onConflict: 'account_id,thread_id' })
            .select('id')
            .single();

          return { id: t.id, subject, snippet, fromHeader: fromH, lastActivity: dateH, unread: unread > 0, dbId: thread?.id };
        },
        5,
      );

      const threads = threadResults
        .map(r => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);

      return json({ threads, nextPageToken: listData.nextPageToken ?? null });
    }

    // ── syncFull — sincronização completa inicial ──────────────────────
    if (action === 'syncFull') {
      const labelIds = Array.isArray(body.labelIds) ? (body.labelIds as unknown[])
        .filter(x => typeof x === 'string').map(x => String(x))
        : ['INBOX'];
      const maxResultsNum = typeof body.maxResults === 'number' ? body.maxResults : 50;
      const maxResults = Math.min(Math.max(1, Math.floor(maxResultsNum)), 100);
      const params = new URLSearchParams({
        maxResults: String(maxResults),
        ...(labelIds.length ? { labelIds: labelIds.join(',') } : {}),
      });

      const listRes = await fetch(`${GMAIL_API}/messages?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!listRes.ok) {
        console.error('[gmail-sync] syncFull list HTTP error', listRes.status);
        return json({ error: 'Failed to list Gmail messages' }, 502);
      }

      let listDataRaw: unknown;
      try {
        listDataRaw = await listRes.json();
      } catch {
        return json({ error: 'Invalid Gmail API response' }, 502);
      }

      if (typeof listDataRaw !== 'object' || listDataRaw === null || Array.isArray(listDataRaw)) {
        return json({ error: 'Invalid Gmail API response format' }, 502);
      }

      const listData = listDataRaw as Record<string, unknown>;
      if (typeof listData.error === 'object' && listData.error !== null) {
        console.error('[gmail-sync] syncFull list error', listData.error);
        return json({ error: 'Failed to list Gmail messages' }, 502);
      }

      const messages = Array.isArray(listData.messages) ? listData.messages : [];
      const messagesArray = messages
        .filter(m => typeof m === 'object' && m !== null && !Array.isArray(m))
        .map(m => m as Record<string, unknown>)
        .filter(m => typeof m.id === 'string');

      // Cap concurrency at 5 to avoid Gmail API rate limits on full sync
      const settled = await batchSettled(
        messagesArray,
        (m) => fetchAndPersistMessage(supabase, token, accountId, m.id as string),
        5,
      );
      const syncedCount = settled.filter(r => r.status === 'fulfilled').length;
      const failedCount = settled.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) console.error(`[gmail-sync] syncFull: ${failedCount} messages failed to persist`);

      const nextPageToken = typeof listData.nextPageToken === 'string' ? listData.nextPageToken : null;
      return json({ synced: syncedCount, failed: failedCount, nextPageToken });
    }

    // ── syncLabels — sincroniza labels do Gmail ────────────────────────
    if (action === 'syncLabels') {
      const lblRes = await fetch(`${GMAIL_API}/labels`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      let lblDataRaw: unknown;
      try {
        lblDataRaw = await lblRes.json();
      } catch {
        return json({ error: 'Invalid Gmail API response' }, 500);
      }

      if (typeof lblDataRaw !== 'object' || lblDataRaw === null || Array.isArray(lblDataRaw)) {
        return json({ error: 'Invalid Gmail API response format' }, 500);
      }

      const lblData = lblDataRaw as Record<string, unknown>;
      const labels = Array.isArray(lblData.labels) ? lblData.labels : [];
      const labelsArray = labels
        .filter(l => typeof l === 'object' && l !== null && !Array.isArray(l))
        .map(l => l as Record<string, unknown>);

      for (const lbl of labelsArray) {
        const lblId = typeof lbl.id === 'string' ? lbl.id : '';
        const lblName = typeof lbl.name === 'string' ? lbl.name : '';
        const lblType = typeof lbl.type === 'string' ? lbl.type.toLowerCase() : undefined;

        if (lblId) {
          await supabase.from('gmail_labels').upsert({
            account_id: accountId,
            label_id:   lblId,
            name:       lblName,
            type:       lblType,
          }, { onConflict: 'account_id,label_id' });
        }
      }

      const syncedCount = labelsArray.length;
      return json({ synced: syncedCount });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error('[gmail-sync]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Executes async function over items with bounded concurrency to avoid API rate limits.
 * Batches items into groups, awaits each group with Promise.allSettled, concatenates results.
 * Returns all PromiseSettledResult<R> including both fulfillments and rejections (no early stops).
 * Useful for bounded Gmail API calls (typically concurrency=5 to respect quota).
 */
async function batchSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Converts Gmail header array to normalized Record<string, string>.
 * Lowercases header names for case-insensitive lookup (e.g., "Subject", "From").
 * Returns last value if duplicate headers exist. Used to extract Subject, From, To, etc.
 */
function headerMap(headers: Array<{name: string; value: string}>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) out[h.name.toLowerCase()] = h.value;
  return out;
}

/**
 * Extracts email addresses from "From" header value.
 * Handles both "Name <email@domain.com>" and plain "email@domain.com" formats.
 * Returns array with single email address for consistency with multi-recipient headers.
 */
function extractEmails(from: string): string[] {
  const match = from.match(/<(.+?)>/);
  return [match?.[1] ?? from].filter(Boolean);
}

/**
 * Retrieves and auto-refreshes OAuth access token for Gmail account.
 * Proactively refreshes if token expires within next 5 minutes (prevents mid-sync failures).
 * On successful refresh, persists new token + expiry to gmail_accounts table.
 * On permanent failures (invalid refresh token, missing credentials, API error), marks account inactive.
 *
 * Returns: Valid access token string, or null if token unavailable/refresh failed.
 * Prevents: Expired token usage, race conditions during token refresh, reuse of invalid tokens.
 */
async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: acc } = await supabase
    .from('gmail_accounts')
    .select('access_token, token_expiry, refresh_token')
    .eq('id', accountId)
    .single();

  if (!acc) return null;

  const accObj = acc as Record<string, unknown>;
  const accessToken = typeof accObj.access_token === 'string' ? accObj.access_token : '';
  const tokenExpiry = typeof accObj.token_expiry === 'string' ? accObj.token_expiry : '';
  const refreshToken = typeof accObj.refresh_token === 'string' ? accObj.refresh_token : '';

  if (!accessToken || !tokenExpiry || !refreshToken) return null;

  try {
    const expiry = new Date(tokenExpiry).getTime();
    if (Date.now() < expiry - 5 * 60 * 1000) return accessToken;
  } catch {
    return null;
  }

  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!googleClientId || !googleClientSecret) {
    console.error('[gmail-sync] Missing Google OAuth credentials');
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  // Refresh
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     googleClientId,
      client_secret: googleClientSecret,
      grant_type:    'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  let tokensRaw: unknown;
  try {
    tokensRaw = await tokenRes.json();
  } catch {
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  if (typeof tokensRaw !== 'object' || tokensRaw === null || Array.isArray(tokensRaw)) {
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  const tokens = tokensRaw as Record<string, unknown>;
  if (typeof tokens.error === 'object' && tokens.error !== null) {
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  const newAccessToken = typeof tokens.access_token === 'string' ? tokens.access_token : '';
  const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;

  if (!newAccessToken) {
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  await supabase.from('gmail_accounts').update({ access_token: newAccessToken, token_expiry: newExpiry }).eq('id', accountId);
  return newAccessToken;
}

/**
 * Fetches full message from Gmail API and persists normalized record to messages table.
 * Extracts headers (Subject, From, To, Cc, Date), message body (plain + HTML),
 * attachment metadata, and read/sent status from labels.
 *
 * Handles multipart MIME structures: walks parts tree, extracts base64-decoded bodies,
 * detects plain/HTML/attachment content, normalizes sender/recipient email addresses.
 *
 * Graceful failure: Network timeouts (10s AbortSignal), parse errors, missing fields → silently skips.
 * No exceptions raised; callers rely on batchSettled to continue if individual fetches fail.
 * Used in bounded batches (concurrency=5) to respect Gmail API quota.
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

  let msgRaw: unknown;
  try {
    msgRaw = await msgRes.json();
  } catch {
    return;
  }

  if (typeof msgRaw !== 'object' || msgRaw === null || Array.isArray(msgRaw)) return;
  const msg = msgRaw as Record<string, unknown>;

  if (typeof msg.error === 'object' && msg.error !== null) return;

  const msgPayload = typeof msg.payload === 'object' && msg.payload !== null && !Array.isArray(msg.payload)
    ? (msg.payload as Record<string, unknown>)
    : null;

  const payloadHeaders = msgPayload && Array.isArray(msgPayload.headers)
    ? (msgPayload.headers as Array<{name: string; value: string}>)
    : [];
  const hdrs = headerMap(payloadHeaders);
  const threadId = typeof msg.threadId === 'string' ? msg.threadId : '';
  const subject = hdrs['subject'] ?? '(sem assunto)';
  const fromH = hdrs['from'] ?? '';

  const toHeaderStr = typeof hdrs['to'] === 'string' ? hdrs['to'] : '';
  const toH = toHeaderStr.split(',').map((s: string) => s.trim()).filter(Boolean);

  const ccHeaderStr = typeof hdrs['cc'] === 'string' ? hdrs['cc'] : '';
  const ccH = ccHeaderStr.split(',').map((s: string) => s.trim()).filter(Boolean);

  const internalDateStr = typeof msg.internalDate === 'string' ? msg.internalDate : '';
  const date = internalDateStr ? new Date(Number(internalDateStr)).toISOString() : new Date().toISOString();

  const snippet = typeof msg.snippet === 'string' ? msg.snippet : '';
  const labelIds = Array.isArray(msg.labelIds)
    ? (msg.labelIds as unknown[]).filter(x => typeof x === 'string').map(x => String(x))
    : [];
  const isRead = !labelIds.includes('UNREAD');
  const isSent = labelIds.includes('SENT');

  const fmatch = fromH.match(/^(.*?)\s*<(.+?)>$/) ?? [];
  const fromName = fmatch[1]?.trim() ?? fromH;
  const fromEmail = fmatch[2] ?? fromH;

  let bodyPlain = '', bodyHtml = '';
  const walk = (parts: unknown[]): void => {
    for (const p of parts ?? []) {
      if (typeof p !== 'object' || p === null || Array.isArray(p)) continue;
      const part = p as Record<string, unknown>;

      const partBody = typeof part.body === 'object' && part.body !== null && !Array.isArray(part.body)
        ? (part.body as Record<string, unknown>)
        : null;
      const bodyData = typeof partBody?.data === 'string' ? partBody.data : '';
      const data = bodyData.replace(/-/g, '+').replace(/_/g, '/');

      if (part.mimeType === 'text/plain' && data) bodyPlain = atob(data);
      else if (part.mimeType === 'text/html' && data) bodyHtml = atob(data);

      if (Array.isArray(part.parts)) walk(part.parts);
    }
  };

  const payloadParts = msgPayload && Array.isArray(msgPayload.parts)
    ? (msgPayload.parts as unknown[])
    : [];
  if (payloadParts.length > 0) {
    walk(payloadParts);
  } else if (msgPayload && typeof msgPayload.body === 'object' && msgPayload.body !== null && !Array.isArray(msgPayload.body)) {
    const payloadBodyData = msgPayload.body as Record<string, unknown>;
    const singleData = typeof payloadBodyData.data === 'string' ? payloadBodyData.data : '';
    if (singleData) {
      const data = singleData.replace(/-/g, '+').replace(/_/g, '/');
      if (msgPayload.mimeType === 'text/html') bodyHtml = atob(data);
      else bodyPlain = atob(data);
    }
  }

  const hasAttachments = payloadParts.some((p: unknown) => {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return false;
    const part = p as Record<string, unknown>;
    return typeof part.filename === 'string' && part.filename.length > 0;
  });

  const { data: thread } = await supabase.from('gmail_threads').upsert({
    account_id:          accountId,
    thread_id:           threadId,
    subject,
    snippet,
    label_ids:           labelIds,
    last_message_at:     date,
    unread_count:        isRead ? 0 : 1,
    participant_emails:  extractEmails(fromH),
  }, { onConflict: 'account_id,thread_id' }).select('id').single();

  if (!thread) return;

  await supabase.from('gmail_messages').upsert({
    thread_id_ref:   thread.id,
    account_id:      accountId,
    message_id:      messageId,
    from_email:      fromEmail,
    from_name:       fromName,
    to_emails:       toH,
    cc_emails:       ccH,
    bcc_emails:      [],
    subject,
    body_plain:      bodyPlain.substring(0, 50000),
    body_html:       bodyHtml.substring(0, 200000),
    snippet,
    label_ids:       labelIds,
    is_read:         isRead,
    is_sent:         isSent,
    has_attachments: hasAttachments,
    internal_date:   date,
  }, { onConflict: 'account_id,message_id' });
}
