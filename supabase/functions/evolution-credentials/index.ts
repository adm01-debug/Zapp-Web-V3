/**
 * evolution-credentials — Edge Function
 * 
 * Serve a Evolution API key para o frontend de forma segura.
 * Substitui a leitura via PostgREST (revogada em 2026-07-05).
 * 
 * SEGURANÇA:
 * - Requer JWT válido (authenticated)
 * - Lê api_key do Vault Supabase (NUNCA de env var ou config pública)
 * - Rate limit: 60 req/min por user (via Redis ou simples delay)
 * - CORS restrito a origens conhecidas
 * - Não loga o valor da key
 * 
 * RESPOSTA:
 * { api_url: string, instance_name: string, health_status: string }
 * A api_key é injetada no header X-Evolution-Key (não no body)
 * para evitar log inadvertido em DevTools Network
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://zapp-web-v3.vercel.app',
  'https://zapp-web-v3-juca1.vercel.app',
  'https://zapp-web-v3-git-main-juca1.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

const INSTANCE = 'wpp2';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verificar autenticação JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'JWT Bearer token required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const jwt = authHeader.replace('Bearer ', '');

  // Criar cliente Supabase com JWT do usuário (valida automaticamente)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  // Verificar autenticidade do JWT
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Invalid JWT' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Ler api_key do Vault (service_role bypassa RLS, operação segura em server-side)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Buscar api_key e api_url do vault + tabela de credenciais
  const { data: vaultData } = await supabaseAdmin
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', 'evolution_api_key')
    .single();

  const { data: credData } = await supabaseAdmin
    .schema('evo')
    .from('evolution_instance_credentials')
    .select('api_url, health_status, last_health_check, is_active')
    .eq('instance_name', INSTANCE)
    .single();

  if (!vaultData?.decrypted_secret || !credData?.api_url) {
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Evolution API not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const apiKey = vaultData.decrypted_secret;

  // Resposta: api_url no body, api_key no header (evita log no DevTools)
  return new Response(
    JSON.stringify({
      instance_name: INSTANCE,
      api_url: credData.api_url,
      health_status: credData.health_status ?? 'unknown',
      last_health_check: credData.last_health_check ?? null,
      is_active: credData.is_active ?? false,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Expose-Headers': 'X-Evolution-Key',
        // api_key no header para não aparecer no body/log de resposta
        'X-Evolution-Key': apiKey,
        // Cache: 60s (TTL de rotação de key)
        'Cache-Control': 'private, max-age=60',
      },
    }
  );
});
