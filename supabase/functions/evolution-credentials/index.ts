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
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';

const INSTANCE = 'wpp2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // [C-2 2026-07-12] Least-privilege gate: a Evolution `api_key` é a chave GLOBAL de
  // admin da instância (cria/deleta instâncias, lê todas as conversas, envia para
  // qualquer número). Antes qualquer JWT autenticado (inclusive agente de baixo
  // privilégio) recebia a key no header X-Evolution-Key — bastava abrir o DevTools.
  // Agora exige role admin OU supervisor via RPC is_admin_or_supervisor; qualquer
  // outro papel recebe 403 ANTES de tocarmos no Vault.
  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  const rl = checkRateLimit(`evolution-credentials:${authed.user.id}`, 20, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  // service_role → RPC SECURITY DEFINER (única ponte segura até o vault)
  const supabaseAdmin = createZappAdminClient();

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