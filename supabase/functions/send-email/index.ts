import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { SendEmailV1Schema } from '../_shared/contract-schemas.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
/**
 * send-email — Endpoint unificado legado (mantido para compatibilidade)
 *
 * DEPRECADO: Redireciona para gmail-send com action=send.
 * Use gmail-send diretamente em novos desenvolvimentos.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`send-email:${authed.user.id}`, 20, 60_000);
    if (!rl.allowed) return json({ error: 'Rate limit exceeded. Tente novamente em instantes.' }, 429);

    // Contrato send-email@v1: accountId OU (to+subject+html). 422 unificado.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = null;
    }
    const parsed = parseOrReject('send-email', { v1: SendEmailV1Schema }, req, raw, { extraHeaders: corsHeaders });
    if (!parsed.ok) return parsed.response;

    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      return json({ error: 'Invalid parsed data' }, 400);
    }
    const body = parsed.data as Record<string, unknown>;
    const accountId = typeof body.accountId === 'string' && body.accountId.length > 0 ? body.accountId : null;

    // Verifica se há accountId para usar gmail-send
    if (accountId) {
      // Delega para gmail-send usando o token do usuário (não service role),
      // para que gmail-send possa verificar a propriedade da conta Gmail.
      const supabaseUrlSelfHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
      const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
      const supabaseUrl = (typeof supabaseUrlSelfHosted === 'string' && supabaseUrlSelfHosted.length > 0)
        ? supabaseUrlSelfHosted
        : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

      if (!supabaseUrl) {
        return json({ error: 'Supabase URL not configured' }, 503);
      }

      const authHeader = req.headers.get('Authorization');
      if (!authHeader || typeof authHeader !== 'string' || authHeader.length === 0) {
        return json({ error: 'Missing authorization header' }, 401);
      }

      const actionStr = typeof body.action === 'string' ? body.action : 'send';
      let resData: unknown;
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/gmail-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ ...body, action: actionStr }),
          signal: AbortSignal.timeout(15_000),
        });

        resData = await res.json();
      } catch (fetchErr) {
        console.error('[send-email] gmail-send fetch error:', fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        return json({ error: 'Failed to delegate to gmail-send' }, 502);
      }

      if (!resData || typeof resData !== 'object') {
        return json({ error: 'Invalid response from gmail-send' }, 502);
      }
      return json(resData, 200);
    }

    // Fallback: Resend / SMTP genérico (para emails transacionais sem conta Gmail)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey || typeof resendKey !== 'string' || resendKey.length === 0) {
      return json({ error: 'Nenhum provedor de email configurado. Forneça accountId para usar Gmail ou configure RESEND_API_KEY.' }, 503);
    }

    const toVal = body.to;
    const subjectVal = typeof body.subject === 'string' ? body.subject : '';
    const htmlVal = typeof body.html === 'string' ? body.html : '';

    if (!toVal || !subjectVal || !htmlVal) {
      return json({ error: 'Missing required fields: to, subject, html' }, 400);
    }

    const toArray = Array.isArray(toVal) ? toVal : (typeof toVal === 'string' ? [toVal] : []);
    if (toArray.length === 0 || !toArray.every(t => typeof t === 'string' && t.length > 0)) {
      return json({ error: 'Invalid to field' }, 400);
    }

    const from = 'noreply@zappweb.app';

    let resendData: unknown;
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({ from, to: toArray, subject: subjectVal, html: htmlVal }),
        signal: AbortSignal.timeout(15_000),
      });

      resendData = await resendRes.json();
      if (!resendData || typeof resendData !== 'object') {
        return json({ error: 'Invalid Resend response' }, 502);
      }

      if (!resendRes.ok) {
        const resendDataObj = resendData as Record<string, unknown>;
        const errorMsg = typeof resendDataObj.message === 'string' ? resendDataObj.message : 'Erro no Resend';
        return json({ error: errorMsg }, resendRes.status);
      }

      const resendDataObj = resendData as Record<string, unknown>;
      const messageId = typeof resendDataObj.id === 'string' ? resendDataObj.id : null;
      if (!messageId) {
        return json({ error: 'No message ID returned from Resend' }, 502);
      }

      return json({ messageId, provider: 'resend' }, 200);
    } catch (resendErr) {
      console.error('[send-email] Resend error:', resendErr instanceof Error ? resendErr.message : String(resendErr));
      return json({ error: 'Failed to send email via Resend' }, 502);
    }

  } catch (err) {
    console.error('[send-email]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});
