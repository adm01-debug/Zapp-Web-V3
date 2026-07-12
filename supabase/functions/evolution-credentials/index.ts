/**
 * evolution-credentials — Edge Function (v2, 2026-07-06)
 *
 * Serve a Evolution API key para o frontend de forma segura.
 * Substitui a leitura via PostgREST (revogada em 2026-07-05).
 *
 * SEGURANÇA:
 * - Requer JWT válido (authenticated)
 * - Lê api_key do Vault Supabase (NUNCA de env var ou config pública)
 * - CORS restrito a origens conhecidas via _shared/cors.ts
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
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';

const INSTANCE = 'wpp2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verificar autenticação JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', message: 'JWT Bearer token required' }),
      { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
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
      { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  // [FIX C-2 2026-07-12] Restrict key exposure to privileged roles only.
  // This endpoint returns the Evolution master API key (AUTHENTICATION_API_KEY) which grants
  // full administrative control over all instances (create/delete, read all conversations,
  // send to any number). Any authenticated user could previously read it via DevTools.
  // Allowed: admin, dev, manager (needed for Zap Webb demo and development workflows).
  const ALLOWED_ROLES = ['admin', 'dev', 'manager'];
  const roleChecks = await Promise.all(
    ALLOWED_ROLES.map(role =>
      supabase.rpc('has_role', { _user_id: user.id, _role: role })
    )
  );
  const hasAccess = roleChecks.some(r => !r.error && r.data === true);
  if (!hasAccess) {
    console.warn(`[evolution-credentials] access denied for user=${user.id} (no privileged role)`);
    return new Response(
      JSON.stringify({ error: 'Forbidden', message: 'Admin, dev, or manager role required to access Evolution credentials' }),
      { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  // service_role → RPC SECURITY DEFINER (única ponte segura até o vault)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
    'fn_edge_get_evolution_credentials',
    { p_instance: INSTANCE },
  );

  const row = Array.isArray(rpcRows) ? rpcRows[0] : null;

  if (rpcError || !row?.api_key || !row?.api_url) {
    // Nunca logar a key; a mensagem do erro RPC é segura (permission/config).
    console.error(
      '[evolution-credentials] RPC fn_edge_get_evolution_credentials falhou:',
      rpcError?.message ?? 'linha vazia (instância inexistente ou vault sem secret)'
    );
    return new Response(
      JSON.stringify({ error: 'Configuration Error', message: 'Evolution API not configured' }),
      { status: 503, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  // Resposta: api_url no body, api_key no header (evita log no DevTools)
  return new Response(
    JSON.stringify({
      instance_name: row.instance_name ?? INSTANCE,
      api_url: row.api_url,
      health_status: row.health_status ?? 'unknown',
      last_health_check: row.last_health_check ?? null,
      is_active: row.is_active ?? false,
    }),
    {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Access-Control-Expose-Headers': 'X-Evolution-Key',
        // api_key no header para não aparecer no body/log de resposta
        'X-Evolution-Key': row.api_key,
        // Cache: 60s (TTL de rotação de key)
        'Cache-Control': 'private, max-age=60',
      },
    }
  );
});
