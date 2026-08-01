import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * email-track-link — Rastreio de cliques em links de emails
 *
 * GET /functions/v1/email-track-link?l={link_id}
 *
 * Registra o clique e redireciona (302) para a URL original.
 * Detecta: IP, User-Agent, dispositivo, navegador, OS, país.
 */

function parseUA(ua: string): { device: string; browser: string; os: string } {
  let device = 'desktop';
  if (/mobile|android|iphone/i.test(ua)) device = 'mobile';
  else if (/ipad|tablet/i.test(ua)) device = 'tablet';
  if (/bot|crawl|spider|preview/i.test(ua)) device = 'bot';

  let browser = 'unknown';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';

  let os = 'unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';

  return { device, browser, os };
}

serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const linkId = url.searchParams.get('l') ?? url.searchParams.get('link_id');

  if (!linkId) {
    return new Response('Missing link_id', { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const ua      = req.headers.get('user-agent') ?? '';
    const ip      = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                    ?? req.headers.get('cf-connecting-ip') ?? null;
    const country = req.headers.get('cf-ipcountry') ?? null;
    const parsed  = parseUA(ua);

    // Registrar clique via RPC
    const { data, error } = await supabase.rpc('rpc_email_register_click', {
      p_link_id:     linkId,
      p_ip:          ip,
      p_user_agent:  ua.substring(0, 500),
      p_country:     country,
      p_city:        null,
      p_device_type: parsed.device,
      p_browser:     parsed.browser,
      p_os:          parsed.os,
    });

    if (error || data?.error) {
      // Se link não existe, redirecionar para fallback
      console.error('[email-track-link] Error:', error?.message ?? data?.error);
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://pronto-talk-suite.lovable.app' },
      });
    }

    // Redirecionar 302 para URL original
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.original_url,
        'Cache-Control': 'no-store, no-cache',
      },
    });

  } catch (err) {
    console.error('[email-track-link] Fatal:', err);
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://pronto-talk-suite.lovable.app' },
    });
  }
});
