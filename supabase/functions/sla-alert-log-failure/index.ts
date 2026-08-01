import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FailurePayload {
  contact_id: string | null;
  attempted_event_type: string; // typically 'sla_alert'
  error_code?: string | null;
  error_message?: string | null;
  error_details?: string | null;
  original_metadata?: Record<string, unknown> | null;
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Require authenticated caller (best effort — protects against anonymous abuse).
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: FailurePayload;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  if (!body || typeof body !== "object") return badRequest("Invalid body");
  if (body.contact_id !== null && !isUuid(body.contact_id)) {
    return badRequest("contact_id must be a uuid or null");
  }
  if (typeof body.attempted_event_type !== "string" ||
      body.attempted_event_type.length === 0 ||
      body.attempted_event_type.length > 64) {
    return badRequest("attempted_event_type required (≤64 chars)");
  }

  // Service-role insert — bypasses RLS so we can ALWAYS record the failure.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const metadata = {
    failure: true,
    attempted_event_type: body.attempted_event_type,
    error_code: body.error_code ?? null,
    error_message: body.error_message?.slice(0, 500) ?? null,
    error_details: body.error_details?.slice(0, 1000) ?? null,
    original_metadata: body.original_metadata ?? null,
    reported_by_user: user.id,
    user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    occurred_at: new Date().toISOString(),
  };

  const { error: insertError } = await admin
    .from("conversation_events")
    .insert({
      contact_id: body.contact_id,
      event_type: "sla_alert_failure",
      metadata,
      performed_by: user.id,
    });

  if (insertError) {
    // Last resort: surface to function logs so operators can grep.
    console.error("[sla-alert-log-failure] failed to record failure", {
      code: insertError.code,
      message: insertError.message,
      user_id: user.id,
      contact_id: body.contact_id,
    });
    return new Response(
      JSON.stringify({ ok: false, error: insertError.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
