/**
 * contacts-import Edge Function v1.0
 * Bulk CSV import — 50k rows, phone normalization, upsert on remote_jid.
 * Deploy: supabase functions deploy contacts-import
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);

const normalizePhone = (raw: string): string | null => {
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) d = d.slice(2);
  if (d.length === 10 && '6789'.includes(d[2]) && VALID_DDDS.has(parseInt(d.slice(0, 2)))) {
    d = d.slice(0, 2) + '9' + d.slice(2);
  }
  return (d.length >= 10 && d.length <= 11) ? d : null;
};

const sanitize = (val: unknown, maxLen = 500): string | null => {
  if (!val) return null;
  const s = String(val).replace(/<[^>]*>/g, '').trim().slice(0, maxLen);
  return s || null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: CORS });

    const { rows = [], workspace_id: instanceName = 'wpp2' } = await req.json();
    if (!rows.length) return new Response(JSON.stringify({ error: 'No rows provided' }), { status: 400, headers: CORS });
    if (rows.length > 50000) return new Response(JSON.stringify({ error: 'Max 50,000 rows per import' }), { status: 400, headers: CORS });

    let inserted = 0, skipped = 0;
    const errors: { row: number; error: string }[] = [];
    const startTime = Date.now();

    for (let i = 0; i < rows.length; i += 250) {
      const valid = rows.slice(i, i + 250).map((row: Record<string, string>, j: number) => {
        const name = sanitize(row.name ?? row.nome ?? row.full_name);
        const phone = normalizePhone(row.phone ?? row.telefone ?? row.phone_number ?? '');
        if (!name && !phone) {
          errors.push({ row: i + j + 2, error: 'Nome e telefone ausentes' });
          skipped++;
          return null;
        }
        const remoteJid = phone ? `55${phone}@c.us` : `manual_${Date.now()}_${i + j}@c.us`;
        const tags = (row.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 20);
        return {
          remote_jid: remoteJid, phone_number: phone, full_name: name,
          email: sanitize(row.email),
          company: sanitize(row.company ?? row.empresa),
          notes: sanitize(row.notes ?? row.notas),
          tags, instance_name: instanceName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }).filter(Boolean);

      if (!valid.length) continue;

      const { data, error } = await supabase
        .from('evolution_contacts')
        .upsert(valid, { onConflict: 'remote_jid', ignoreDuplicates: false })
        .select('id');

      if (error) { errors.push({ row: i + 2, error: error.message }); skipped += valid.length; }
      else inserted += (data ?? []).length;
    }

    await supabase.from('contact_export_log').insert({
      exported_by: user.id, instance_name: instanceName, contact_count: inserted,
      export_format: 'csv_import',
      filters_used: { rows_total: rows.length, inserted, errors: errors.length },
    }).then(() => void 0);

    return new Response(
      JSON.stringify({ inserted, updated: 0, skipped, errors: errors.slice(0, 50), total_processed: rows.length, duration_ms: Date.now() - startTime }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS });
  }
});
