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

    const body     = await req.json();
    const { action, accountId } = body;

    // Verify the authenticated user owns this gmail_accounts row before proceeding.
    const { data: accountCheck } = await supabase
      .from('gmail_accounts')
      .select('id')
      .eq('id', accountId)
      .eq('user_id', authed.user.id)
      .maybeSingle();
    if (!accountCheck) return json({ error: 'Conta não encontrada ou acesso negado' }, 403);

    const token = await getValidToken(supabase, accountId);
    if (!token) return json({ error: 'Token inválido' }, 401);

    // ── send — Enviar email ────────────────────────────────────────────
    if (!action || action === 'send') {
      const { to, cc = [], bcc = [], subject, bodyHtml, bodyPlain = '', threadId, attachments = [] } = body;
      if (!to?.length || !subject) return json({ error: 'to e subject obrigatórios' }, 400);

      const rawEmail = buildMime({ to, cc, bcc, subject, bodyHtml, bodyPlain, attachments, threadId });

      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: rawEmail, ...(threadId ? { threadId } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });

      const sendData = await sendRes.json();
      if (sendData.error) {
        console.error('[gmail-send] send message error', sendData.error);
        return json({ error: 'Failed to send message' }, 400);
      }

      // Persiste mensagem enviada no Supabase
      if (sendData.id && threadId) {
        const { data: thread } = await supabase
          .from('gmail_threads').select('id').eq('account_id', accountId).eq('thread_id', threadId).single();
        if (thread) {
          await supabase.from('gmail_messages').upsert({
            thread_id_ref: thread.id,
            account_id:    accountId,
            message_id:    sendData.id,
            from_email:    '', // preenchido pelo sync
            to_emails:     to,
            cc_emails:     cc,
            bcc_emails:    bcc,
            subject,
            body_html:     bodyHtml,
            body_plain:    bodyPlain,
            label_ids:     ['SENT'],
            is_read:       true,
            is_sent:       true,
            internal_date: new Date().toISOString(),
          }, { onConflict: 'account_id,message_id' });
        }
      }

      return json({ messageId: sendData.id, threadId: sendData.threadId });
    }

    // ── markRead — Marcar lido/não-lido ───────────────────────────────
    if (action === 'markRead') {
      const { messageIds, read } = body;
      if (!messageIds?.length) return json({ error: 'messageIds obrigatório' }, 400);

      const failures: string[] = [];
      for (const msgId of messageIds) {
        const gmailRes = await fetch(`${GMAIL_API}/messages/${msgId}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(read
            ? { removeLabelIds: ['UNREAD'] }
            : { addLabelIds: ['UNREAD'] }
          ),
          signal: AbortSignal.timeout(10_000),
        });
        if (!gmailRes.ok) { failures.push(msgId); continue; }
        await supabase.from('gmail_messages').update({ is_read: read }).eq('message_id', msgId).eq('account_id', accountId);
      }

      return json({ success: true, ...(failures.length ? { failed: failures } : {}) });
    }

    // ── trash — Mover para lixeira ─────────────────────────────────────
    if (action === 'trash') {
      const { messageId } = body;
      if (!messageId) return json({ error: 'messageId obrigatório' }, 400);

      const trashRes = await fetch(`${GMAIL_API}/messages/${messageId}/trash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!trashRes.ok) {
        console.error('[gmail-send] trash failed', await trashRes.text().catch(() => ''));
        return json({ error: 'Failed to trash message in Gmail' }, 502);
      }

      await supabase.from('gmail_messages').delete().eq('message_id', messageId).eq('account_id', accountId);
      return json({ success: true });
    }

    // ── modifyLabels — Adicionar/remover labels ───────────────────────
    if (action === 'modifyLabels') {
      const { messageId, addLabelIds = [], removeLabelIds = [] } = body;
      if (!messageId) return json({ error: 'messageId obrigatório' }, 400);

      const res = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await res.json();
      if (data.error) {
        console.error('[gmail-send] modify labels error', data.error);
        return json({ error: 'Failed to modify labels' }, 400);
      }
      return json({ labelIds: data.labelIds });
    }

    // ── saveDraft — Salvar rascunho ───────────────────────────────────
    if (action === 'saveDraft') {
      const { to = [], cc = [], subject = '', bodyHtml = '', threadId, draftId } = body;

      const raw = buildMime({ to, cc, bcc: [], subject, bodyHtml, bodyPlain: '', attachments: [], threadId });
      const draftBody = JSON.stringify({ message: { raw, ...(threadId ? { threadId } : {}) } });

      let res;
      if (draftId) {
        res = await fetch(`${GMAIL_API}/drafts/${draftId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: draftBody,
          signal: AbortSignal.timeout(15_000),
        });
      } else {
        res = await fetch(`${GMAIL_API}/drafts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: draftBody,
          signal: AbortSignal.timeout(15_000),
        });
      }

      const data = await res.json();
      if (data.error) {
        console.error('[gmail-send] save draft error', data.error);
        return json({ error: 'Failed to save draft' }, 400);
      }
      return json({ draftId: data.id });
    }

    // ── deleteDraft — Excluir rascunho ────────────────────────────────
    if (action === 'deleteDraft') {
      const { draftId } = body;
      if (!draftId) return json({ error: 'draftId obrigatório' }, 400);

      await fetch(`${GMAIL_API}/drafts/${draftId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });

      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);

  } catch (err) {
    console.error('[gmail-send]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Token helper ───────────────────────────────────────────────────────

async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: acc } = await supabase
    .from('gmail_accounts').select('access_token, token_expiry, refresh_token').eq('id', accountId).single();
  if (!acc) return null;

  const expiry = new Date(acc.token_expiry).getTime();
  if (Date.now() < expiry - 5 * 60 * 1000) return acc.access_token;

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

// ── MIME builder ───────────────────────────────────────────────────────

function buildMime(opts: {
  to: string[]; cc: string[]; bcc: string[];
  subject: string; bodyHtml: string; bodyPlain: string;
  attachments: Array<{name: string; mimeType: string; data: string}>;
  threadId?: string;
}): string {
  const boundary = `boundary_${crypto.randomUUID().replace(/-/g, '')}`;

  const headers = [
    `To: ${opts.to.join(', ')}`,
    ...(opts.cc.length ? [`Cc: ${opts.cc.join(', ')}`] : []),
    ...(opts.bcc.length ? [`Bcc: ${opts.bcc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ].join('\r\n');

  const plainPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(opts.bodyPlain || opts.bodyHtml.replace(/<[^>]*>/g, '')))),
    '',
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(opts.bodyHtml))),
    '',
  ].join('\r\n');

  const attachParts = opts.attachments.map(att => {
    // CWE-93: strip CR/LF, quotes, and backslashes to prevent MIME header injection.
    // String() coercion guards against non-string att.name crashing replace().
    const safeName = String(att.name ?? '').replace(/[\r\n"\\]/g, '');
    const safeMime = String(att.mimeType ?? 'application/octet-stream').replace(/[\r\n"\\]/g, '') || 'application/octet-stream';
    return [
      `--${boundary}`,
      `Content-Type: ${safeMime}; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeName}"`,
      '',
      att.data,
      '',
    ].join('\r\n');
  }).join('');

  const raw = `${headers}\r\n${plainPart}${htmlPart}${attachParts}--${boundary}--`;
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
