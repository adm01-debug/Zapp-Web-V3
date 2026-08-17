// CORREÇÃO APLICADA (2026-08-17, Etapa 24 + Etapa 25/E87 do plano 100 etapas):
// Matriz de gates por ação — fim do bypass service-role/cron para usuário:
// - GET (listar ativos): requireUser (E24) — chamador real é o browser.
// - POST action=preview: requireUser (novo) — read-only (1 SELECT + replaceVars,
//   zero side effect, não toca a Evolution); filtro is_active=true p/ consistência
//   com o GET (não expõe template draft/inativo por nome).
// - POST action=send: requireAdminOrSupervisor (novo) — envia WhatsApp pelo número
//   oficial; roteamento via gateway evolutionClient.sendText (envelope v2
//   { number, textMessage: { text } }) no lugar do fetch direto v1 + vault.
//   Fila com source "evolution-templates-gateway" (distingue do envio direto).
// Nota: _shared/providers/evolution/client.ts NÃO foi editado (zona quente,
// 16+ consumidores, commit e4940ad4d em ~15 branches) — apenas importado,
// mesmo padrão de connection-test / nps-scheduler.
// Evolution Templates v5.1
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireAdminOrSupervisor, requireUser } from "../_shared/auth.ts";
import { parseOrReject, buildContractErrorBody } from "../_shared/contract-kit.ts";
import { EvolutionTemplatesV1Schema } from "../_shared/contract-schemas.ts";
import { evolutionClient } from "../_shared/providers/evolution/index.ts";
import type { EvolutionResponse } from "../_shared/providers/evolution/index.ts";

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
interface TemplateRow { is_active?: boolean; approval_status?: string | null; content?: string | null; [key: string]: unknown; }

// Instância continua vinda do vault — o gateway (evolutionClient) só precisa da
// string da instância; key/url vêm do env EVOLUTION_API_KEY/EVOLUTION_API_URL.
let _instance: string | null = null;
async function getInstanceName(): Promise<string> {
  if (_instance) return _instance;
  const { data: instance } = await supabase.rpc("fn_get_vault_secret", { p_name: "evolution_instance_name" });
  if (!instance) throw new Error("Vault missing instance name");
  _instance = instance as string;
  return _instance;
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

function validate(tpl: TemplateRow | null | undefined) {
  if (!tpl) return { ok: false, error: "template not found" };
  if (tpl.is_active === false) return { ok: false, error: "template inactive" };
  if (tpl.approval_status && tpl.approval_status !== "approved") return { ok: false, error: `not approved (${tpl.approval_status})` };
  if (!tpl.content) return { ok: false, error: "no content" };
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // GET (listar templates ativos): usuário autenticado — é o ÚNICO chamador
  // real (useWhatsAppTemplates → invoke GET com JWT de usuário). Era 401 100%.
  // Dados expostos: nome/categoria/conteúdo de templates ativos — ok p/ usuário.
  if (req.method === "GET") {
    const userOrErr = await requireUser(req);
    if (userOrErr instanceof Response) return userOrErr;
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
      // Lê o body UMA vez: gate por ação ANTES do parse (padrão connection-test).
      const rawBody = await req.json().catch(() => (null));
      const sniffAction = (rawBody as Record<string, unknown> | null)?.action;

      // Matriz de gates (Etapa 25/E87 — fim do bypass):
      // - preview: read-only (SELECT + replaceVars, zero side effect, não toca a
      //   Evolution) → requireUser; usuário só obtém texto interpolado de um
      //   template ativo — mesma classe de dado que o GET já expõe.
      // - send (default quando action ausente): envia WhatsApp para remote_jid
      //   arbitrário com o número oficial → requireAdminOrSupervisor
      //   (RPC is_admin_or_supervisor; padrão connection-test L379).
      if (sniffAction === "preview") {
        const userOrErr = await requireUser(req);
        if (userOrErr instanceof Response) return userOrErr;
      } else {
        const authed = await requireAdminOrSupervisor(req);
        if (authed instanceof Response) return authed;
      }

      // Contrato evolution-templates@v1 (estrito): action send|preview + campos tipados.
      const parsed = parseOrReject('evolution-templates', { v1: EvolutionTemplatesV1Schema }, req, rawBody, {
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
        const instance = await getInstanceName();

        // Roteamento via gateway (envelope v2 { number, textMessage: { text } }).
        // timeoutMs 20s × maxRetries 1 — default 30s×3 ≈ 90s estouraria o
        // timeout do edge-runtime (padrão nps-scheduler 15s).
        let result: EvolutionResponse;
        try {
          result = await evolutionClient.sendText(instance, normalizeNumber(remote_jid as string), message, { timeoutMs: 20_000, maxRetries: 1 });
        } catch (e) {
          // getBaseUrl()/getApiKey() lançam se EVOLUTION_API_URL/KEY ausentes
          // (drift repo×Swarm) → 500 com detalhe, não 502 (não é falha da Evolution).
          console.error("[evolution-templates] gateway env error:", e);
          return new Response(JSON.stringify({ template_name, sent: false, error: (e as Error).message, http_status: 0 }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
        }

        const { error: insertErr } = await supabase.from("evolution_message_queue").insert({
          remote_jid, instance_name: instance, message_type: "template", content: message, template_id: tpl.id,
          status: result.ok ? "sent" : "failed", error_message: result.ok ? null : (result.error ?? `HTTP ${result.status}`),
          source: "evolution-templates-gateway", attempts: 1, max_attempts: 1, sent_at: result.ok ? new Date().toISOString() : null
        });
        if (insertErr) console.error("[evolution-templates] queue insert error:", insertErr.message);
        if (result.ok) {
          // Best-effort; bug latente conhecido: call com 3 params × assinatura DB
          // zapp.fn_use_template(p_template_id uuid) com 1 param (migration
          // 20260804190316) — fix separado, NÃO bloqueia o envio (SIM §(f)-5).
          const { error: rpcErr } = await supabase.rpc("fn_use_template", { p_template_id: tpl.id, p_remote_jid: remote_jid, p_variables: variables });
          if (rpcErr) console.error("[evolution-templates] fn_use_template error:", rpcErr.message);
        }
        return new Response(JSON.stringify({ success: result.ok, template_id: tpl.id, message_sent: message, sent: result.ok, http_status: result.status }), { status: result.ok ? 200 : 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
      if (action === "preview") {
        const { template_name, variables } = body;
        // Read-only: SELECT + interpolação de string pura; is_active=true para
        // consistência com o GET (não expõe draft/inativo por nome).
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("name", template_name).eq("is_active", true).maybeSingle();
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
