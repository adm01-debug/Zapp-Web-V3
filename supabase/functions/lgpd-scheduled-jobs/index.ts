import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * lgpd-scheduled-jobs — Jobs agendados de conformidade com LGPD
 *
 * Executa rotinas de conformidade com a Lei Geral de Proteção de Dados:
 * 1. Anonimizar dados de contatos que solicitaram exclusão
 * 2. Excluir dados expirados conforme período de retenção
 * 3. Gerar relatório de conformidade
 * 4. Atualizar hashes de deduplicação de contatos
 *
 * Chamado via pg_cron diariamente às 02:00 UTC.
 * Requer service-role bearer OU x-cron-secret.
 */

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

  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    console.error('[lgpd-scheduled-jobs] Missing Supabase configuration');
    return json({ error: 'Supabase configuration missing' }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  const startTime = Date.now();
  const report: Record<string, unknown> = { started_at: new Date().toISOString() };

  try {
    const body = await req.json().catch(() => ({}));
    const { job } = body;

    // ── Job 1: Anonimizar contatos com solicitação de exclusão pendente ──
    if (!job || job === 'anonymize_pending') {
      const anonymizeOnDelete = await getConfig(supabase, 'lgpd.anonymize_on_delete', 'true');

      if (anonymizeOnDelete === 'true') {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: toAnonymize, error: fetchErr } = await supabase
          .from('evolution_contacts')
          .select('id, full_name, lgpd_deletion_requested_at')
          .not('lgpd_deletion_requested_at', 'is', null)
          .lt('lgpd_deletion_requested_at', thirtyDaysAgo)
          .is('pii_masked_at', null)
          .limit(200);

        if (fetchErr) {
          console.error('[lgpd] Error fetching anonymize candidates', fetchErr.message);
        }

        if (!fetchErr && toAnonymize?.length) {
          const anonSettled = await Promise.allSettled(
            toAnonymize.map(async (contact) => {
              const { error: updateErr } = await supabase
                .from('evolution_contacts')
                .update({
                  full_name:           '[Anonimizado]',
                  email:               null,
                  push_name:           null,
                  profile_picture_url: null,
                  company:             null,
                  notes:               null,
                  raw_data:            null,
                  pii_masked_at:       new Date().toISOString(),
                })
                .eq('id', contact.id);

              if (updateErr) {
                console.error('[lgpd] Failed to anonymize contact', contact.id, updateErr.message);
                return false;
              }
              await supabase.from('contact_audit_log').insert({
                contact_id: contact.id,
                action: 'pii_anonymized',
                metadata: { reason: 'lgpd_deletion_request_30d' },
              }).catch(() => {});
              return true;
            })
          );
          const anonymizedCount = anonSettled.filter(r => r.status === 'fulfilled' && r.value).length;

          report['anonymized'] = anonymizedCount;
          console.log(`[lgpd] Anonimizados: ${anonymizedCount} contatos`);
        } else {
          report['anonymized'] = 0;
        }
      }
    }

    // ── Job 2: Deletar dados antigos de webhook ───────────────────────────
    if (!job || job === 'delete_expired') {
      const retentionDays = parseInt(await getConfig(supabase, 'lgpd.data_retention_days', '730'));
      const expirationDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      const { count: countBefore } = await supabase
        .from('evolution_webhook_events')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', expirationDate);

      // Deleta em batches de 1000 para não sobrecarregar
      let deleted = 0;
      for (let i = 0; i < 5; i++) {
        const { data: batch, error: batchErr } = await supabase
          .from('evolution_webhook_events')
          .select('id')
          .lt('created_at', expirationDate)
          .limit(1000);

        if (batchErr || !batch?.length) break;

        const ids = batch.map(r => r.id);
        const { error: deleteErr } = await supabase
          .from('evolution_webhook_events')
          .delete()
          .in('id', ids);

        if (!deleteErr) deleted += ids.length;
        if (ids.length < 1000) break;
      }

      report['deleted_expired_webhooks'] = deleted;
      console.log(`[lgpd] Webhooks expirados deletados: ${deleted} (estimado: ${countBefore})`);
    }

    // ── Job 3: Atualizar dedup hashes de contatos ─────────────────────────
    if (!job || job === 'update_dedup_hashes') {
      const { data: contacts, error: hashFetchErr } = await supabase
        .from('evolution_contacts')
        .select('id, phone_number, email, full_name')
        .is('dedup_hash', null)
        .limit(5000);

      if (hashFetchErr) {
        console.error('[lgpd] Error fetching contacts for dedup', hashFetchErr.message);
      }

      if (!hashFetchErr && contacts?.length) {
        // Compute all hashes in memory (synchronous), then bulk-upsert in parallel batches of 500
        const toUpdate = contacts.map(c => ({
          id: c.id,
          dedup_hash: simpleHash(
            (c.phone_number ?? '').replace(/\D/g, '').toLowerCase() + '|' +
            (c.email ?? '').toLowerCase() + '|' +
            (c.full_name ?? '').toLowerCase()
          ),
        }));

        const CHUNK = 500;
        const chunks: typeof toUpdate[] = [];
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          chunks.push(toUpdate.slice(i, i + CHUNK));
        }

        const batchResults = await Promise.allSettled(
          chunks.map(chunk =>
            supabase.from('evolution_contacts').upsert(chunk, { onConflict: 'id' })
          )
        );

        let updated = 0;
        for (let i = 0; i < batchResults.length; i++) {
          const r = batchResults[i];
          if (r.status === 'fulfilled' && !r.value.error) {
            updated += chunks[i].length;
          } else {
            const msg = r.status === 'rejected' ? String(r.reason) : r.value.error?.message;
            console.error('[lgpd] dedup hash batch error', msg);
          }
        }

        report['dedup_hashes_updated'] = updated;
        console.log(`[lgpd] Dedup hashes atualizados: ${updated}`);
      } else {
        report['dedup_hashes_updated'] = 0;
      }
    }

    // ── Job 4: Relatório de compliance ────────────────────────────────────
    if (!job || job === 'compliance_report') {
      const [total, pendingDeletion, masked, lgpdConsented] = await Promise.all([
        supabase.from('evolution_contacts').select('id', { count: 'exact', head: true }),
        supabase.from('evolution_contacts').select('id', { count: 'exact', head: true })
          .not('lgpd_deletion_requested_at', 'is', null),
        supabase.from('evolution_contacts').select('id', { count: 'exact', head: true })
          .not('pii_masked_at', 'is', null),
        supabase.from('evolution_contacts').select('id', { count: 'exact', head: true })
          .not('lgpd_consent_at', 'is', null),
      ]);

      report['compliance_report'] = {
        total_contacts:      total.count ?? 0,
        pending_deletion:    pendingDeletion.count ?? 0,
        already_anonymized:  masked.count ?? 0,
        with_lgpd_consent:   lgpdConsented.count ?? 0,
        compliance_rate_pct: total.count
          ? Math.round(((lgpdConsented.count ?? 0) / total.count) * 100)
          : 100,
        generated_at: new Date().toISOString(),
      };
    }

    // ── Persiste relatório no log de migrações ─────────────────────────────
    report['completed_at'] = new Date().toISOString();
    report['elapsed_ms']   = Date.now() - startTime;
    report['status']       = 'success';
    report['job']          = job ?? 'all';

    await supabase.from('migration_audit').insert({
      operation:  'lgpd_scheduled_job',
      table_name: 'lgpd_scheduled_jobs',
      new_data:   report,
    }).catch(() => {});

    return json(report);

  } catch (err) {
    console.error('[lgpd-scheduled-jobs]', err instanceof Error ? err.message : String(err));
    return json({ error: 'Internal server error', status: 'failed', elapsed_ms: Date.now() - startTime }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function getConfig(
  supabase: ReturnType<typeof createClient>,
  key: string,
  defaultValue: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (!data?.value) return defaultValue;
    const v = data.value;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  } catch {
    return defaultValue;
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
