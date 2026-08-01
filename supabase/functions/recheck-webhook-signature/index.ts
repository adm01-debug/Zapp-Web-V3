// Recomputa HMAC-SHA256 do payload de um evolution_webhook_events e devolve
// diagnóstico (válido / inválido + motivo). Não grava nada.
//
// Auth: exige Bearer JWT de usuário com role 'admin' (Lovable Cloud).
// Lê o evento direto do FATOR X via service role do projeto externo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecheckRequest {
  event_id: string;
  /** Assinatura observada no recebimento (opcional, vem do payload se presente). */
  observed_signature?: string;
}

interface RecheckResult {
  event_id: string;
  instance_name: string | null;
  event_type: string | null;
  created_at: string | null;
  secret_configured: boolean;
  observed_signature: string | null;
  computed_signature: string | null;
  signature_valid: boolean | null;
  reason: string;
}

async function computeHmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 1. AuthN — Bearer JWT do usuário logado
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;

    // 2. AuthZ — apenas admin (via has_role no Lovable Cloud)
    const { data: isAdmin, error: roleErr } = await supabase.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Body
    let body: RecheckRequest;
    try {
      body = (await req.json()) as RecheckRequest;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body?.event_id || typeof body.event_id !== 'string') {
      return new Response(JSON.stringify({ error: 'event_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Secret + FATOR X creds
    const secret =
      Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || Deno.env.get('WEBHOOK_SECRET') || '';
    const extUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const extKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');
    if (!extUrl || !extKey) {
      return new Response(JSON.stringify({ error: 'External DB not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ext = createClient(extUrl, extKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 5. Buscar evento
    const { data: ev, error: evErr } = await ext
      .from('evolution_webhook_events')
      .select('id,event_type,instance_name,created_at,payload')
      .eq('id', body.event_id)
      .maybeSingle();
    if (evErr || !ev) {
      return new Response(
        JSON.stringify({ error: evErr?.message ?? 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result: RecheckResult = {
      event_id: ev.id as string,
      instance_name: (ev.instance_name as string) ?? null,
      event_type: (ev.event_type as string) ?? null,
      created_at: (ev.created_at as string) ?? null,
      secret_configured: secret.length > 0,
      observed_signature: null,
      computed_signature: null,
      signature_valid: null,
      reason: '',
    };

    if (!secret) {
      result.reason =
        'WEBHOOK_SECRET não configurado no backend — impossível recomputar a assinatura.';
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Extrair assinatura observada do payload (se a Evolution salvou nos headers)
    const payload = ev.payload as Record<string, unknown> | null;
    const headersField = (payload?._headers ?? payload?.headers ?? null) as
      | Record<string, string>
      | null;
    let observed = body.observed_signature ?? null;
    if (!observed && headersField) {
      const lower: Record<string, string> = {};
      for (const [k, v] of Object.entries(headersField)) lower[k.toLowerCase()] = String(v);
      observed =
        lower['x-hub-signature-256'] ??
        lower['x-signature'] ??
        lower['x-webhook-signature'] ??
        lower['x-evolution-signature'] ??
        null;
    }
    result.observed_signature = observed;

    // 7. Recomputar — usamos JSON.stringify do payload armazenado.
    // Limitação conhecida: o webhook original assina o RAW BODY, não o JSON re-serializado.
    // Diferenças de espaçamento/ordenação podem invalidar a assinatura mesmo com o secret correto.
    const raw = JSON.stringify(payload ?? {});
    const computed = await computeHmac(raw, secret);
    result.computed_signature = computed;

    if (!observed) {
      result.signature_valid = null;
      result.reason =
        'Evento não tem assinatura observada armazenada — não é possível comparar. ' +
        'A assinatura recomputada está disponível no campo `computed_signature` para inspeção manual.';
    } else {
      const norm = observed.toLowerCase().replace(/^sha256=/, '');
      const ok = timingSafeEqual(norm, computed);
      result.signature_valid = ok;
      result.reason = ok
        ? 'Assinatura confere com o WEBHOOK_SECRET atual.'
        : 'Assinatura NÃO confere. Causas prováveis: (a) secret rotacionado após o recebimento, ' +
          '(b) JSON re-serializado difere do raw body original, (c) replay/adulteração do payload.';
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
