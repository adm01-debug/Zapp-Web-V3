import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * email-track-pixel — Rastreio de abertura de email via pixel 1x1
 *
 * GET /functions/v1/email-track-pixel?t={tracking_id}
 *
 * Retorna um GIF transparente 1x1 e registra a abertura no banco.
 * Detecta: IP, User-Agent, dispositivo, navegador, OS.
 * Identifica self-opens quando IP do sender == IP do recipient.
 *
 * Headers anti-cache para garantir que cada abertura é registrada.
 */

// GIF transparente 1x1 (43 bytes)
const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b,
]);

const PIXEL_HEADERS = {
  'Content-Type': 'image/gif',
  'Content-Length': PIXEL_GIF.length.toString(),
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': '*',
};

function parseUserAgent(ua: string): { device: string; browser: string; os: string; isBot: boolean } {
  const uaLower = ua.toLowerCase();

  // Bot detection
  const isBot = /bot|crawl|spider|slurp|baidu|bing|google|yahoo|duckduck|yandex|facebook|twitter|linkedin|preview|proxy|fetch|curl|wget|python|java|php|ruby|go-http/i.test(ua);

  // Device
  let device = 'desktop';
  if (/mobile|android|iphone|ipod|windows phone|blackberry|opera mini|iemobile/i.test(ua)) device = 'mobile';
  else if (/ipad|tablet|kindle|silk|playbook/i.test(ua)) device = 'tablet';
  if (isBot) device = 'bot';

  // Browser
  let browser = 'unknown';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/opr|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'IE';
  else if (/thunderbird/i.test(ua)) browser = 'Thunderbird';
  else if (/outlook/i.test(ua)) browser = 'Outlook';
  else if (/apple mail/i.test(ua) || /applewebkit.*version/i.test(ua)) browser = 'Apple Mail';

  // OS
  let os = 'unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/chromeos/i.test(ua)) os = 'ChromeOS';

  return { device, browser, os, isBot };
}

serve(async (req) => {
  // Apenas GET
  if (req.method !== 'GET') {
    return new Response(PIXEL_GIF, { status: 200, headers: PIXEL_HEADERS });
  }

  const url = new URL(req.url);
  const trackingId = url.searchParams.get('t') ?? url.searchParams.get('tracking_id');

  // Se não tem tracking_id, retorna pixel sem tracking
  if (!trackingId) {
    return new Response(PIXEL_GIF, { status: 200, headers: PIXEL_HEADERS });
  }

  // Registrar abertura em background (não bloqueia a resposta do pixel)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const ua = req.headers.get('user-agent') ?? '';
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? req.headers.get('cf-connecting-ip')
      ?? null;
    const referer = req.headers.get('referer') ?? null;
    const country = req.headers.get('cf-ipcountry') ?? null;

    const parsed = parseUserAgent(ua);

    // Detectar self-open: comparar sender IP com opener IP
    const { data: trackedMsg } = await supabase
      .from('email_tracked_messages')
      .select('sender_email')
      .eq('tracking_id', trackingId)
      .single();

    // Chamar RPC
    await supabase.rpc('rpc_email_register_open', {
      p_tracking_id:  trackingId,
      p_ip:           ip,
      p_user_agent:   ua.substring(0, 500), // Limitar tamanho
      p_country:      country,
      p_city:         null, // Geo lookup não disponível no edge
      p_device_type:  parsed.device,
      p_browser:      parsed.browser,
      p_os:           parsed.os,
      p_is_self_open: false, // Client-side detection
    });

  } catch (err) {
    console.error('[email-track-pixel] Error:', err);
    // Não falha — retorna pixel mesmo com erro de tracking
  }

  // SEMPRE retorna o pixel (independente de erros)
  return new Response(PIXEL_GIF, { status: 200, headers: PIXEL_HEADERS });
});
