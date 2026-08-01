import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-webhook");

  // Validate secret token if configured
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const expectedToken = Deno.env.get('ELEVENLABS_WEBHOOK_SECRET');
  
  if (expectedToken && token !== expectedToken) {
    log.warn("Unauthorized webhook call (invalid token)");
    return errorResponse('Unauthorized', 401, req);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return errorResponse('Invalid JSON payload', 400, req);
    }

    const eventType = String(body.type || body.event_type || 'unknown').slice(0, 100);
    log.info(`event=${eventType}`);

    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));

    // Log the webhook event
    await supabase.from('audit_logs').insert({
      action: `elevenlabs_webhook_${eventType}`,
      entity_type: 'elevenlabs',
      entity_id: String(body.id || body.request_id || '').slice(0, 100) || null,
      details: body,
    });

    switch (eventType) {
      case 'tts.completed':
        log.info('TTS completed', { requestId: body.request_id });
        break;
      case 'tts.failed':
        log.error('TTS failed', { requestId: body.request_id, error: body.error });
        break;
      case 'music.completed':
        log.info('Music completed', { requestId: body.request_id });
        break;
      case 'sfx.completed':
        log.info('SFX completed', { requestId: body.request_id });
        break;
      case 'voice_clone.completed':
        log.info('Voice clone completed', { voiceId: body.voice_id });
        break;
      case 'quota.warning':
        log.warn('Quota warning', { usage: body.usage_percent });
        break;
      default:
        log.info('Unhandled event type');
    }

    log.done(200);
    return jsonResponse({ received: true, event: eventType }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: msg });
    return errorResponse(msg, 500, req);
  }
});
