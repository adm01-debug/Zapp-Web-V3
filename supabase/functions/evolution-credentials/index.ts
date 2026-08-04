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
import { parseOrReject } from '../_shared/contract-kit.ts';
import { EvolutionCredentialsV1Schema } from '../_shared/contract-schemas.ts';

const INSTANCE = 'wpp2';

/** UUID canônico (v1-v8) — validação simples do id em action 'delete'. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — CRUD de credenciais (actions 'save' | 'delete').
 *
 * A tabela física vive em evo.evolution_instance_credentials, que NÃO está no
 * PGRST_DB_SCHEMAS (fechada por segurança). Por isso a escrita NÃO usa
 * PostgREST direto (.schema('evo') seria 404/403) — passa por RPC SECURITY
 * DEFINER, mesmo padrão do GET (fn_edge_get_evolution_credentials).
 *
 * RPCs ASSUMIDAS (criadas pela migration 20260804150000 em zapp — o admin
 * client usa db.schema='zapp' — SECURITY DEFINER, EXECUTE só service_role,
 * search_path=''):
 *   - fn_edge_upsert_evolution_credentials(
 *       p_instance_name text, p_api_url text, p_api_key text,
 *       p_display_name text, p_department text, p_is_active boolean
 *     ) RETURNS jsonb  -- upsert ON CONFLICT (instance_name), retorna {"id": ...}
 *   - fn_edge_delete_evolution_credentials(p_id uuid) RETURNS boolean
 *
 * SEGURANÇA: nunca ecoa nem loga api_key; mesma role gate do GET
 * (admin/supervisor); rate limit próprio menor (10/60s).
 */
async function handleWrite(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // Body opcional/leniente: JSON inválido → {} e validação de action responde 400.
  const body: Record<string, unknown> = await req.json().catch(() => ({}));

  // Mesmo gate do GET: apenas admin/supervisor (403 antes de tocar no banco).
  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  const rl = checkRateLimit(`evolution-credentials-write:${authed.user.id}`, 10, 60_000);
  if (!rl.allowed) return json(429, { ok: false, error: 'Rate limit exceeded' });

  const action = body.action;
  const admin = createZappAdminClient();

  if (action === 'save') {
    const instance_name = typeof body.instance_name === 'string' ? body.instance_name.trim() : '';
    const api_url = typeof body.api_url === 'string' ? body.api_url.trim() : '';
    const api_key = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    const display_name = typeof body.display_name === 'string' ? body.display_name.trim() : null;
    const department = typeof body.department === 'string' ? body.department.trim() : null;
    const is_active = typeof body.is_active === 'boolean' ? body.is_active : true;

    if (!instance_name) return json(400, { ok: false, error: 'instance_name is required' });
    if (!/^https?:\/\//i.test(api_url)) return json(400, { ok: false, error: 'api_url must be a valid http(s) URL' });
    if (!api_key) return json(400, { ok: false, error: 'api_key is required' });

    const { data, error } = await admin.rpc('fn_edge_upsert_evolution_credentials', {
      p_instance_name: instance_name,
      p_api_url: api_url,
      p_api_key: api_key,
      p_display_name: display_name,
      p_department: department,
      p_is_active: is_active,
    });

    if (error) {
      // Nunca logar a api_key; a mensagem de erro RPC é segura (permission/config).
      console.error('[evolution-credentials] upsert RPC falhou:', error.message);
      return json(500, { ok: false, error: 'Failed to save credential' });
    }

    // RPC RETURNS jsonb → PostgREST devolve o objeto parseado (ex.: { id })
    const id = data && typeof data === 'object' ? (data as { id?: unknown }).id : null;
    return json(200, { ok: true, id: typeof id === 'string' ? id : null });
  }

  if (action === 'delete') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!UUID_RE.test(id)) return json(400, { ok: false, error: 'invalid id' });

    const { data, error } = await admin.rpc('fn_edge_delete_evolution_credentials', { p_id: id });

    if (error) {
      console.error('[evolution-credentials] delete RPC falhou:', error.message);
      return json(500, { ok: false, error: 'Failed to delete credential' });
    }

    return json(200, { ok: true, deleted: data === true });
  }

  return json(400, { ok: false, error: 'unknown action' });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  if (req.method === 'POST') {
    return handleWrite(req);
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method Not Allowed' }),
      { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }

  // Contrato evolution-credentials@v1 (estrito): GET sem body → {} aceito.
  const parsed = parseOrReject('evolution-credentials', { v1: EvolutionCredentialsV1Schema }, req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (!parsed.ok) return parsed.response;

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