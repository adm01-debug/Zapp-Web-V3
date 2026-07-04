import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSecret } from '../_shared/mod.ts';
import { requireUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC') ?? 'projects/your-project/topics/gmail';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
        if (!receivedToken || receivedToken !== expectedToken) {
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

      const histRes = await fetch(`${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const histData = await histRes.json();

      const messages = histData.history?.flatMap((h: { messagesAdded?: { message: { id: string } }[] }) =>
        h.messagesAdded?.map(m => m.message.id) ?? []
      ) ?? [];

      const processed: string[] = [];
      for (const msgId of messages.slice(0, 10)) {
        const msgRes = await fetch(`${GMAIL_API}/messages/${msgId}?format=full`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const msg = await msgRes.json();
        if (!msgRes.ok) continue;

        const headers = msg.payload?.headers ?? [];
        const getHeader = (name: string) => headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

        const subject = getHeader('Subject');
        const from = getHeader('From');
        const to = getHeader('To');
        const date = getHeader('Date');
        const messageId = getHeader('Message-Id');

        const getBody = (payload: { mimeType: string; body?: { data?: string }; parts?: unknown[] }): string => {
          if (payload.mimeType === 'text/plain' && payload.body?.data) return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          if (payload.parts) return (payload.parts as { mimeType: string; body?: { data?: string }; parts?: unknown[] }[]).map(p => getBody(p)).join('');
          return '';
        };

        const body_text = getBody(msg.payload);

        const { error: insertErr } = await supabase.from('email_messages').upsert({
          account_id: account.id, message_id: msgId, thread_id: msg.threadId,
          external_message_id: messageId, subject, from_address: from,
          to_address: to, received_at: date ? new Date(date).toISOString() : null,
          body_text: body_text.slice(0, 5000), snippet: msg.snippet,
          labels: msg.labelIds ?? [], is_read: !msg.labelIds?.includes('UNREAD'),
        }, { onConflict: 'account_id,message_id' });

        if (!insertErr) processed.push(msgId);
      }

      await supabase.from('email_watch_history').upsert({
        account_id: account.id, history_id: historyId,
        status: 'active',
      }, { onConflict: 'account_id' });

      return json({ ok: true, processed: processed.length, messages: messages.length });
    }

    // ── GET: status endpoint ────────────────────────────────────────
    if (req.method === 'GET') {
      const tokenConfigured = !!(await getSecret('gmail_pubsub_token') ?? Deno.env.get('GMAIL_PUBSUB_TOKEN'));
      return json({ service: 'gmail-webhook', status: 'healthy', token_configured: tokenConfigured });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[gmail-webhook]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

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

  // Fetch and persist all new messages in parallel; log any individual failures.
  const results = await Promise.allSettled(
    addedMessages.slice(0, 20).map(msgId => fetchAndPersistMessage(supabase, token, accountId, msgId))
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[gmail-webhook] processHistory message failed:', r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
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
  if (msg.error) return;

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

  // Upsert gmail_threads
  const { data: thread } = await supabase.from('gmail_threads').upsert({
    account_id:       accountId,
    thread_id:        threadId,
    subject,
    snippet,
    label_ids:        labelIds,
    last_message_at:  date,
    unread_count:     isRead ? 0 : 1,
  }, { onConflict: 'account_id,thread_id' }).select('id').single();

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
}
