// Evolution Templates v5.0
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, x-api-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

let _cfg: any = null;
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

function replaceVars(content: string, vars: any) {
  let r = content;
  for (const [k, v] of Object.entries(vars || {})) {
    r = r.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi"), String(v ?? ""));
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

function validate(tpl: any) {
  if (!tpl) return { ok: false, error: "template not found" };
  if (tpl.is_active === false) return { ok: false, error: "template inactive" };
  if (tpl.approval_status && tpl.approval_status !== "approved") return { ok: false, error: `not approved (${tpl.approval_status})` };
  if (!tpl.content) return { ok: false, error: "no content" };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const cat = url.searchParams.get("category") || undefined;
      let q = supabase.from("evolution_message_templates").select("*").eq("is_active", true).order("usage_count", { ascending: false });
      if (cat) q = q.eq("category", cat);
      const { data } = await q;
      return new Response(JSON.stringify({ success: true, templates: data }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { action } = body;
      if (action === "send" || !action) {
        const { template_name, remote_jid, variables } = body;
        if (!template_name || !remote_jid) return new Response(JSON.stringify({ error: "template_name e remote_jid obrigatórios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("name", template_name).eq("is_active", true).maybeSingle();
        const v = validate(tpl);
        if (!v.ok) return new Response(JSON.stringify({ template_name, sent: false, error: v.error, http_status: 0 }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
        const message = replaceVars(tpl.content, variables || {});
        const result = await sendMsg(remote_jid, message);
        const cfg = await getConfig();
        await supabase.from("evolution_message_queue").insert({
          remote_jid, instance_name: cfg.instance, message_type: "template", content: message, template_id: tpl.id,
          status: result.ok ? "sent" : "failed", error_message: result.ok ? null : `HTTP ${result.status}`,
          source: "evolution-templates-direct", attempts: 1, max_attempts: 1, sent_at: result.ok ? new Date().toISOString() : null
        }).then(()=>{},()=>{});
        if (result.ok) await supabase.rpc("fn_use_template", { p_template_id: tpl.id, p_remote_jid: remote_jid, p_variables: variables }).then(()=>{},()=>{});
        return new Response(JSON.stringify({ success: result.ok, template_id: tpl.id, message_sent: message, sent: result.ok, http_status: result.status }), { status: result.ok ? 200 : 502, headers: { ...cors, "Content-Type": "application/json" } });
      }
      if (action === "preview") {
        const { template_name, variables } = body;
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("name", template_name).maybeSingle();
        if (!tpl) return new Response(JSON.stringify({ error: "template not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ success: true, template: tpl, preview: replaceVars(tpl.content, variables || {}) }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ error: "Endpoint não encontrado" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } }); }
});
