import { handleCors, errorResponse, jsonResponse, Logger } from "../_shared/validation.ts";
import { SicoobBridgeReplySchema, parseBody } from "../_shared/schemas.ts";
import { requireUser, requireServiceRoleOnly, getBearer, timingSafeStringEqual } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("sicoob-bridge-reply");

  try {
    const serviceRoleKey = Deno.env.get("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createZappAdminClient();

    // Dual-mode auth: user JWT (frontend) or service-role (Postgres trigger).
    const bearer = getBearer(req);
    const isServiceRole = bearer !== null && serviceRoleKey !== '' && timingSafeStringEqual(bearer, serviceRoleKey);
    let agent_id: string | null = null;

    if (isServiceRole) {
      // Internal caller (Postgres trigger) — no user context, agent_id from body
      const denied = requireServiceRoleOnly(req);
      if (denied) return denied;
    } else {
      const authed = await requireUser(req);
      if (authed instanceof Response) return authed;
      agent_id = authed.user.id;
    }

    const sicoobGiftsUrl = Deno.env.get('SICOOB_GIFTS_URL');
    const sicoobGiftsBridgeSecret = Deno.env.get('SICOOB_GIFTS_BRIDGE_SECRET');

    if (!sicoobGiftsUrl || !sicoobGiftsBridgeSecret) {
      throw new Error('SICOOB_GIFTS_URL or SICOOB_GIFTS_BRIDGE_SECRET not configured');
    }

    const parsed = parseBody(SicoobBridgeReplySchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { contact_id, content, message_id, created_at } = parsed.data;
    // For service-role callers the body may carry agent_id; for user callers use JWT identity.
    if (!agent_id) agent_id = (parsed.data as Record<string, unknown>).agent_id as string ?? null;

    // Get the contact — contacts.user_id column does not exist; RLS enforces
    // tenant isolation when the caller is a user JWT. Service-role callers bypass
    // RLS intentionally (Postgres trigger context).
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, contact_type, channel_type')
      .eq('id', contact_id)
      .single();

    if (!contact || contact.contact_type !== 'sicoob_gifts') {
      return errorResponse('Contact is not a Sicoob Gifts contact', 400, req);
    }

    // Get the mapping to find Sicoob IDs
    const { data: mapping } = await supabase
      .from('sicoob_contact_mapping')
      .select('sicoob_user_id, sicoob_vendedor_id, sicoob_singular_id')
      .eq('contact_id', contact_id)
      .single();

    if (!mapping) {
      return errorResponse('No Sicoob mapping found for this contact', 404, req);
    }

    // Get agent name when agent_id is known
    let agentName = 'Vendedor';
    if (agent_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', agent_id)
        .single();
      if (profile?.full_name) agentName = profile.full_name;
    }

    // Forward to Sicoob Gifts
    const sicoobPayload = {
      action: 'agent_reply',
      contact_id, content, message_id, agent_id,
      agent_name: agentName,
      sicoob_user_id: mapping.sicoob_user_id,
      sicoob_vendedor_id: mapping.sicoob_vendedor_id,
      sicoob_singular_id: mapping.sicoob_singular_id,
      created_at: created_at || new Date().toISOString(),
    };

    log.info("Forwarding reply to Sicoob Gifts");

    const response = await fetch(`${sicoobGiftsUrl}/functions/v1/chat-bridge`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sicoobGiftsBridgeSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sicoobPayload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      log.error("Sicoob Gifts bridge error", { status: response.status, error: errorText.substring(0, 300) });
      return errorResponse("Failed to forward reply to Sicoob Gifts", 502, req);
    }

    const result = await response.json();
    log.done(200);
    return jsonResponse({ success: true, sicoob_response: result }, 200, req);

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      log.error("Sicoob Gifts bridge timed out");
      return errorResponse('Gateway timeout forwarding to Sicoob Gifts', 504, req);
    }
    log.error("Error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
