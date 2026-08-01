import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getCorsHeaders, handleCors, jsonResponse, errorResponse, Logger } from '../_shared/validation.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const log = new Logger('auto-escalate-sla');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
