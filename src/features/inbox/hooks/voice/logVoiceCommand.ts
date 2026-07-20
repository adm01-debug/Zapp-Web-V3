import { supabase } from '@/integrations/supabase/client';

import { getLogger } from '@/lib/logger';
const log = getLogger('logVoiceCommand');

interface VoiceCommandLogParams {
  transcript: string;
  action: string;
  response: string;
  data?: Record<string, unknown>;
  durationMs?: number;
  success?: boolean;
}

/** log Voice Command utilities and exports. */
export function logVoiceCommand(params: VoiceCommandLogParams) {
  // Fire-and-forget — never block UI
  void (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // voice_command_logs may not be in generated types yet — use rpc or raw fetch
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/voice_command_logs`;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || key;

      await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: key,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          user_id: user.id,
          transcript: params.transcript,
          action: params.action,
          response: params.response,
          data: params.data || {},
          duration_ms: params.durationMs,
          success: params.success ?? true,
        }),
      });
    } catch (err) { log.error('Unexpected error in logVoiceCommand:', err); } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  })();
}
