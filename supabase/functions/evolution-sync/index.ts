import { getCorsHeaders, handleCors, checkRateLimit, readJsonBodyOrEmpty } from "../_shared/validation.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { parseOrReject, buildContractErrorBody } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import {
  syncContacts, syncMessages, syncAllMessages,
  setupWebhook, cleanupMock, fullSync,
} from "../_shared/evolution-sync-actions.ts";



/**
 * Falha de validação pós-gate → envelope 422 ÚNICO (contract-kit).
 * Correção 2026-08-06 (gap A1): era 400 com shape avulso.
 */
function contractViolation422(path: string, message: string, req: Request, extra?: Record<string, string>): Response {
  const eb = buildContractErrorBody(
    'evolution-sync', undefined, 'contract_violation',
    `Campo obrigatório ausente: ${path}.`,
    [{ path, message }],
  );
  return new Response(JSON.stringify(eb), {
    status: 422,
    headers: { ...(extra ?? {}), 'Content-Type': 'application/json' },
  });
}


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

  const rl = checkRateLimit(`evolution-sync:${authed.user.id}`, 10, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';

  const supabase = createZappAdminClient();

  try {
    const raw = await readJsonBodyOrEmpty(req);
    const parsed = parseOrReject("evolution-sync", CONTRACT_SCHEMAS["evolution-sync"], req, raw, {
      extraHeaders: corsHeaders,
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, any>;
    const action = typeof body.action === 'string' ? body.action : 'sync-contacts';
    const rawInstanceName = typeof body.instanceName === 'string' ? body.instanceName : 'wpp2';
    const pageNum = typeof body.page === 'number' ? body.page : 1;
    const offsetNum = typeof body.offset === 'number' ? body.offset : 100;
    const page = Math.min(Math.max(1, Math.floor(pageNum)), 10_000);
    const offset = Math.min(Math.max(1, Math.floor(offsetNum)), 1_000);

    // Reject instance names that could inject path segments into Evolution API URLs
    const INSTANCE_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    if (!INSTANCE_NAME_RE.test(rawInstanceName)) {
      return contractViolation422('instanceName', 'Invalid instanceName', req, corsHeaders);
    }
    const instanceName = rawInstanceName;

    if (action === 'sync-contacts') {
      return await syncContacts(supabase, instanceName, corsHeaders, page, offset);
    }

    const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone : '';
    if (action === 'sync-messages') {
      return await syncMessages(supabase, instanceName, contactPhone, corsHeaders);
    }

    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl : '';
    if (action === 'setup-webhook') {
      return await setupWebhook(instanceName, supabaseUrl, webhookUrl, corsHeaders);
    }

    if (action === 'cleanup-mock') {
      return await cleanupMock(supabase, corsHeaders);
    }

    if (action === 'full-sync') {
      return await fullSync(supabase, instanceName, supabaseUrl, corsHeaders);
    }

    const messagesPerContactNum = typeof body.messagesPerContact === 'number' ? body.messagesPerContact : 200;
    const messagesPerContact = Math.min(Math.max(1, Math.floor(messagesPerContactNum)), 1_000);
    if (action === 'sync-all-messages') {
      return await syncAllMessages(supabase, instanceName, messagesPerContact, corsHeaders);
    }

    return contractViolation422('action', 'Unknown action', req, corsHeaders);
  } catch (error: unknown) {
    console.error('[Sync] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
