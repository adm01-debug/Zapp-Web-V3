import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireUser } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { GmailSyncV1Schema } from '../_shared/contract-schemas.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// 20 MB in bytes — Storage bucket `email-attachments` enforces this as its hard limit.
const MAX_ATTACHMENT_BYTES = 20_971_520;

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
 *
 * Attachment Handling (EMAIL-04):
 * - On syncFull, calls processAttachments() for each persisted message
 * - Downloads binary content from Gmail Attachments API (30s timeout)
 * - Skips attachments > 20 MB (Storage bucket hard limit)
 * - Uploads to Supabase Storage bucket `email-attachments`
 * - Upserts metadata into zapp.email_attachments table
 * - Storage path format: {email_message_db_id}/{gmail_attachment_id}/{filename}
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`gmail-sync:${authed.user.id}`, 20, 60_000);
    if (!rl.allowed) return json({ error: 'Rate limit exceeded. Tente novamente em instantes.' }, 429);

    const supabase = createZappAdminClient();

    // Contrato gmail-sync@v1 (estrito): accountId obrigatório + action enum fechado.
    const rawBody = await req.json().catch(() => null);
    const parsed = parseOrReject('gmail-sync', { v1: GmailSyncV1Schema }, req, rawBody, {
      extraHeaders: getCorsHeaders(req),
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;
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

      if (!listRes.ok) {
        console.error('[gmail-sync] list threads HTTP error', listRes.status);
        return json({ error: 'Failed to list Gmail threads' }, listRes.status >= 500 ? 502 : 400);
      }

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
          if (!tRes.ok) return null;
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

          const { data: thread, error: threadErr } = await supabase
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
            .maybeSingle();

          if (threadErr) {
            console.error(`[gmail-sync] thread upsert failed for ${t.id}:`, threadErr.message);
          }

          return { id: t.id, subject, snippet, fromHeader: fromH, lastActivity: dateH, unread: unread > 0, dbId: thread?.id };
        },
        5,
      );

      const threadsPayload = threadResults
        .map(r => (r.status === 'fulfilled' ? r.value : null))
        .filter(Boolean);

      return json({ threads: threadsPayload, nextPageToken: listData.nextPageToken ?? null });
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

      if (!lblRes.ok) {
        console.error('[gmail-sync] syncLabels HTTP error', lblRes.status);
        return json({ error: 'Failed to fetch Gmail labels' }, lblRes.status >= 500 ? 502 : 400);
      }

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
      if (typeof lblData.error === 'object' && lblData.error !== null) {
        console.error('[gmail-sync] syncLabels Gmail API error', lblData.error);
        return json({ error: 'Failed to fetch Gmail labels' }, 400);
      }
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

    // ── createLabel — cria nova label Gmail ──────────────────────────────
    if (action === 'createLabel') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return json({ error: 'name é obrigatório para criar uma label' }, 400);
      const labelPayload: Record<string, unknown> = { name };
      if (typeof body.labelListVisibility === 'string') labelPayload.labelListVisibility = body.labelListVisibility;
      if (typeof body.messageListVisibility === 'string') labelPayload.messageListVisibility = body.messageListVisibility;
      if (body.color && typeof body.color === 'object' && !Array.isArray(body.color)) labelPayload.color = body.color;
      const createRes = await fetch(`${GMAIL_API}/labels`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(labelPayload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!createRes.ok) {
        console.error('[gmail-sync] createLabel HTTP error', createRes.status);
        return json({ error: 'Failed to create Gmail label' }, createRes.status >= 500 ? 502 : 400);
      }
      let created: unknown;
      try { created = await createRes.json(); } catch { return json({ error: 'Invalid Gmail API response' }, 500); }
      if (typeof created !== 'object' || created === null || Array.isArray(created)) return json({ error: 'Invalid Gmail API response format' }, 500);
      const createdObj = created as Record<string, unknown>;
      if (typeof createdObj.error === 'object' && createdObj.error !== null) {
        console.error('[gmail-sync] createLabel Gmail API error', createdObj.error);
        return json({ error: 'Gmail API error creating label' }, 400);
      }
      if (typeof createdObj.id === 'string' && createdObj.id) {
        await supabase.from('gmail_labels').upsert({
          account_id: accountId, label_id: createdObj.id,
          name: typeof createdObj.name === 'string' ? createdObj.name : name, type: 'user',
        }, { onConflict: 'account_id,label_id' });
      }
      return json({ label: createdObj });
    }

    // ── updateLabel — atualiza label Gmail existente ─────────────────────
    if (action === 'updateLabel') {
      const labelId = typeof body.labelId === 'string' ? body.labelId.trim() : '';
      if (!labelId) return json({ error: 'labelId é obrigatório para atualizar uma label' }, 400);
      const patchPayload: Record<string, unknown> = { id: labelId };
      if (typeof body.name === 'string' && body.name.trim()) patchPayload.name = body.name.trim();
      if (typeof body.labelListVisibility === 'string') patchPayload.labelListVisibility = body.labelListVisibility;
      if (typeof body.messageListVisibility === 'string') patchPayload.messageListVisibility = body.messageListVisibility;
      if (body.color && typeof body.color === 'object' && !Array.isArray(body.color)) patchPayload.color = body.color;
      const patchRes = await fetch(`${GMAIL_API}/labels/${encodeURIComponent(labelId)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!patchRes.ok) {
        console.error('[gmail-sync] updateLabel HTTP error', patchRes.status);
        return json({ error: 'Failed to update Gmail label' }, patchRes.status >= 500 ? 502 : 400);
      }
      let updated: unknown;
      try { updated = await patchRes.json(); } catch { return json({ error: 'Invalid Gmail API response' }, 500); }
      if (typeof updated !== 'object' || updated === null || Array.isArray(updated)) return json({ error: 'Invalid Gmail API response format' }, 500);
      const updatedObj = updated as Record<string, unknown>;
      if (typeof updatedObj.error === 'object' && updatedObj.error !== null) {
        console.error('[gmail-sync] updateLabel Gmail API error', updatedObj.error);
        return json({ error: 'Gmail API error updating label' }, 400);
      }
      if (typeof patchPayload.name === 'string') {
        await supabase.from('gmail_labels').update({ name: patchPayload.name })
          .eq('account_id', accountId).eq('label_id', labelId);
      }
      return json({ label: updatedObj });
    }

    // ── deleteLabel — remove label Gmail ─────────────────────────────────
    if (action === 'deleteLabel') {
      const labelId = typeof body.labelId === 'string' ? body.labelId.trim() : '';
      if (!labelId) return json({ error: 'labelId é obrigatório para deletar uma label' }, 400);
      const deleteRes = await fetch(`${GMAIL_API}/labels/${encodeURIComponent(labelId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      // 204 = success; 404 = already gone (treat as success); other errors → fail
      if (!deleteRes.ok && deleteRes.status !== 404) {
        console.error('[gmail-sync] deleteLabel HTTP error', deleteRes.status);
        return json({ error: 'Failed to delete Gmail label' }, deleteRes.status >= 500 ? 502 : 400);
      }
      await supabase.from('gmail_labels').delete().eq('account_id', accountId).eq('label_id', labelId);
      return json({ deleted: true, labelId });
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
async function getValidToken(supabase: ReturnType<typeof createZappAdminClient>, accountId: string): Promise<string | null> {
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

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.warn(`[gmail-sync] token refresh HTTP ${tokenRes.status} for ${accountId}`, errText.slice(0, 200));
    return null;
  }

  let tokensRaw: unknown;
  try {
    tokensRaw = await tokenRes.json();
  } catch {
    console.warn(`[gmail-sync] token refresh non-JSON response for ${accountId}`);
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
 * After persisting the message row, calls processAttachments() to download and upload
 * each attachment binary to Supabase Storage and record it in email_attachments.
 *
 * Graceful failure: Network timeouts (10s AbortSignal), parse errors, missing fields → silently skips.
 * No exceptions raised; callers rely on batchSettled to continue if individual fetches fail.
 * Used in bounded batches (concurrency=5) to respect Gmail API quota.
 */
async function fetchAndPersistMessage(
  supabase: ReturnType<typeof createZappAdminClient>,
  token: string,
  accountId: string,
  messageId: string
): Promise<void> {
  const msgRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!msgRes.ok) {
    if (msgRes.status === 404) return; // deleted before ingestion, skip silently
    // Non-404 HTTP errors: throw so batchSettled counts them as failures
    throw new Error(`Gmail API HTTP ${msgRes.status} for message ${messageId}`);
  }

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

  // Recursively check if any MIME part is a named attachment with an attachmentId.
  // Uses deep traversal so nested multipart/mixed structures are correctly detected.
  const checkHasAttachments = (parts: unknown[]): boolean => {
    for (const p of parts) {
      if (typeof p !== 'object' || p === null || Array.isArray(p)) continue;
      const part = p as Record<string, unknown>;
      if (typeof part.filename === 'string' && part.filename.length > 0) {
        const partBody = typeof part.body === 'object' && part.body !== null && !Array.isArray(part.body)
          ? (part.body as Record<string, unknown>)
          : null;
        if (partBody && typeof partBody.attachmentId === 'string' && partBody.attachmentId.length > 0) {
          return true;
        }
      }
      if (Array.isArray(part.parts) && checkHasAttachments(part.parts)) return true;
    }
    return false;
  };

  const hasAttachments = checkHasAttachments(payloadParts);

  const { data: thread, error: threadErr2 } = await supabase.from('gmail_threads').upsert({
    account_id:          accountId,
    thread_id:           threadId,
    subject,
    snippet,
    label_ids:           labelIds,
    last_message_at:     date,
    unread_count:        isRead ? 0 : 1,
    participant_emails:  extractEmails(fromH),
  }, { onConflict: 'account_id,thread_id' }).select('id').maybeSingle();

  if (threadErr2) {
    console.error(`[gmail-sync] thread upsert failed for ${threadId}:`, threadErr2.message);
  }

  if (!thread) return;

  // Get the DB UUID of the upserted message so processAttachments can link to it.
  const { data: msgData, error: msgErr } = await supabase.from('gmail_messages').upsert({
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
  }, { onConflict: 'account_id,message_id' }).select('id').maybeSingle();

  if (msgErr) {
    console.error(`[gmail-sync] message upsert failed for ${messageId}:`, msgErr.message);
  }

  // Download and store attachments when the message row is available and attachments exist.
  if (msgData?.id && hasAttachments) {
    await processAttachments(messageId, payloadParts, msgData.id, token, supabase);
  }
}

/**
 * Downloads each Gmail attachment binary and persists it to Storage + DB.
 *
 * For every MIME part that carries a non-empty filename and an attachmentId:
 *   1. Size guard — skip if size_bytes > 20 971 520 (20 MB, Storage bucket limit).
 *   2. Fetch binary — GET /gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}
 *      with Authorization header; response is { data: "<base64url>" }.
 *   3. Decode base64url → Uint8Array (replace - → +, _ → /, then atob).
 *   4. Upload to Storage bucket `email-attachments` with upsert=true.
 *      Path: {emailMessageId}/{gmailAttachmentId}/{filename}
 *   5. Upsert row into zapp.email_attachments with conflict key
 *      (email_message_id, gmail_attachment_id).
 *
 * Errors are logged per-attachment and execution continues to the next attachment.
 * Nested multipart structures are traversed recursively.
 *
 * @param gmailMessageId  Gmail message ID (for Attachments API path)
 * @param parts           MIME parts array from the message payload
 * @param emailMessageId  DB UUID of the persisted gmail_messages row
 * @param accessToken     Valid OAuth access token
 * @param adminClient     Supabase admin client (service_role, bypasses RLS)
 */
async function processAttachments(
  gmailMessageId: string,
  parts: unknown[],
  emailMessageId: string,
  accessToken: string,
  adminClient: ReturnType<typeof createZappAdminClient>,
): Promise<void> {
  interface AttachmentMeta {
    filename: string;
    mimeType: string;
    attachmentId: string;
    sizeBytes: number;
  }

  // Recursively walk MIME parts to collect all attachment entries.
  const collected: AttachmentMeta[] = [];
  const collectAttachments = (pts: unknown[]): void => {
    for (const p of pts) {
      if (typeof p !== 'object' || p === null || Array.isArray(p)) continue;
      const part = p as Record<string, unknown>;

      const filename = typeof part.filename === 'string' ? part.filename.trim() : '';
      const partBody = typeof part.body === 'object' && part.body !== null && !Array.isArray(part.body)
        ? (part.body as Record<string, unknown>)
        : null;
      const attachmentId = partBody && typeof partBody.attachmentId === 'string' ? partBody.attachmentId : '';

      if (filename && attachmentId) {
        const sizeBytes = partBody && typeof partBody.size === 'number' ? partBody.size : 0;
        const mimeType = typeof part.mimeType === 'string' ? part.mimeType : 'application/octet-stream';
        collected.push({ filename, mimeType, attachmentId, sizeBytes });
      }

      // Recurse into nested multipart structures (e.g. multipart/alternative, multipart/mixed).
      if (Array.isArray(part.parts)) collectAttachments(part.parts);
    }
  };

  collectAttachments(parts);

  for (const att of collected) {
    // Guard: skip attachments that exceed the Storage bucket's 20 MB hard limit.
    if (att.sizeBytes > MAX_ATTACHMENT_BYTES) {
      console.warn(
        `[gmail-sync] processAttachments: skipping "${att.filename}" — ` +
        `${att.sizeBytes} bytes exceeds ${MAX_ATTACHMENT_BYTES} byte limit`,
      );
      continue;
    }

    try {
      // Step 1 — Fetch binary content from Gmail Attachments API.
      const attRes = await fetch(
        `${GMAIL_API}/messages/${gmailMessageId}/attachments/${att.attachmentId}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          // Allow up to 30 s for larger attachments (up to the 20 MB guard above).
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (!attRes.ok) {
        console.error(
          `[gmail-sync] processAttachments: Gmail API HTTP ${attRes.status} ` +
          `for attachment "${att.filename}" (msg=${gmailMessageId})`,
        );
        continue;
      }

      let attDataRaw: unknown;
      try {
        attDataRaw = await attRes.json();
      } catch {
        console.error(`[gmail-sync] processAttachments: non-JSON response for "${att.filename}"`);
        continue;
      }

      if (typeof attDataRaw !== 'object' || attDataRaw === null || Array.isArray(attDataRaw)) continue;
      const attData = attDataRaw as Record<string, unknown>;

      // Step 2 — Decode base64url → Uint8Array.
      const base64url = typeof attData.data === 'string' ? attData.data : '';
      if (!base64url) {
        console.warn(`[gmail-sync] processAttachments: empty data for "${att.filename}"`);
        continue;
      }
      const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // Step 3 — Upload to Storage.
      // Path: {emailMessageId}/{gmailAttachmentId}/{filename}
      const storagePath = `${emailMessageId}/${att.attachmentId}/${att.filename}`;

      const { error: uploadErr } = await adminClient.storage
        .from('email-attachments')
        .upload(storagePath, bytes, {
          contentType: att.mimeType,
          upsert: true,
        });

      if (uploadErr) {
        console.error(
          `[gmail-sync] processAttachments: Storage upload failed for "${att.filename}":`,
          uploadErr.message,
        );
        continue;
      }

      // Step 4 — Upsert metadata row in email_attachments.
      const { error: dbErr } = await adminClient.from('email_attachments').upsert({
        email_message_id:    emailMessageId,
        gmail_attachment_id: att.attachmentId,
        filename:            att.filename,
        mime_type:           att.mimeType,
        size_bytes:          att.sizeBytes,
        storage_path:        storagePath,
      }, { onConflict: 'email_message_id,gmail_attachment_id' });

      if (dbErr) {
        console.error(
          `[gmail-sync] processAttachments: email_attachments upsert failed for "${att.filename}":`,
          dbErr.message,
        );
      }
    } catch (err) {
      console.error(
        `[gmail-sync] processAttachments: unexpected error for "${att.filename}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
