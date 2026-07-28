import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from '../_shared/validation.ts';

Deno.serve(async (req: Request) => {
  const authError = requireServiceRoleOrCron(req);
  if (authError) return authError;

  const db = createZappAdminClient();

  // 1. Purge old contact activity logs (> 90 days)
  const { error: activityError } = await db.schema('zapp')
    .rpc('fn_lgpd_purge_contact_activity', { days_threshold: 90 });

  // 2. Anonymize deleted contacts (soft-deleted > 30 days)
  const { error: anonError } = await db.schema('zapp')
    .rpc('fn_lgpd_anonymize_deleted_contacts', { days_threshold: 30 });

  // 3. Purge message metadata (> 365 days)
  const { error: msgError } = await db.schema('zapp')
    .rpc('fn_lgpd_purge_message_metadata', { days_threshold: 365 });

  const errors = [activityError, anonError, msgError].filter(Boolean);

  if (errors.length > 0) {
    console.error('LGPD job errors:', errors);
    return new Response(
      JSON.stringify({ success: false, errors: errors.map(e => e?.message) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, message: 'LGPD scheduled jobs completed' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
