import { createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCors, jsonResponse, errorResponse, Logger } from '../_shared/validation.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  const log = new Logger('auto-escalate-sla');

  try {
    const supabase = createZappAdminClient();

    log.info('Starting auto-escalation check');

    // Call the database function to handle the escalation logic
    const { error } = await supabase.rpc('fn_auto_escalate_sla');

    if (error) {
      log.error('Error calling fn_auto_escalate_sla', { error: error.message });
      return errorResponse('Failed to execute escalation', 500, req);
    }

    log.info('Auto-escalation check completed successfully');
    log.done(200, { success: true });

    return jsonResponse({
      message: 'SLA escalation processed',
      success: true,
    }, 200, req);
  } catch (error) {
    log.error('Unexpected error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
