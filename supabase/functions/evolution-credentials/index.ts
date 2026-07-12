/**
 * evolution-credentials — Edge Function (v2, 2026-07-06)
 *
 * Serve a Evolution API key para o frontend de forma segura.
 * Substitui a leitura via PostgREST (revogada em 2026-07-05).
 *
 * SEGURANÇA:
 * - Requer JWT válido (authenticated)
 * - Lê api_key do Vault Supabase (NUNCA de env var ou config pública)
 * - CORS restrito a origens conhecidas
 * - Não loga o valor da key
 *
 * v2 — CAUSA RAIZ CORRIGIDA (auditoria integração full 2026-07-06):
 * As leituras `.schema('vault')` / `.schema('evo')` da v1 NUNCA funcionaram
 * em produção: PGRST_DB_SCHEMAS = public,zapp,storage,graphql_public,artes,
 * vendas,financeiro não expõe `vault` nem `evo` — e NÃO DEVE expor (vault no
 * PostgREST = superfície de ataque inaceitável; `evo` foi justamente fechado
 * no fix do storm 401). A key agora sai por UMA chamada à RPC SECURITY
 * DEFINER `public.fn_edge_get_evolution_credentials(p_instance)`:
 *   - EXECUTE revogado de PUBLIC/anon/authenticated; GRANT só service_role
 *   - guarda interna de claims (role=service_role) como defesa em profundidade
 *   - search_path='' fixado; vault continua invisível ao PostgREST
 *
 * RESPOSTA:
 * { api_url, instance_name, health_status, last_health_check, is_active }
 * A api_key é injetada no header X-Evolution-Key (não no body)
 * para evitar log inadvertido em DevTools Network.
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
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
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

  const jwtBearer = authHeader.replace('Bearer ', '');
  const jwt = typeof jwtBearer === 'string' && jwtBearer.length > 0 ? jwtBearer : '';
  if (!jwt) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Invalid JWT token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Criar cliente Supabase com JWT do usuário (valida automaticamente)
  const supabaseUrlRaw = Deno.env.get('SUPABASE_URL');
  const supabaseUrl = typeof supabaseUrlRaw === 'string' && supabaseUrlRaw.length > 0 ? supabaseUrlRaw : '';

  if (!supabaseUrl) {
    console.error('[evolution-credentials] SUPABASE_URL not configured');
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Server configuration error' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAnonKeyRaw = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseAnonKey = typeof supabaseAnonKeyRaw === 'string' && supabaseAnonKeyRaw.length > 0 ? supabaseAnonKeyRaw : '';

  if (!supabaseAnonKey) {
    console.error('[evolution-credentials] SUPABASE_ANON_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Server configuration error' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  // Verificar autenticidade do JWT
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData || typeof authData !== 'object' || !authData.user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'Invalid JWT' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // service_role → RPC SECURITY DEFINER (única ponte segura até o vault)
  const supabaseServiceRoleKeyRaw = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceRoleKey = typeof supabaseServiceRoleKeyRaw === 'string' && supabaseServiceRoleKeyRaw.length > 0 ? supabaseServiceRoleKeyRaw : '';

  if (!supabaseServiceRoleKey) {
    console.error('[evolution-credentials] SUPABASE_SERVICE_ROLE_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Server configuration error' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
  );

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
    'fn_edge_get_evolution_credentials',
    { p_instance: INSTANCE },
  );

  let row: Record<string, unknown> | null = null;

  if (Array.isArray(rpcRows) && rpcRows.length > 0) {
    const firstRow = rpcRows[0];
    if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
      row = firstRow as Record<string, unknown>;
    }
  }

  const apiKeyRaw = row && typeof row.api_key === 'string' ? row.api_key : '';
  const apiKey = apiKeyRaw.length > 0 ? apiKeyRaw : null;

  const apiUrlRaw = row && typeof row.api_url === 'string' ? row.api_url : '';
  const apiUrl = apiUrlRaw.length > 0 ? apiUrlRaw : null;

  if (rpcError || !apiKey || !apiUrl) {
    // Nunca logar a key; a mensagem do erro RPC é segura (permission/config).
    console.error(
      '[evolution-credentials] RPC fn_edge_get_evolution_credentials falhou:',
      rpcError && typeof rpcError === 'object' && 'message' in rpcError
        ? (rpcError as Record<string, unknown>).message
        : 'linha vazia (instância inexistente ou vault sem secret)'
    );
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Evolution API not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const instanceNameRaw = row && typeof row.instance_name === 'string' ? row.instance_name : '';
  const instanceName = instanceNameRaw.length > 0 ? instanceNameRaw : INSTANCE;

  const healthStatusRaw = row && typeof row.health_status === 'string' ? row.health_status : '';
  const healthStatus = healthStatusRaw.length > 0 ? healthStatusRaw : 'unknown';

  const lastHealthCheck = row && typeof row.last_health_check !== 'undefined' ? row.last_health_check : null;
  const isActive = row && typeof row.is_active === 'boolean' ? row.is_active : false;

  // Resposta: api_url no body, api_key no header (evita log no DevTools)
  return new Response(
    JSON.stringify({
      instance_name: instanceName,
      api_url: apiUrl,
      health_status: healthStatus,
      last_health_check: lastHealthCheck,
      is_active: isActive,
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
