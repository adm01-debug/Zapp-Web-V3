import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import {
  syncContacts, syncMessages, syncAllMessages,
  setupWebhook, cleanupMock, fullSync,
} from "../_shared/evolution-sync-actions.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  // Admin/supervisor-only — destructive sync ops cannot be triggered anonymously.
  let authed: Awaited<ReturnType<typeof requireAdminOrSupervisor>>;
  try {
    authed = await requireAdminOrSupervisor(req);
  } catch (err: unknown) {
    console.error('[Sync] Auth error:', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (authed instanceof Response) return authed;

  const evolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!evolutionApiUrl || !evolutionApiKey || !supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = {};
    }

    if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
      rawBody = {};
    }

    const body = rawBody as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'sync-contacts';
    const rawInstanceName = typeof body.instanceName === 'string' ? body.instanceName : 'wpp2';
    const pageNum = typeof body.page === 'number' ? body.page : 1;
    const offsetNum = typeof body.offset === 'number' ? body.offset : 100;
    const page = Math.max(1, Math.floor(pageNum));
    const offset = Math.max(1, Math.floor(offsetNum));

    // Reject instance names that could inject path segments into Evolution API URLs
    const INSTANCE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    if (!INSTANCE_NAME_RE.test(rawInstanceName)) {
      return new Response(JSON.stringify({ error: 'Invalid instanceName' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const instanceName = rawInstanceName;

    if (action === 'sync-contacts') {
      return await syncContacts(supabase, evolutionApiUrl, evolutionApiKey, instanceName, corsHeaders, page, offset);
    }

    const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone : '';
    if (action === 'sync-messages') {
      return await syncMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, contactPhone, corsHeaders);
    }

    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl : '';
    if (action === 'setup-webhook') {
      return await setupWebhook(evolutionApiUrl, evolutionApiKey, instanceName, supabaseUrl, webhookUrl, corsHeaders);
    }

    if (action === 'cleanup-mock') {
      return await cleanupMock(supabase, corsHeaders);
    }

    if (action === 'full-sync') {
      return await fullSync(supabase, evolutionApiUrl, evolutionApiKey, instanceName, supabaseUrl, corsHeaders);
    }

    const messagesPerContactNum = typeof body.messagesPerContact === 'number' ? body.messagesPerContact : 200;
    const messagesPerContact = Math.max(1, Math.floor(messagesPerContactNum));
    if (action === 'sync-all-messages') {
      return await syncAllMessages(supabase, evolutionApiUrl, evolutionApiKey, instanceName, messagesPerContact, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Unknown action', validActions: ['sync-contacts', 'sync-messages', 'sync-all-messages', 'setup-webhook', 'cleanup-mock', 'full-sync'] }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[Sync] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
