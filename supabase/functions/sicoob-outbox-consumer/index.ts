// Sprint 2 — Consumidor da outbox Sicoob.
// Invocado por pg_cron a cada 1 min. Drena itens pendentes com backoff exponencial.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 6; // ~1+2+4+8+16+32 min de backoff

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sicoobGiftsUrl = Deno.env.get("SICOOB_GIFTS_URL");
    const bridgeSecret = Deno.env.get("SICOOB_GIFTS_BRIDGE_SECRET");
    if (!sicoobGiftsUrl || !bridgeSecret) {
      return json({ error: "SICOOB_GIFTS_URL/SECRET not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Claim batch atomicamente (evita processamento concorrente)
    const { data: claimed, error: claimErr } = await supabase.rpc("sicoob_outbox_claim", {
      p_limit: MAX_BATCH,
    });

    if (claimErr) {
      // Fallback: sem RPC dedicada, faz SELECT + UPDATE simples
      const { data: pending } = await supabase
        .from("sicoob_reply_outbox")
        .select("id, contact_id, message_id, agent_id, content, attempts")
        .in("status", ["pending", "failed"])
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(MAX_BATCH);
      return await processBatch(pending ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
    }

    return await processBatch(claimed ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function processBatch(
  items: Array<{ id: string; contact_id: string; message_id: string; agent_id: string | null; content: string; attempts: number }>,
  supabase: ReturnType<typeof createClient>,
  sicoobGiftsUrl: string,
  bridgeSecret: string,
) {
  let sent = 0, failed = 0;

  for (const item of items) {
    try {
      const { data: mapping } = await supabase
        .from("sicoob_contact_mapping")
        .select("sicoob_user_id, sicoob_vendedor_id, sicoob_singular_id")
        .eq("contact_id", item.contact_id)
        .single();

      if (!mapping) {
        await markFailed(supabase, item, "no sicoob mapping", true);
        failed++;
        continue;
      }

      let agentName = "Vendedor";
      if (item.agent_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", item.agent_id)
          .single();
        if (profile?.full_name) agentName = profile.full_name;
      }

      const resp = await fetch(`${sicoobGiftsUrl}/functions/v1/chat-bridge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridgeSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "agent_reply",
          contact_id: item.contact_id,
          message_id: item.message_id,
          agent_id: item.agent_id,
          agent_name: agentName,
          content: item.content,
          sicoob_user_id: mapping.sicoob_user_id,
          sicoob_vendedor_id: mapping.sicoob_vendedor_id,
          sicoob_singular_id: mapping.sicoob_singular_id,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        const txt = (await resp.text().catch(() => "")).slice(0, 300);
        await markFailed(supabase, item, `HTTP ${resp.status}: ${txt}`, false);
        failed++;
        continue;
      }

      await supabase
        .from("sicoob_reply_outbox")
        .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", item.id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(supabase, item, msg, false);
      failed++;
    }
  }

  return json({ ok: true, sent, failed, total: items.length });
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  item: { id: string; attempts: number },
  error: string,
  fatal: boolean,
) {
  const nextAttempts = item.attempts + 1;
  const abandon = fatal || nextAttempts >= MAX_ATTEMPTS;
  const backoffMin = Math.min(Math.pow(2, nextAttempts), 60);
  const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();

  await supabase
    .from("sicoob_reply_outbox")
    .update({
      status: abandon ? "abandoned" : "failed",
      attempts: nextAttempts,
      last_error: error,
      next_attempt_at: nextAt,
    })
    .eq("id", item.id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
