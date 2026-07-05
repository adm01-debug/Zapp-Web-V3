import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireUser } from '../_shared/auth.ts';

/**
 * send-email — Endpoint unificado legado (mantido para compatibilidade)
 *
 * DEPRECADO: Redireciona para gmail-send com action=send.
 * Use gmail-send diretamente em novos desenvolvimentos.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const body = await req.json().catch(() => ({}));

    // Verifica se há accountId para usar gmail-send
    if (body.accountId) {
      // Delega para gmail-send usando o token do usuário (não service role),
      // para que gmail-send possa verificar a propriedade da conta Gmail.
      const supabaseUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;

      const res = await fetch(`${supabaseUrl}/functions/v1/gmail-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('Authorization') || '',
        },
        body: JSON.stringify({ ...body, action: body.action ?? 'send' }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json();
      return json(data, res.status);
    }

    // Fallback: Resend / SMTP genérico (para emails transacionais sem conta Gmail)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      return json({ error: 'Nenhum provedor de email configurado. Forneça accountId para usar Gmail ou configure RESEND_API_KEY.' }, 503);
    }

    const { to, subject, html } = body;
    const from = 'noreply@zappweb.app';
    if (!to || !subject || !html) {
      return json({ error: 'to, subject e html são obrigatórios' }, 400);
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      return json({ error: resendData.message ?? 'Erro no Resend' }, resendRes.status);
    }

    return json({ messageId: resendData.id, provider: 'resend' });

  } catch (err) {
    console.error('[send-email]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error' }, 500);
  }
});
