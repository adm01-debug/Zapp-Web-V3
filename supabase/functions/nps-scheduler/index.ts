// NPS Scheduler — chamada diária via cron.
// Para cada contato com conversa resolvida há ≥3 dias, sem convite NPS nos últimos 30 dias,
// envia mensagem WhatsApp com link/instrução para responder e registra em nps_invitations.
// Requer service-role bearer OU x-cron-secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

const COOLDOWN_DAYS = 30;
const RESOLVED_AGE_DAYS = 3;
const MAX_PER_RUN = 50;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!, (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { db: { schema: "zapp" } },
  );

  const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
  const dryRun = !evolutionUrl || !evolutionKey;

  // 1. Find candidate contacts: resolved conversations in window, with phone, not recently invited
  const cutoffResolved = new Date(Date.now() - RESOLVED_AGE_DAYS * 86_400_000).toISOString();
  const cutoffCooldown = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();

  const { data: candidates, error: candErr } = await supabase
    .from('contacts')
    .select('id, phone, name, whatsapp_connection_id, updated_at')
    .not('phone', 'is', null)
    .lt('updated_at', cutoffResolved)
    .limit(MAX_PER_RUN * 4);

  if (candErr) {
    console.error('[nps-scheduler] Failed to fetch candidates', candErr.message);
    return json(req, { error: 'Failed to fetch candidates' }, 500);
  }
  if (!candidates || candidates.length === 0) {
    return json(req, { scheduled: 0, message: 'no candidates' });
  }

  // 2. Filter out those invited recently
  const ids = candidates.map((c) => c.id);
  const { data: recentInvites, error: inviteErr } = await supabase
    .from('nps_invitations')
    .select('contact_id')
    .in('contact_id', ids)
    .gte('sent_at', cutoffCooldown);

  if (inviteErr) {
    console.error('[nps-scheduler] Failed to fetch recent invites', inviteErr.message);
    return json(req, { error: 'Failed to check invite history' }, 500);
  }

  const skipSet = new Set((recentInvites ?? []).map((r) => r.contact_id));
  const toInvite = candidates.filter((c) => !skipSet.has(c.id)).slice(0, MAX_PER_RUN);

  if (toInvite.length === 0) {
    return json(req, { scheduled: 0, message: 'all candidates within cooldown' });
  }

  // 3. Fetch instance name (one connection assumed primary; could be improved per-contact)
  const { data: instances } = await supabase
    .from('whatsapp_connections')
    .select('instance_id, status')
    .eq('status', 'connected')
    .limit(1);
  const instanceName = instances?.[0]?.instance_id ?? 'wpp2';

  let sent = 0;
  let failed = 0;

  for (const contact of toInvite) {
    const text =
      `Olá${contact.name ? `, ${contact.name}` : ''}! 👋\n\n` +
      `Como você avaliaria sua experiência conosco numa escala de 0 a 10?\n\n` +
      `Basta responder com o número. Sua opinião nos ajuda a melhorar! 🙏`;

    try {
      if (!dryRun) {
        const resp = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: evolutionKey as string },
          body: JSON.stringify({ number: contact.phone, text }),
          signal: AbortSignal.timeout(15_000),
        });
        const txt = await resp.text();
        if (!resp.ok) {
          await supabase.from('failed_messages').insert({
            instance_name: instanceName,
            remote_jid: `${contact.phone}@s.whatsapp.net`,
            payload: { __path: '/message/sendText', number: contact.phone, text },
            http_status: resp.status,
            error_message: txt.slice(0, 500),
            error_code: 'NPS_INVITE_FAILED',
          });
          failed++;
          continue;
        }
      }

      await supabase.from('nps_invitations').insert({
        contact_id: contact.id,
        channel: 'whatsapp',
        sent_at: new Date().toISOString(),
      });
      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[nps-scheduler] Exception sending to', contact.id, msg);
      await supabase.from('failed_messages').insert({
        instance_name: instanceName,
        remote_jid: `${contact.phone}@s.whatsapp.net`,
        payload: { __path: '/message/sendText', number: contact.phone, text },
        error_message: msg.slice(0, 500),
        error_code: 'NPS_INVITE_EXCEPTION',
      });
    }
  }

  return json(req, { scheduled: toInvite.length, sent, failed, dryRun });
});

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}
