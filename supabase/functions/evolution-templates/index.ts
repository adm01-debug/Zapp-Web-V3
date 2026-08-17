// CORREÇÃO APLICADA (2026-08-17, Etapa 24 do plano 100 etapas): gate dividido por ação —
// GET = requireUser (chamador real é o browser via useWhatsAppTemplates) · POST send/preview
// segue requireServiceRoleOrCron. Pendência restante: rotear o send via gateway (evolutionClient)
// em vez de vault+fetch direto — ver Etapa 25/E87 do plano (aposentação/aprovação do dono).
// Evolution Templates v5.0
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron, requireUser } from "../_shared/auth.ts";
import { parseOrReject, buildContractErrorBody } from "../_shared/contract-kit.ts";
import { EvolutionTemplatesV1Schema } from "../_shared/contract-schemas.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';


/**
 * Falha de validação pós-gate → envelope 422 ÚNICO (contract-kit).
 * Correção 2026-08-06 (gap A1): era 400 com shape avulso.
 */
function contractViolation422(path: string, message: string, _req: Request, extra?: Record<string, string>): Response {
  const eb = buildContractErrorBody(
    'evolution-templates', undefined, 'contract_violation',
    `Campo obrigatório ausente: ${path}.`,
    [{ path, message }],
  );
  return new Response(JSON.stringify(eb), {
    status: 422,
    headers: { ...(extra ?? {}), 'Content-Type': 'application/json' },
  });
}
const supabase = createZappAdminClient();
interface TemplateConfig { url: string; key: string; instance: string; }
interface TemplateRow { is_active?: boolean; approval_status?: string | null; content?: string | null; [key: string]: unknown; }

let _cfg: TemplateConfig | null = null;
async function getConfig() {
  if (_cfg) return _cfg;
  const [{ data: url }, { data: key }, { data: instance }] = await Promise.all([
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_api_url" }),
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_api_key" }),
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_instance_name" }),
  ]);
  if (!url || !key || !instance) throw new Error("Vault missing config");
  _cfg = { url, key, instance };
  return _cfg;
}

function normalizeNumber(jid: string) { return jid.replace("@s.whatsapp.net","").replace("@c.us","").replace("@g.us",""); }

/** Escape regex metacharacters in variable keys to prevent injection. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceVars(content: string, vars: Record<string, unknown>) {
  let r = content;
  for (const [k, v] of Object.entries(vars || {})) {
    // escapeRegex prevents template variable keys from being interpreted as regex patterns
    r = r.replace(new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, "gi"), String(v ?? ""));
  }
  return r.replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/\s+/g, " ").trim();
}

async function sendMsg(jid: string, text: string) {
  const cfg = await getConfig();
  try {
    const r = await fetch(`${cfg.url}/message/sendText/${cfg.instance}`, {
      method: "POST", headers: { "apikey": cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify({ number: normalizeNumber(jid), text }), signal: AbortSignal.timeout(20000)
    });
    return { ok: r.ok, response: await r.json().catch(() => ({})), status: r.status };
  } catch (e) { return { ok: false, response: { error: (e as Error).message }, status: 0 }; }
}

function validate(tpl: TemplateRow | null | undefined) {
  if (!tpl) return { ok: false, error: "template not found" };
  if (tpl.is_active === false) return { ok: false, error: "template inactive" };
  if (tpl.approval_status && tpl.approval_status !== "approved") return { ok: false, error: `not approved (${tpl.approval_status})` };
  if (!tpl.content) return { ok: false, error: "no content" };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Gate dividido por ação (Etapa 24 do plano 100 etapas — fix do 401):
  // - GET (listar templates ativos): usuário autenticado — é o ÚNICO chamador
  //   real (useWhatsAppTemplates → invoke GET com JWT de usuário). Era 401 100%.
  //   Dados expostos: nome/categoria/conteúdo de templates ativos — ok p/ usuário.
  // - POST (send/preview): mantém service-role/cron — enviar WhatsApp para
  //   remote_jid arbitrário com o número oficial exige privilégio.
  if (req.method === "GET") {
    const userOrErr = await requireUser(req);
    if (userOrErr instanceof Response) return userOrErr;
  } else {
    const authErr = requireServiceRoleOrCron(req);
    if (authErr) return authErr;
  }

  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const cat = url.searchParams.get("category") || undefined;
      let q = supabase.from("evolution_message_templates").select("*").eq("is_active", true).order("usage_count", { ascending: false });
      if (cat) q = q.eq("category", cat);
      const { data, error } = await q;
      if (error) {
        console.error("[evolution-templates] GET templates error:", error.message);
        return new Response(JSON.stringify({ success: false, error: "Failed to fetch templates" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ success: true, templates: data ?? [] }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }
    if (req.method === "POST") {
      // Contrato evolution-templates@v1 (estrito): action send|preview + campos tipados.
      const parsed = parseOrReject('evolution-templates', { v1: EvolutionTemplatesV1Schema }, req, await req.json().catch(() => (null)), {
        extraHeaders: getCorsHeaders(req),
      });
      if (parsed.ok === false) return parsed.response;
      const body = parsed.data as Record<string, unknown>;
      const { action } = body;
      if (action === "send" || !action) {
        const { template_name, remote_jid, variables } = body;
        if (!template_name || !remote_jid) return contractViolation422("template_name,remote_jid", "template_name e remote_jid obrigatórios", req, getCorsHeaders(req));
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("name", template_name).eq("is_active", true).maybeSingle();
        const v = validate(tpl);
        if (!v.ok) return new Response(JSON.stringify({ template_name, sent: false, error: v.error, http_status: 0 }), { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        const message = replaceVars(tpl.content, (variables as Record<string, unknown> | undefined) ?? {});
        const result = await sendMsg(remote_jid as string, message);
        const cfg = await getConfig();
        const { error: insertErr } = await supabase.from("evolution_message_queue").insert({
          remote_jid, instance_name: cfg.instance, message_type: "template", content: message, template_id: tpl.id,
          status: result.ok ? "sent" : "failed", error_message: result.ok ? null : `HTTP ${result.status}`,
          source: "evolution-templates-direct", attempts: 1, max_attempts: 1, sent_at: result.ok ? new Date().toISOString() : null
        });
        if (insertErr) console.error("[evolution-templates] queue insert error:", insertErr.message);
        if (result.ok) {
          const { error: rpcErr } = await supabase.rpc("fn_use_template", { p_template_id: tpl.id, p_remote_jid: remote_jid, p_variables: variables });
          if (rpcErr) console.error("[evolution-templates] fn_use_template error:", rpcErr.message);
        }
        return new Response(JSON.stringify({ success: result.ok, template_id: tpl.id, message_sent: message, sent: result.ok, http_status: result.status }), { status: result.ok ? 200 : 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
      if (action === "preview") {
        const { template_name, variables } = body;
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("name", template_name).maybeSingle();
        if (!tpl) return new Response(JSON.stringify({ error: "template not found" }), { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true, template: tpl, preview: replaceVars(tpl.content, (variables as Record<string, unknown> | undefined) ?? {}) }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "Endpoint não encontrado" }), { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[evolution-templates] unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
