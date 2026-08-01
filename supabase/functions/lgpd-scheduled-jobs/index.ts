import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

        if (!fetchErr && toAnonymize?.length) {
          let anonymizedCount = 0;

          for (const contact of toAnonymize) {
            const { error: updateErr } = await supabase
              .from('evolution_contacts')
              .update({
                full_name:           `[Anonimizado]`,
                email:               null,
                push_name:           null,
                profile_picture_url: null,
                company:             null,
                notes:               null,
                raw_data:            null,
                pii_masked_at:       new Date().toISOString(),
              })
              .eq('id', contact.id);

            if (!updateErr) {
              anonymizedCount++;
              await supabase.from('contact_audit_log').insert({
                contact_id: contact.id,
                action: 'pii_anonymized',
                metadata: { reason: 'lgpd_deletion_request_30d' },
              }).catch(() => {});
            }
          }

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

      // Contar antes de deletar para o relatório
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
      // Atualiza hashes para contatos sem hash ou com hash nulo
      const { data: contacts, error: hashFetchErr } = await supabase
        .from('evolution_contacts')
        .select('id, phone_number, email, full_name')
        .is('dedup_hash', null)
        .limit(5000);

      if (!hashFetchErr && contacts?.length) {
        let updated = 0;
        for (const c of contacts) {
          const hash = simpleHash(
            (c.phone_number ?? '').replace(/\D/g, '').toLowerCase() + '|' +
            (c.email ?? '').toLowerCase() + '|' +
            (c.full_name ?? '').toLowerCase()
          );

          await supabase
            .from('evolution_contacts')
            .update({ dedup_hash: hash })
            .eq('id', c.id)
            .catch(() => {});
          updated++;
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
        total_contacts:         total.count ?? 0,
        pending_deletion:       pendingDeletion.count ?? 0,
        already_anonymized:     masked.count ?? 0,
        with_lgpd_consent:      lgpdConsented.count ?? 0,
        compliance_rate_pct:    total.count
          ? Math.round(((lgpdConsented.count ?? 0) / total.count) * 100)
          : 100,
        generated_at:           new Date().toISOString(),
      };
    }

    // ── Persiste relatório no log de migrações ─────────────────────────────
    report['completed_at'] = new Date().toISOString();
    report['elapsed_ms']   = Date.now() - startTime;
    report['status']       = 'success';
    report['job']          = job ?? 'all';

    await supabase.from('migration_audit').insert({
      operation:   'lgpd_scheduled_job',
      table_name:  'lgpd_scheduled_jobs',
      new_data:    report,
    }).catch(() => {});

    return json(report);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[lgpd-scheduled-jobs]', msg);
    return json({ error: msg, status: 'failed', elapsed_ms: Date.now() - startTime }, 500);
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
