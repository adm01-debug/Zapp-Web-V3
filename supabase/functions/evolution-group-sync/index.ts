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
 *   2. Lé o token da instância em Deno.env.get('EVOLUTION_INSTANCE_TOKEN_WPP2')
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
 * Participante normalizado do fetchAllGroups (getParticipants=true).
 * A Evolution 2.3.7 retorna { id: "@lid", phoneNumber: "@s.whatsapp.net", admin: "admin"|null }.
 */
export interface NormalizedParticipant {
  jid: string;
  phoneNumber: string | null;
  isAdmin: boolean;
}

/**
 * Normaliza um participante do fetchAllGroups para { jid, phoneNumber, isAdmin }:
 * string direta ("5511999999999@c.us") ou objeto { id, phoneNumber?, admin? }.
 * Retorna null para entradas inválidas (ignoradas pelo caller).
 */
export function normalizeParticipant(p: unknown): NormalizedParticipant | null {
  if (typeof p === "string") {
    const t = p.trim();
    return t ? { jid: t, phoneNumber: null, isAdmin: false } : null;
  }
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const rec = p as Record<string, unknown>;
    const id = rec.id;
    if (typeof id === "string" && id.trim()) {
      const phone = rec.phoneNumber;
      return {
        jid: id.trim(),
        phoneNumber: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        // Evolution 2.3.7 usa "admin" e também "superadmin" (dono do grupo).
        isAdmin: rec.admin === "admin" || rec.admin === "superadmin" || rec.admin === true,
      };
    }
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
  p_phones: string[];
  p_instance: string;
}

/** Parâmetros da RPC zapp.zapp_upsert_group_participants (promote de admins). */
export interface GroupParticipantsParams {
  p_group_id: string;
  p_participants: string[];
  p_action: string;
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
 * `promoteCall` (opcional) promove admins (best-effort — falha não derruba o lote).
 */
export async function processGroups(
  groups: unknown[],
  rpcCall: (params: GroupUpsertParams) =>
    | { error: { message: string } | null; data?: unknown }
    | PromiseLike<{ error: { message: string } | null; data?: unknown }>,
  connectionId: string,
  instanceName: string,
  promoteCall?: (params: GroupParticipantsParams) =>
    | { error: { message: string } | null }
    | PromiseLike<{ error: { message: string } | null }>,
): Promise<GroupsSyncStats> {
  let upserted = 0;
  let errors = 0;
  let primeiroErro: string | null = null;

  // FIX 2026-08-11: 221 grupos com RPC sequencial estouravam o tempo da edge
  // (504 "upstream server is timing out" — grupos grandes ficavam fora do
  // espelho). Concorrência limitada: 8 workers consomem a fila; stats
  // agregadas e isolamento de erro permanecem idênticos ao loop original.
  const CONCURRENCY = 8;
  const queue = [...groups];
  const worker = async (): Promise<void> => {
    for (;;) {
      const g = queue.shift();
      if (g === undefined) return;
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
        ? grp.participants.map(normalizeParticipant).filter((p): p is NormalizedParticipant => p !== null)
        : [];
      // p_phones alinhado por índice com p_participants (string vazia = sem número).
      const p_participants = participants.map((p) => p.jid);
      const p_phones = participants.map((p) => p.phoneNumber ?? "");
      const adminJids = participants.filter((p) => p.isAdmin).map((p) => p.jid);

      const { error: rpcErr, data: groupUuid } = await rpcCall({
        p_connection_id: connectionId,
        p_group_id: gid,
        p_name: name,
        p_desc: desc,
        p_participants,
        p_phones,
        p_instance: instanceName,
      });
      if (rpcErr) {
        errors++;
        primeiroErro ??= `RPC zapp_upsert_group_from_event(${gid}): ${rpcErr.message}`;
      } else {
        upserted++;
      }
      // Promove admins (best-effort): falha não vira erro de lote, mas é reportada.
      // A RPC de promote espera o uuid interno de evolution_groups (retornado
      // pela RPC de upsert), não o JID @g.us.
      if (adminJids.length > 0 && promoteCall) {
        if (typeof groupUuid === 'string' && groupUuid) {
          const { error: promoteErr } = await promoteCall({
            p_group_id: groupUuid,
            p_participants: adminJids,
            p_action: "promote",
            p_instance: instanceName,
          });
          if (promoteErr) {
            primeiroErro ??= `promote admins(${gid}): ${promoteErr.message}`;
          }
        } else {
          primeiroErro ??= `promote admins(${gid}): upsert não retornou uuid`;
        }
      }
    } catch (e) {
      errors++;
      primeiroErro ??= errMsg(e);
    }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
  );

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
 * A Fila deve conter jids @s.whatsapp.net (números puros são aceitos e
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
  // Fila e contacts vivem em evo (não exposto no PostgREST) — acesso via RPC
  // zapp (SECURITY DEFINER, service_role only).
  const { data: fila, error: filaErr } = await supabase.rpc("zapp_isonwa_pull", {
    p_limit: vLimit,
  });
  if (filaErr) {
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `fila: ${filaErr.message}`,
    }, 502, corsHeaders);
  }
  const jids = (fila ?? [])
    .map((r: unknown) => (r as { remote_jid?: unknown }).remote_jid)
    .filter((j: unknown): j is string => typeof j === "string" && /^[0-9]+@s\.whatsapp\.net$/.test(j));
  if (jids.length === 0) {
    return jsonSimple({ ok: true, checked: 0, on_whatsapp: 0, not_found: 0, errors: 0, fila_vazia: true }, 200, corsHeaders);
  }
  const numbers = jids.map((j: string) => j.split("@")[0]);
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
  const okJids = jids.filter((j: string) => onWa.get(j) === true);

  const { error: markErr } = await supabase.rpc("zapp_isonwa_mark", {
    p_jids: jids,
    p_ok_jids: okJids.length > 0 ? okJids : null,
  });
  if (markErr) {
    return jsonSimple({
      ok: false, checked: 0, on_whatsapp: 0, not_found: 0, errors: 1,
      primeiro_erro: `marcar fila: ${markErr.message}`,
    }, 502, corsHeaders);
  }

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
  // evo.fn_sync_groups_from_api, agora com transporte correto). Admins do
  // fetchAllGroups (campo `admin` dos participantes) são promovidos via
  // zapp_upsert_group_participants (best-effort).
  const stats = await processGroups(
    groups,
    (params) => supabase.rpc("zapp_upsert_group_from_event", params),
    conn.id,
    instanceName,
    (params) => supabase.rpc("zapp_upsert_group_participants", params),
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
