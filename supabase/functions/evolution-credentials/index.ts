/**
 * evolution-credentials — Edge Function (v2, 2026-07-06) — POST-only desde 2026-08-14
 *
 * POST — CRUD de credenciais da instância Evolution (actions 'save' | 'delete').
 * O GET (que entregava a Evolution api_key ao browser via header X-Evolution-Key)
 * foi ATERRADO com 410 Gone em 2026-08-14 (commit bed8e1039): a key nunca mais
 * sai do servidor — o browser usa a edge `evolution-proxy`. O código morto do
 * GET foi removido em 2026-08-14 (aposentadoria formal — plano desacoplamento #30).
 *
 * SEGURANÇA (POST):
 * - Requer role admin/supervisor (requireAdminOrSupervisor)
 * - Escrita via RPC SECURITY DEFINER em zapp (service_role); a tabela física
 *   evo.evolution_instance_credentials NÃO está no PGRST_DB_SCHEMAS
 * - CORS restrito a origens conhecidas via _shared/cors.ts
 * - Nunca ecoa nem loga api_key
 *
 * v2 — CAUSA RAIZ CORRIGIDA (auditoria integração full 2026-07-06):
 * As leituras `.schema('vault')` / `.schema('evo')` da v1 NUNCA funcionaram
 * em produção: PGRST_DB_SCHEMAS = public,zapp,storage,graphql_public,artes,
 * vendas,financeiro não expõe `vault` nem `evo` — e NÃO DEVE expor (vault no
 * PostgREST = superfície de ataque inaceitável; `evo` foi justamente fechado
 * no fix do storm 401). A escrita passa por RPCs SECURITY DEFINER
 * (fn_edge_upsert_evolution_credentials / fn_edge_delete_evolution_credentials):
 *   - EXECUTE revogado de PUBLIC/anon/authenticated; GRANT só service_role
 *   - search_path='' fixado; vault continua invisível ao PostgREST
 */
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireAdminOrSupervisor } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/validation.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';

/** UUID canônico (v1-v8) — validação simples do id em action 'delete'. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST — CRUD de credenciais (actions 'save' | 'delete').
 *
 * A tabela física vive em evo.evolution_instance_credentials, que NÃO está no
 * PGRST_DB_SCHEMAS (fechada por segurança). Por isso a escrita NÃO usa
 * PostgREST direto (.schema('evo') seria 404/403) — passa por RPC SECURITY
 * DEFINER, mesmo padrão do GET aposentado em 2026-08-14.
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

  // Contrato evolution-credentials-write@v1 (discriminatedUnion por action):
  // save exige instance_name/api_url/api_key; delete exige id UUID.
  // Correção 2026-08-04: o POST lia req.json() sem gate — envelope 422
  // unificado para payloads inválidos (antes: 400 ad-hoc no handler).
  const raw = await req.json().catch(() => null);
  const parsed = parseOrReject('evolution-credentials-write', CONTRACT_SCHEMAS['evolution-credentials-write'], req, raw, {
    extraHeaders: cors,
  });
  if (parsed.ok === false) return parsed.response;
  const body = parsed.data as Record<string, unknown>;

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

Deno.serve((req: Request) => {
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

  // SECURITY FIX 2026-08-14 — Phase 6 Desacoplamento:
  // O GET desta fn entregava a evolution api_key ao browser (via X-Evolution-Key header).
  // A key agora nunca sai do servidor: usa-se o evolution-proxy edge fn.
  // O browser (evolutionClient.ts) já foi atualizado para chamar evolution-proxy.
  // Retornamos 410 Gone para clientes legados que ainda chamem este endpoint.
  return new Response(
    JSON.stringify({
      error: 'Gone',
      message: 'Use /functions/v1/evolution-proxy for Evolution API calls. This endpoint no longer serves credentials.',
      migration: 'evolution-proxy',
    }),
    { status: 410, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
  );
});