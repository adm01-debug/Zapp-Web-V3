import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

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

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: 'Server configuration error' }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let bodyRaw: unknown;
    try {
      bodyRaw = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!bodyRaw || typeof bodyRaw !== 'object' || Array.isArray(bodyRaw)) {
      return json({ error: 'Invalid request body' }, 400);
    }

    const body = bodyRaw as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    const accountId = typeof body.accountId === 'string' ? body.accountId : '';

    if (!accountId) {
      return json({ error: 'accountId required' }, 400);
    }

    // Validate authed.user is object with id
    const authUser = authed.user;
    if (!authUser || typeof authUser !== 'object') {
      return json({ error: 'Unauthorized' }, 401);
    }
    const authUserObj = authUser as Record<string, unknown>;
    const userId = typeof authUserObj.id === 'string' ? authUserObj.id : '';
    if (!userId) {
      return json({ error: 'Unauthorized' }, 401);
    }

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
      const toVal = body.to;
      const toArray = Array.isArray(toVal) ? toVal : [];
      if (toArray.length === 0 || !toArray.every(t => typeof t === 'string' && t.length > 0)) {
        return json({ error: 'to array com emails válidos obrigatório' }, 400);
      }

      const subject = typeof body.subject === 'string' && body.subject.length > 0 ? body.subject : '';
      if (!subject) return json({ error: 'subject obrigatório' }, 400);

      const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml : '';
      const bodyPlain = typeof body.bodyPlain === 'string' ? body.bodyPlain : '';
      const threadId = typeof body.threadId === 'string' ? body.threadId : '';

      const ccVal = body.cc;
      const ccArray = Array.isArray(ccVal) ? ccVal : [];
      const ccValid = ccArray.every(c => typeof c === 'string');
      if (!ccValid) return json({ error: 'cc array items must be strings' }, 400);

      const bccVal = body.bcc;
      const bccArray = Array.isArray(bccVal) ? bccVal : [];
      const bccValid = bccArray.every(b => typeof b === 'string');
      if (!bccValid) return json({ error: 'bcc array items must be strings' }, 400);

      const attachmentsVal = body.attachments;
      const attachmentsArray = Array.isArray(attachmentsVal) ? attachmentsVal : [];

      const rawEmail = buildMime({ to: toArray, cc: ccArray, bcc: bccArray, subject, bodyHtml, bodyPlain, attachments: attachmentsArray, threadId });

      const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: rawEmail, ...(threadId ? { threadId } : {}) }),
        signal: AbortSignal.timeout(15_000),
      });

      let sendData: unknown;
      try {
        sendData = await sendRes.json();
      } catch {
        console.error('[gmail-send] failed to parse send response');
        return json({ error: 'Failed to send message' }, 400);
      }

      if (!sendData || typeof sendData !== 'object' || Array.isArray(sendData)) {
        return json({ error: 'Invalid send response' }, 400);
      }
      const sendDataObj = sendData as Record<string, unknown>;
      if (sendDataObj.error) {
        console.error('[gmail-send] send message error', sendDataObj.error);
        return json({ error: 'Failed to send message' }, 400);
      }

      const messageId = typeof sendDataObj.id === 'string' ? sendDataObj.id : '';
      const responseThreadId = typeof sendDataObj.threadId === 'string' ? sendDataObj.threadId : '';

      // Persiste mensagem enviada no Supabase
      if (messageId && threadId) {
        const { data: thread } = await supabase
          .from('gmail_threads').select('id').eq('account_id', accountId).eq('thread_id', threadId).single();
        if (thread && typeof thread === 'object' && !Array.isArray(thread)) {
          const threadObj = thread as Record<string, unknown>;
          const threadRefId = typeof threadObj.id === 'string' ? threadObj.id : '';
          if (threadRefId) {
            await supabase.from('gmail_messages').upsert({
              thread_id_ref: threadRefId,
              account_id:    accountId,
              message_id:    messageId,
              from_email:    '',
              to_emails:     toArray,
              cc_emails:     ccArray,
              bcc_emails:    bccArray,
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
      }

      return json({ messageId, threadId: responseThreadId });
    }

    // ── markRead — Marcar lido/não-lido ───────────────────────────────
    if (action === 'markRead') {
      const messageIdsVal = body.messageIds;
      if (!Array.isArray(messageIdsVal) || messageIdsVal.length === 0) {
        return json({ error: 'messageIds array obrigatório' }, 400);
      }

      const messageIds = messageIdsVal.filter(m => typeof m === 'string' && m.length > 0);
      if (messageIds.length === 0) {
        return json({ error: 'messageIds array deve conter strings não-vazias' }, 400);
      }

      const readVal = body.read;
      const read = typeof readVal === 'boolean' ? readVal : true;

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
      const messageId = typeof body.messageId === 'string' ? body.messageId : '';
      if (!messageId) return json({ error: 'messageId obrigatório' }, 400);

      const trashRes = await fetch(`${GMAIL_API}/messages/${messageId}/trash`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!trashRes.ok) {
        let errorMsg = '';
        try {
          errorMsg = await trashRes.text();
        } catch {
          errorMsg = '';
        }
        console.error('[gmail-send] trash failed', errorMsg);
        return json({ error: 'Failed to trash message in Gmail' }, 502);
      }

      await supabase.from('gmail_messages').delete().eq('message_id', messageId).eq('account_id', accountId);
      return json({ success: true });
    }

    // ── modifyLabels — Adicionar/remover labels ───────────────────────
    if (action === 'modifyLabels') {
      const messageId = typeof body.messageId === 'string' ? body.messageId : '';
      if (!messageId) return json({ error: 'messageId obrigatório' }, 400);

      const addLabelIdsVal = body.addLabelIds;
      const addLabelIds = Array.isArray(addLabelIdsVal) ? addLabelIdsVal : [];
      const addValid = addLabelIds.every(l => typeof l === 'string');
      if (!addValid) return json({ error: 'addLabelIds items must be strings' }, 400);

      const removeLabelIdsVal = body.removeLabelIds;
      const removeLabelIds = Array.isArray(removeLabelIdsVal) ? removeLabelIdsVal : [];
      const removeValid = removeLabelIds.every(l => typeof l === 'string');
      if (!removeValid) return json({ error: 'removeLabelIds items must be strings' }, 400);

      const res = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ addLabelIds, removeLabelIds }),
        signal: AbortSignal.timeout(10_000),
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        console.error('[gmail-send] failed to parse modify labels response');
        return json({ error: 'Failed to modify labels' }, 400);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ error: 'Invalid modify labels response' }, 400);
      }
      const dataObj = data as Record<string, unknown>;
      if (dataObj.error) {
        const errorMsg = typeof dataObj.error === 'string' ? dataObj.error : JSON.stringify(dataObj.error);
        console.error('[gmail-send] modify labels error', errorMsg);
        return json({ error: 'Failed to modify labels' }, 400);
      }
      const labelIds = Array.isArray(dataObj.labelIds) ? dataObj.labelIds : [];
      return json({ labelIds });
    }

    // ── saveDraft — Salvar rascunho ───────────────────────────────────
    if (action === 'saveDraft') {
      const toVal = body.to;
      const toArray = Array.isArray(toVal) ? toVal : [];
      const toValid = toArray.every(t => typeof t === 'string');
      if (!toValid) return json({ error: 'to array items must be strings' }, 400);

      const ccVal = body.cc;
      const ccArray = Array.isArray(ccVal) ? ccVal : [];
      const ccValid = ccArray.every(c => typeof c === 'string');
      if (!ccValid) return json({ error: 'cc array items must be strings' }, 400);

      const subject = typeof body.subject === 'string' ? body.subject : '';
      const bodyHtml = typeof body.bodyHtml === 'string' ? body.bodyHtml : '';
      const threadId = typeof body.threadId === 'string' ? body.threadId : '';
      const draftId = typeof body.draftId === 'string' ? body.draftId : '';

      const raw = buildMime({ to: toArray, cc: ccArray, bcc: [], subject, bodyHtml, bodyPlain: '', attachments: [], threadId });
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

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        console.error('[gmail-send] failed to parse save draft response');
        return json({ error: 'Failed to save draft' }, 400);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ error: 'Invalid save draft response' }, 400);
      }
      const dataObj = data as Record<string, unknown>;
      if (dataObj.error) {
        console.error('[gmail-send] save draft error', dataObj.error);
        return json({ error: 'Failed to save draft' }, 400);
      }

      const resultDraftId = typeof dataObj.id === 'string' ? dataObj.id : '';
      return json({ draftId: resultDraftId });
    }

    // ── deleteDraft — Excluir rascunho ────────────────────────────────
    if (action === 'deleteDraft') {
      const draftId = typeof body.draftId === 'string' ? body.draftId : '';
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[gmail-send]', errorMsg);
    return json({ error: 'Internal server error' }, 500);
  }
});

// ── Token helper ───────────────────────────────────────────────────────

async function getValidToken(supabase: ReturnType<typeof createClient>, accountId: string): Promise<string | null> {
  const { data: acc } = await supabase
    .from('gmail_accounts').select('access_token, token_expiry, refresh_token').eq('id', accountId).single();
  if (!acc || typeof acc !== 'object' || Array.isArray(acc)) return null;

  const accObj = acc as Record<string, unknown>;
  const accessToken = typeof accObj.access_token === 'string' ? accObj.access_token : '';
  const tokenExpiry = typeof accObj.token_expiry === 'string' ? accObj.token_expiry : '';
  const refreshToken = typeof accObj.refresh_token === 'string' ? accObj.refresh_token : '';

  if (!accessToken || !tokenExpiry || !refreshToken) return null;

  const expiry = new Date(tokenExpiry).getTime();
  if (Number.isFinite(expiry) && Date.now() < expiry - 5 * 60 * 1000) return accessToken;

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || typeof clientId !== 'string' || clientId.length === 0) {
    console.error('[gmail-send] GOOGLE_CLIENT_ID not configured');
    return null;
  }
  if (!clientSecret || typeof clientSecret !== 'string' || clientSecret.length === 0) {
    console.error('[gmail-send] GOOGLE_CLIENT_SECRET not configured');
    return null;
  }

  let tokenRes;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (fetchErr) {
    console.error('[gmail-send] token refresh fetch failed', fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
    return null;
  }

  let tokens: unknown;
  try {
    tokens = await tokenRes.json();
  } catch {
    console.error('[gmail-send] failed to parse token response');
    return null;
  }

  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return null;
  }

  const tokensObj = tokens as Record<string, unknown>;
  if (tokensObj.error) {
    const errorMsg = typeof tokensObj.error === 'string' ? tokensObj.error : JSON.stringify(tokensObj.error);
    console.error('[gmail-send] token refresh error:', errorMsg);
    await supabase.from('gmail_accounts').update({ is_active: false }).eq('id', accountId);
    return null;
  }

  const newAccessToken = typeof tokensObj.access_token === 'string' ? tokensObj.access_token : '';
  const expiresIn = typeof tokensObj.expires_in === 'number' ? tokensObj.expires_in : 3600;
  if (!newAccessToken) {
    console.error('[gmail-send] no access_token in refresh response');
    return null;
  }

  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();
  await supabase.from('gmail_accounts').update({ access_token: newAccessToken, token_expiry: newExpiry }).eq('id', accountId);
  return newAccessToken;
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
