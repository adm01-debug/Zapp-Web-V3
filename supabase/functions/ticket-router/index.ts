// Edge Function: ticket-router
// Resolve o agente para um contato em um canal usando sticky agent + round-robin com skills.
// Opcionalmente persiste o sticky e atribui o contato (assigned_to + queue_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RouteRequest {
  contact_id: string;
  channel_connection_id?: string | null;
  queue_id?: string | null;
  /** Se true, atualiza contacts.assigned_to/queue_id e grava sticky. */
  apply?: boolean;
}

interface RouteResponse {
  agent_profile_id: string | null;
  queue_id: string | null;
  strategy: "sticky" | "round_robin" | "unassigned";
  reason?: string;
  applied?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: RouteRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.contact_id || typeof body.contact_id !== "string") {
    return new Response(
      JSON.stringify({ error: "contact_id_required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // 1) Resolver agente
  const { data: resolved, error: resolveErr } = await admin.rpc(
    "fn_resolve_agent_for_routing",
    {
      p_contact_id: body.contact_id,
      p_channel_connection_id: body.channel_connection_id ?? null,
      p_queue_id: body.queue_id ?? null,
    },
  );

  if (resolveErr) {
    console.error("[ticket-router] resolve error", resolveErr);
    return new Response(
      JSON.stringify({ error: "resolve_failed", detail: resolveErr.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const result = resolved as RouteResponse;

  // 2) Aplicar (opcional)
  if (body.apply && result.agent_profile_id) {
    const { error: updErr } = await admin
      .from("contacts")
      .update({
        assigned_to: result.agent_profile_id,
        queue_id: result.queue_id,
      })
      .eq("id", body.contact_id);

    if (updErr) {
      console.error("[ticket-router] update contact error", updErr);
      return new Response(
        JSON.stringify({
          ...result,
          applied: false,
          error: "update_failed",
          detail: updErr.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: stickyErr } = await admin.rpc(
      "fn_register_sticky_assignment",
      {
        p_contact_id: body.contact_id,
        p_agent_profile_id: result.agent_profile_id,
        p_channel_connection_id: body.channel_connection_id ?? null,
        p_queue_id: result.queue_id,
      },
    );

    if (stickyErr) {
      console.warn("[ticket-router] sticky write failed", stickyErr);
    }

    result.applied = true;
  } else {
    result.applied = false;
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
