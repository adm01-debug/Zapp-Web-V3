import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

      // ── registerWatch — registra Pub/Sub watch para uma conta ─────
      if (action === 'registerWatch') {
        const { accountId } = body;
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
        });

        const watchData = await watchRes.json();
        if (watchData.error) return json({ error: watchData.error.message }, 400);

        // Salva expiration e historyId na conta
        await supabase.from('gmail_accounts').update({
          watch_expiry: new Date(Number(watchData.expiration)).toISOString(),
          watch_resource: watchData.historyId,
          history_id: watchData.historyId,
        }).eq('id', accountId);

        return json({ expiration: new Date(Number(watchData.expiration)).toISOString(), historyId: watchData.historyId });
      }

      // ── Pub/Sub push notification (sem action = webhook do Google) ──
      if (!action && body.message) {
        const pubsubData = JSON.parse(atob(body.message.data ?? ''));
        const { emailAddress, historyId } = pubsubData;

        if (!emailAddress) return json({ ok: true });

        // Encontra conta pelo email
        const { data: account } = await supabase
          .from('gmail_accounts')
          .select('id, history_id, access_token, token_expiry, refresh_token')
          .eq('email', emailAddress)
          .eq('is_active', true)
          .single();

        if (!account) return json({ ok: true });

        // Refresh token se necessário
        const token = await ensureFreshToken(supabase, account);
        if (!token) return json({ ok: true });

        // Busca history desde último historyId
        const startHistoryId = account.history_id ?? historyId;
        await processHistory(supabase, token, account.id, startHistoryId);

        // Atualiza historyId
        await supabase.from('gmail_accounts').update({ history_id: String(historyId) }).eq('id', account.id);

        return json({ ok: true });
      }
    }

    return json({ error: 'Método não suportado' }, 405);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gmail-webhook]', msg);
    return json({ error: msg }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: acc } = await supabase
    .from('gmail_accounts')
    .select('access_token, token_expiry, refresh_token')
    .eq('id', accountId)
    .single();

  if (!acc) return null;
  return await ensureFreshToken(supabase, { id: accountId, ...acc });
}

async function ensureFreshToken(
  supabase: ReturnType<typeof createClient>,
  account: { id: string; access_token: string; token_expiry: string; refresh_token: string }
): Promise<string | null> {
  const expiry = new Date(account.token_expiry).getTime();
  const now    = Date.now();

  // Token válido por mais de 5 min
  if (expiry - now > 5 * 60 * 1000) return account.access_token;

  // Refresh
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: account.refresh_token,
      client_id:     Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      grant_type:    'refresh_token',
    }),
  });

  const tokens = await tokenRes.json();
  if (tokens.error) {
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', account.id);
    return null;
  }

  const newExpiry = new Date(now + (tokens.expires_in ?? 3600) * 1000).toISOString();
  await supabase.from('gmail_accounts').update({
    access_token: tokens.access_token,
    token_expiry: newExpiry,
  }).eq('id', account.id);

  return tokens.access_token;
}

async function processHistory(
  supabase: ReturnType<typeof createClient>,
  token: string,
  accountId: string,
  startHistoryId: string
): Promise<void> {
  const histRes = await fetch(
    `${GMAIL_API}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const histData = await histRes.json();
  if (histData.error) return;

  const addedMessages: string[] = [];
  for (const record of histData.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      addedMessages.push(added.message.id);
    }
  }

  // Busca e persiste cada nova mensagem
  for (const msgId of addedMessages.slice(0, 20)) {
    await fetchAndPersistMessage(supabase, token, accountId, msgId);
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
