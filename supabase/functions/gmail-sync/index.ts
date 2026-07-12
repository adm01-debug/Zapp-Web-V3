import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const supabase = createClient(
      (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!,
      (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const body  = await req.json();
    const { action, accountId } = body;

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
      const { labelIds = ['INBOX'], q = '', pageToken } = body;
      const maxResults = Math.min(Math.max(1, Number(body.maxResults) || 20), 50);

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
      const listData = await listRes.json();
      if (listData.error) {
        console.error('[gmail-sync] list threads error', listData.error);
        return json({ error: 'Failed to list Gmail threads' }, 400);
      }

      // Fetch thread details in bounded batches of 5 to avoid Gmail API rate limits
      const threadResults = await batchSettled(
        listData.threads ?? [],
        async (t: { id: string }) => {
          const tRes = await fetch(`${GMAIL_API}/threads/${t.id}?format=metadata&metadataHeaders=Subject,From,Date`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
          });
          const tData = await tRes.json();
          if (tData.error) return null;

          const firstMsg = tData.messages?.[0];
          const lastMsg  = tData.messages?.[tData.messages.length - 1];
          const hdrMap   = headerMap(firstMsg?.payload?.headers ?? []);
          const subject  = hdrMap['subject'] ?? '(sem assunto)';
          const fromH    = hdrMap['from'] ?? '';
          const dateH    = lastMsg?.internalDate ? new Date(Number(lastMsg.internalDate)).toISOString() : null;
          const tLabels  = firstMsg?.labelIds ?? [];
          const snippet  = lastMsg?.snippet ?? '';
          const unread   = tLabels.includes('UNREAD') ? 1 : 0;

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
              message_count:      tData.messages?.length ?? 0,
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
      const { labelIds = ['INBOX'] } = body;
      const maxResults = Math.min(Math.max(1, Number(body.maxResults) || 50), 100);
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

      const listData = await listRes.json().catch(() => ({}));

      if (listData.error) {
        console.error('[gmail-sync] syncFull list error', listData.error);
        return json({ error: 'Failed to list Gmail messages' }, 502);
      }

      const messages: Array<{ id: string }> = listData.messages ?? [];
      // Cap concurrency at 5 to avoid Gmail API rate limits on full sync
      const settled = await batchSettled(
        messages,
        (m: { id: string }) => fetchAndPersistMessage(supabase, token, accountId, m.id),
        5,
      );
      const syncedCount = settled.filter(r => r.status === 'fulfilled').length;
      const failedCount = settled.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) console.error(`[gmail-sync] syncFull: ${failedCount} messages failed to persist`);

      return json({ synced: syncedCount, failed: failedCount, nextPageToken: listData.nextPageToken });
    }

    // ── syncLabels — sincroniza labels do Gmail ────────────────────────
    if (action === 'syncLabels') {
      const lblRes = await fetch(`${GMAIL_API}/labels`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const lblData = await lblRes.json();

      for (const lbl of lblData.labels ?? []) {
        await supabase.from('gmail_labels').upsert({
          account_id: accountId,
          label_id:   lbl.id,
          name:       lbl.name,
          type:       lbl.type?.toLowerCase(),
        }, { onConflict: 'account_id,label_id' });
      }

      return json({ synced: lblData.labels?.length ?? 0 });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error('[gmail-sync]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

/** Run `fn` over `items` with at most `concurrency` items in flight at once. */
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

function headerMap(headers: Array<{name: string; value: string}>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) out[h.name.toLowerCase()] = h.value;
  return out;
}

function extractEmails(from: string): string[] {
  const match = from.match(/<(.+?)>/);
  return [match?.[1] ?? from].filter(Boolean);
}

async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: acc } = await supabase
    .from('gmail_accounts')
    .select('access_token, token_expiry, refresh_token')
    .eq('id', accountId)
    .single();

  if (!acc) return null;

  const expiry = new Date(acc.token_expiry).getTime();
  if (Date.now() < expiry - 5 * 60 * 1000) return acc.access_token;

  // Refresh
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: acc.refresh_token,
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type:    'refresh_token',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const tokens = await tokenRes.json();
  if (tokens.error) { await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId); return null; }

  const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await supabase.from('gmail_accounts').update({ access_token: tokens.access_token, token_expiry: newExpiry }).eq('id', accountId);
  return tokens.access_token;
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
  if (msg.error) return;

  const hdrs     = headerMap(msg.payload?.headers ?? []);
  const threadId = msg.threadId;
  const subject  = hdrs['subject'] ?? '(sem assunto)';
  const fromH    = hdrs['from'] ?? '';
  const toH      = (hdrs['to'] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const ccH      = (hdrs['cc'] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const date     = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
  const snippet  = msg.snippet ?? '';
  const labelIds = msg.labelIds ?? [];
  const isRead   = !labelIds.includes('UNREAD');
  const isSent   = labelIds.includes('SENT');

  const fmatch   = fromH.match(/^(.*?)\s*<(.+?)>$/) ?? [];
  const fromName = fmatch[1]?.trim() ?? fromH;
  const fromEmail= fmatch[2] ?? fromH;

  let bodyPlain = '', bodyHtml = '';
  const walk = (parts: unknown[]): void => {
    for (const p of parts ?? []) {
      const part = p as Record<string, unknown>;
      const data = ((part.body as Record<string,string>)?.data ?? '').replace(/-/g, '+').replace(/_/g, '/');
      if (part.mimeType === 'text/plain') bodyPlain = atob(data);
      else if (part.mimeType === 'text/html') bodyHtml = atob(data);
      if (Array.isArray(part.parts)) walk(part.parts as unknown[]);
    }
  };
  if (msg.payload?.parts) walk(msg.payload.parts);
  else if (msg.payload?.body?.data) {
    const data = msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
    if (msg.payload.mimeType === 'text/html') bodyHtml = atob(data);
    else bodyPlain = atob(data);
  }

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
    has_attachments: !!(msg.payload?.parts ?? []).some((p: Record<string, unknown>) => p.filename),
    internal_date:   date,
  }, { onConflict: 'account_id,message_id' });
}
