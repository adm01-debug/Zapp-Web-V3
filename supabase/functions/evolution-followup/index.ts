// Evolution Follow-up Processor v3.0
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from "../_shared/auth.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const supabase = createZappAdminClient();
const INSTANCE_NAME = Deno.env.get("EVOLUTION_INSTANCE") || "wpp2";

interface FollowupContact { full_name?: string | null; push_name?: string | null; phone_number?: string | null; }
interface FollowupDeal { title?: string | null; value?: number | string | null; stage?: string | null; }

function renderContent(t: string, c: FollowupContact, deal?: FollowupDeal): string {
  let r = t;
  const fn = (c.full_name || c.push_name || "").split(" ")[0] || "Cliente";
  r = r.replace(/\{\{\s*nome\s*\}\}/gi, fn).replace(/\{\{\s*telefone\s*\}\}/gi, c.phone_number || "");
  if (deal) {
    r = r.replace(/\{\{\s*titulo\s*\}\}/gi, deal.title || "")
      .replace(/\{\{\s*valor\s*\}\}/gi, deal.value ? `R$ ${Number(deal.value).toFixed(2)}` : "")
      .replace(/\{\{\s*estagio\s*\}\}/gi, deal.stage || "");
  }
  const now = new Date();
  r = r.replace(/\{\{\s*data\s*\}\}/gi, now.toLocaleDateString("pt-BR"))
    .replace(/\{\{\s*hora\s*\}\}/gi, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    .replace(/\{\{\s*\w+\s*\}\}/g, "").replace(/\s+/g, " ").trim();
  return r;
}

async function setStatus(id: string, status: string, error?: string) {
  const u: Record<string, unknown> = { status };
  // queued_at marks when the message was enqueued — distinct from sent_at (Evolution confirms delivery)
  if (status === "queued") u.queued_at = new Date().toISOString();
  if (error) u.error_message = error.slice(0, 500);
  const { error: dbErr } = await supabase.from("evolution_followups").update(u).eq("id", id);
  if (dbErr) console.error(`[setStatus] followup ${id} → ${status}:`, dbErr.message);
}

async function processFollowUps() {
  let processed = 0, queued = 0, cancelled = 0, failed = 0;
  const { data: ups, error: selErr } = await supabase.from("evolution_followups").select("*").eq("status", "pending").lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(50);
  if (selErr) {
    console.error("[processFollowUps] select error:", selErr.message);
    return { processed, queued, cancelled, failed };
  }
  if (!ups?.length) return { processed, queued, cancelled, failed };

  for (const fu of ups) {
    // Atomic claim: update status='processing' only if still 'pending' to prevent duplicate processing
    const { count: claimed, error: claimErr } = await supabase
      .from("evolution_followups")
      .update({ status: "processing" }, { count: "exact" })
      .eq("id", fu.id)
      .eq("status", "pending");
    if (claimErr) {
      console.error(`[processFollowUps] claim error for ${fu.id}:`, claimErr.message);
      continue;
    }
    if (!claimed || claimed === 0) continue; // already claimed by another worker

    processed++;
    try {
      const { data: contact } = await supabase.from("evolution_contacts").select("id, remote_jid, full_name, phone_number, push_name").eq("id", fu.contact_id).maybeSingle();
      if (!contact) { await setStatus(fu.id, "failed", "contact not found"); failed++; continue; }

      // hasRecentInbound
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data: msgs } = await supabase.from("evolution_messages").select("id").eq("contact_id", contact.id).eq("from_me", false).gte("created_at", since).limit(1);
      if (msgs?.length) { await setStatus(fu.id, "cancelled", "responded within 24h"); cancelled++; continue; }

      let content = fu.custom_message || "";
      if (!content && fu.template_id) {
        const { data: tpl } = await supabase.from("evolution_message_templates").select("*").eq("id", fu.template_id).maybeSingle();
        if (!tpl) { await setStatus(fu.id, "failed", "template not found"); failed++; continue; }
        if (tpl.is_active === false) { await setStatus(fu.id, "failed", "template inactive"); failed++; continue; }
        if (tpl.approval_status && tpl.approval_status !== "approved") { await setStatus(fu.id, "failed", "not approved"); failed++; continue; }
        const { data: deal } = fu.deal_id ? await supabase.from("evolution_deals").select("*").eq("id", fu.deal_id).maybeSingle() : { data: null };
        content = renderContent(tpl.content, contact, deal);
        if (tpl.footer_text) content = `${content}\n\n${tpl.footer_text}`;
      }
      if (!content) { await setStatus(fu.id, "failed", "no content"); failed++; continue; }

      const { error: qerr } = await supabase.from("evolution_message_queue").insert({
        remote_jid: contact.remote_jid, instance_name: fu.instance_name || INSTANCE_NAME,
        message_type: "text", content, template_id: fu.template_id, priority: 5,
        status: "pending", source: "followup_processor",
        metadata: { ...(fu.metadata || {}), followup_id: fu.id, followup_type: fu.followup_type }
      });
      if (qerr) { await setStatus(fu.id, "failed", qerr.message); failed++; }
      else { await setStatus(fu.id, "queued"); queued++; }
    } catch (e) { await setStatus(fu.id, "failed", (e as Error).message); failed++; }
  }
  return { processed, queued, cancelled, failed };
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Internal cron endpoint — require service role or cron secret
  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  try {
    const start = Date.now();
    const result = await processFollowUps();
    await supabase.from("evolution_performance_metrics").insert({ metric_date: new Date().toISOString().slice(0, 10), metric_type: "followup_processing", metric_value: result.processed, metadata: { ...result, duration_ms: Date.now() - start } }).then(()=>{},()=>{});
    return new Response(JSON.stringify({ success: true, version: "v3", ...result, duration_ms: Date.now() - start, timestamp: new Date().toISOString() }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[evolution-followup] unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
