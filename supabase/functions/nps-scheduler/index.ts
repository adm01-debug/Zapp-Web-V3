// NPS Scheduler — chamada diária via cron.
// Para cada contato com conversa resolvida há ≥3 dias, sem convite NPS nos últimos 30 dias,
// envia mensagem WhatsApp com link/instrução para responder e registra em nps_invitations.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_DAYS = 30;
const RESOLVED_AGE_DAYS = 3;
const MAX_PER_RUN = 50;

Deno.serve(async (req) => {

  // Verify cron secret — fail closed if not configured
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'Service not available' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  const provided = authHeader?.replace(/^Bearer\s+/i, '') || req.headers.get('x-cron-secret');
  if (provided !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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
    return json({ error: true, message: candErr.message }, 500);
  }
  if (!candidates || candidates.length === 0) {
    return json({ scheduled: 0, message: 'no candidates' });
  }

  // 2. Filter out those invited recently
  const ids = candidates.map((c) => c.id);
  const { data: recentInvites } = await supabase
    .from('nps_invitations')
    .select('contact_id')
    .in('contact_id', ids)
    .gte('sent_at', cutoffCooldown);
  const skipSet = new Set((recentInvites ?? []).map((r) => r.contact_id));
  const toInvite = candidates.filter((c) => !skipSet.has(c.id)).slice(0, MAX_PER_RUN);

  if (toInvite.length === 0) {
    return json({ scheduled: 0, message: 'all candidates within cooldown' });
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
          headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
          body: JSON.stringify({
            number: contact.phone,
            text,
          }),
        });
        const txt = await resp.text();
        if (!resp.ok) {
          // record into DLQ for retry
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
      });
      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from('failed_messages').insert({
        instance_name: instanceName,
        remote_jid: `${contact.phone}@s.whatsapp.net`,
        payload: { __path: '/message/sendText', number: contact.phone, text },
        error_message: msg.slice(0, 500),
        error_code: 'NPS_INVITE_EXCEPTION',
      });
    }
  }

  return json({ scheduled: toInvite.length, sent, failed, dryRun });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
