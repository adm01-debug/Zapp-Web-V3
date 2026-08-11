import { getCorsHeaders, handleCors } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { getSecret } from "../_shared/vault.ts";
import { parseOrReject, buildContractErrorBody } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * evolution-group-sync — sync de grupos WhatsApp (Evolution API → Supabase).
 *
 * Rota única: action='groups' (default). Interna (service-role/cron) — NUNCA
 * exposta a usuários. Substitui o backfill via pg_net (evo.fn_sync_groups_from_api),
 * que NÃO envia headers custom (401 na Evolution API — investigação 2026-08-11);
 * fetch do Deno envia o header `apikey` corretamente.
 *
 * Fluxo (action='groups'):
 *   1. requireServiceRoleOrCron (service-role bearer OU x-cron-secret).
 *   2. Lê o token da instância em Deno.env.get('EVOLUTION_INSTANCE_TOKEN_WPP2')
 *      — NÃO há fallback para vault; o secret precisa ser criado no stack do
 *      Supabase self-hosted (supabase-edge-functions env) com o valor do vault
 *      `evolution_instance_token_wpp2` (UUID 36 chars da tabela Instance do
 *      banco evolution). Sem ele → 503 com ok=false.
 *   3. GET {EVOLUTION_API_URL}/group/fetchAllGroups/{instance}?getParticipants=true
 *      com header apikey=<token>.
 *   4. Para cada grupo: resolve whatsapp_connections.id (instance_name) e chama
 *      a RPC zapp.zapp_upsert_group_from_event (persiste em evo.evolution_groups
 *      + participantes). Participantes aceitam string ("5511...@c.us") ou
 *      objeto {id} (formato do fetchAllGroups com getParticipants=true).
 *   5. Resposta sempre { ok, fetched, upserted, errors, primeiro_erro }.
 */

const EVOLUTION_API_URL_DEFAULT = "https://evolution.atomicabr.com.br";
const INSTANCE_DEFAULT = "wpp2";
const INSTANCE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/** Resposta JSON padrão da função (mesmo shape em sucesso e falha). */
function jsonResponse(
  body: {
    ok: boolean;
    fetched: number;
    upserted: number;
    errors: number;
    primeiro_erro: string | null;
  },
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Falha de validação pós-gate → envelope 422 ÚNICO (contract-kit). */
function contractViolation422(path: string, message: string, extra?: Record<string, string>): Response {
  const eb = buildContractErrorBody(
    "evolution-group-sync", undefined, "contract_violation",
    message,
    [{ path, message }],
  );
  return new Response(JSON.stringify(eb), {
    status: 422,
    headers: { ...(extra ?? {}), "Content-Type": "application/json" },
  });
}

/**
 * Normaliza um participante do fetchAllGroups para o formato text[] da RPC:
 * string direta ("5511999999999@c.us") ou objeto { id } (com getParticipants=true).
 * Retorna null para entradas inválidas (ignoradas pelo caller).
 */
export function normalizeParticipant(p: unknown): string | null {
  if (typeof p === "string") {
    const t = p.trim();
    return t ? t : null;
  }
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const id = (p as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

/** Parâmetros da RPC zapp.zapp_upsert_group_from_event. */
export interface GroupUpsertParams {
  p_connection_id: string;
  p_group_id: string;
  p_name: string;
  p_desc: string;
  p_participants: string[];
  p_instance: string;
}

/** Estatística do lote (shape da resposta { fetched, upserted, errors, primeiro_erro }). */
export interface GroupsSyncStats {
  fetched: number;
  upserted: number;
  errors: number;
  primeiro_erro: string | null;
}

/**
 * Processa o array de grupos da Evolution API, chamando a RPC por grupo.
 * Erro isolado não derruba o lote (padrão do evo.fn_sync_groups_from_api).
 * `rpcCall` é injetável para testes (fetch mock / RPC fake).
 */
export async function processGroups(
  groups: unknown[],
  rpcCall: (params: GroupUpsertParams) =>
    | { error: { message: string } | null }
    | PromiseLike<{ error: { message: string } | null }>,
  connectionId: string,
  instanceName: string,
): Promise<GroupsSyncStats> {
  let upserted = 0;
  let errors = 0;
  let primeiroErro: string | null = null;

  for (const g of groups) {
    try {
      const grp = (g ?? {}) as Record<string, unknown>;
      const gid = typeof grp.id === "string" && grp.id.trim() ? grp.id.trim() : null;
      if (!gid) {
        errors++;
        primeiroErro ??= "grupo sem campo 'id'";
        continue;
      }
      const name = typeof grp.subject === "string" ? grp.subject : "";
      const desc = typeof grp.desc === "string"
        ? grp.desc
        : (typeof grp.description === "string" ? grp.description : "");
      const participants = Array.isArray(grp.participants)
        ? grp.participants.map(normalizeParticipant).filter((p): p is string => p !== null)
        : [];

      const { error: rpcErr } = await rpcCall({
        p_connection_id: connectionId,
        p_group_id: gid,
        p_name: name,
        p_desc: desc,
        p_participants: participants,
        p_instance: instanceName,
      });
      if (rpcErr) {
        errors++;
        primeiroErro ??= `RPC zapp_upsert_group_from_event(${gid}): ${rpcErr.message}`;
      } else {
        upserted++;
      }
    } catch (e) {
      errors++;
      primeiroErro ??= errMsg(e);
    }
  }

  return { fetched: groups.length, upserted, errors, primeiro_erro: primeiroErro };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** JSON simples com CORS (respostas da action isonwa). */
function jsonSimple(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * action='isonwa' — processa a fila evo.evolution_whatsapp_check_queue contra a
 * Evolution API (POST /chat/whatsappNumbers/:instance) e atualiza
 * evo.evolution_contacts.is_on_whatsapp / whatsapp_checked_at.
 * A fila deve conter jids @s.whatsapp.net (números puros são aceitos e
 * normalizados para o jid correspondente no retorno da API).
 */
export async function handleIsonwa(
  supabase: ReturnType<typeof createZappAdminClient>,
  corsHeaders: Record<string, string>,
  token: string,
  instanceName: string,
  limit: number,
): Promise<Response> {
  const vLimit = Math.min(Math.max(limit, 1), 50);
  const { data: fila, error: filaErr } = await supabase
    .from("evolution_whatsapp_check_queue")
    .select("remote_jid")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(vLimit);
  if (filaErr) {
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `fila: ${filaErr.message}`,
    }, 502, corsHeaders);
  }
  const jids = (fila ?? [])
    .map((r) => (r as { remote_jid?: unknown }).remote_jid)
    .filter((j): j is string => typeof j === "string" && /^[0-9]+@s\.whatsapp\.net$/.test(j));
  if (jids.length === 0) {
    return jsonSimple({ ok: true, checked: 0, on_whatsapp: 0, not_found: 0, errors: 0, fila_vazia: true }, 200, corsHeaders);
  }
  const numbers = jids.map((j) => j.split("@")[0]);
  const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || EVOLUTION_API_URL_DEFAULT).replace(/\/+$/, "");
  const url = `${baseUrl}/chat/whatsappNumbers/${instanceName}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { apikey: token, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers }),
    });
  } catch (e) {
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `fetch Evolution falhou: ${errMsg(e)}`,
    }, 502, corsHeaders);
  }
  if (!resp.ok) {
    const bodyPrefix = await resp.text().catch(() => "").then((t) => t.slice(0, 200));
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `Evolution API respondeu ${resp.status}: ${bodyPrefix}`,
    }, 502, corsHeaders);
  }
  const result = (await resp.json().catch(() => [])) as Array<{ jid?: string; exists?: boolean }>;
  const onWa = new Map<string, boolean>();
  for (const item of result) {
    if (item && typeof item.jid === "string") onWa.set(item.jid, item.exists === true);
  }
  const okJids = jids.filter((j) => onWa.get(j) === true);
  const nowIso = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("evolution_whatsapp_check_queue")
    .update({ status: "done", checked_at: nowIso })
    .in("remote_jid", jids);
  if (upErr) {
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `marcar fila: ${upErr.message}`,
    }, 502, corsHeaders);
  }

  if (okJids.length > 0) {
    await supabase
      .from("evolution_contacts")
      .update({ is_on_whatsapp: true, whatsapp_checked_at: nowIso })
      .in("remote_jid", okJids);
  }
  await supabase
    .from("evolution_contacts")
    .update({ whatsapp_checked_at: nowIso })
    .in("remote_jid", jids.filter((j) => !okJids.includes(j)));

  return jsonSimple({
    ok: true, checked: jids.length, on_whatsapp: okJids.length,
    not_found: jids.length - okJids.length, errors: 0,
  }, 200, corsHeaders);
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);

  // 1) Auth: service-role (cron via supabase.functions) OU x-cron-secret
  //    (agendador externo). Nada de anon/authenticated.
  const authError = requireServiceRoleOrCron(req);
  if (authError) return authError;

  // 2) Token da instância — vault (padrão do repo: _shared/vault.ts getSecret,
  //    mesmo mecanismo do dispatcher) com fallback p/ env (segredos do stack).
  //    O valor é o vault evolution_instance_token_wpp2 (UUID 36 chars da tabela
  //    Instance do banco evolution — auth comprovada 200 em 2026-08-11).
  const token =
    (await getSecret("evolution_instance_token_wpp2")) ??
    Deno.env.get("EVOLUTION_INSTANCE_TOKEN_WPP2");
  if (!token) {
    return jsonResponse({
      ok: false, fetched: 0, upserted: 0, errors: 1,
      primeiro_erro: "token da instância ausente — criar secret do vault evolution_instance_token_wpp2 (ou env EVOLUTION_INSTANCE_TOKEN_WPP2)",
    }, 503, corsHeaders);
  }

  // 3) Contrato: action='groups' (default). Corpo vazio ({}) é válido — o
  //    endpoint é disparado por cron sem payload.
  const raw = await req.json().catch(() => ({}));
  const parsed = parseOrReject("evolution-group-sync", CONTRACT_SCHEMAS["evolution-group-sync"], req, raw, {
    extraHeaders: corsHeaders,
  });
  if (parsed.ok === false) return parsed.response;
  const body = parsed.data as { action?: string; instanceName?: string; limit?: number };

  if (body.action && body.action !== "groups" && body.action !== "isonwa") {
    return contractViolation422("action", `action inválida: '${body.action}' (esperado 'groups'|'isonwa')`, corsHeaders);
  }

  // instanceName opcional (default 'wpp2') — sanitizado contra path injection.
  const instanceName = body.instanceName && INSTANCE_NAME_RE.test(body.instanceName)
    ? body.instanceName
    : INSTANCE_DEFAULT;

  const supabase = createZappAdminClient();

  // action='isonwa': processa a fila IsOnWhatsApp (não precisa da conexão).
  if (body.action === "isonwa") {
    return handleIsonwa(supabase, corsHeaders, token, instanceName, body.limit ?? 10);
  }

  // 4a) Resolve a conexão do zapp para a instância.
  const { data: conn, error: connErr } = await supabase
    .from("whatsapp_connections")
    .select("id")
    .eq("instance_name", instanceName)
    .single();
  if (connErr || !conn?.id) {
    return jsonResponse({
      ok: false, fetched: 0, upserted: 0, errors: 1,
      primeiro_erro: `whatsapp_connections não encontrada para instance_name='${instanceName}' (${connErr?.message ?? "sem registro"})`,
    }, 503, corsHeaders);
  }

  // 4b) Fetch dos grupos na Evolution API — header apikey via fetch (Deno),
  //     que o pg_net não envia (causa-raiz do 401 no backfill antigo).
  const baseUrl = (Deno.env.get("EVOLUTION_API_URL") || EVOLUTION_API_URL_DEFAULT).replace(/\/+$/, "");
  const url = `${baseUrl}/group/fetchAllGroups/${instanceName}?getParticipants=true`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { apikey: token } });
  } catch (e) {
    return jsonResponse({
      ok: false, fetched: 0, upserted: 0, errors: 1,
      primeiro_erro: `fetch Evolution falhou: ${errMsg(e)}`,
    }, 502, corsHeaders);
  }
  if (!resp.ok) {
    const bodyPrefix = await resp.text().catch(() => "").then((t) => t.slice(0, 200));
    return jsonResponse({
      ok: false, fetched: 0, upserted: 0, errors: 1,
      primeiro_erro: `Evolution API respondeu ${resp.status}: ${bodyPrefix}`,
    }, 502, corsHeaders);
  }

  const groups: unknown = await resp.json().catch(() => null);
  if (!Array.isArray(groups)) {
    return jsonResponse({
      ok: false, fetched: 0, upserted: 0, errors: 1,
      primeiro_erro: "resposta da Evolution API não é um array (fetchAllGroups)",
    }, 502, corsHeaders);
  }

  // 4c) Upsert grupo a grupo — erro isolado não derruba o lote (padrão do
  //     evo.fn_sync_groups_from_api, agora com transporte correto).
  const stats = await processGroups(
    groups,
    (params) => supabase.rpc("zapp_upsert_group_from_event", params),
    conn.id,
    instanceName,
  );

  console.log("[evolution-group-sync] groups sync concluído", {
    instance: instanceName, fetched: stats.fetched, upserted: stats.upserted,
    errors: stats.errors, primeiro_erro: stats.primeiro_erro,
  });

  return jsonResponse({
    ok: true,
    fetched: stats.fetched,
    upserted: stats.upserted,
    errors: stats.errors,
    primeiro_erro: stats.primeiro_erro,
  }, 200, corsHeaders);
});
