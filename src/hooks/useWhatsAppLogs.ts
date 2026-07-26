import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { sanitizePostgrestFilter } from '@/lib/sanitize';
import type {
  ModeFilter,
  SendLogRow,
  WebhookPingRow,
  ErrorLogRow,
} from '@/pages/admin/whatsappLogsHelpers';
import {
  OFFICIAL_PROVIDERS,
  UNOFFICIAL_PROVIDERS,
  OFFICIAL_CHANNELS,
  UNOFFICIAL_CHANNELS,
} from '@/pages/admin/whatsappLogsHelpers';

/** use Whats App Logs. */
export function useWhatsAppLogs(mode: ModeFilter, search: string) {
  const queryClient = useQueryClient();
  const key = ['whatsapp-logs', mode, search] as const;

  const { data, isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const sendQ = safeClient.from<SendLogRow>('provider_message_log', (q) => {
        let query = q
          .select(
            'id,provider,instance_name,direction,remote_jid,delivery_status,http_status,error_code,error_message,received_at,delivered_at'
          )
          .order('received_at', { ascending: false })
          .limit(150);
        if (mode === 'official') query = query.in('provider', OFFICIAL_PROVIDERS);
        if (mode === 'unofficial') query = query.in('provider', UNOFFICIAL_PROVIDERS);
        if (search) {
          const safe = sanitizePostgrestFilter(search);
          query = query.or(
            `remote_jid.ilike.%${safe}%,error_code.ilike.%${safe}%,error_message.ilike.%${safe}%`
          );
        }
        return query;
      });

      const pingQ = supabase
        .from('whatsapp_cloud_webhook_pings')
        .select('id,kind,meta,created_at')
        .order('created_at', { ascending: false })
        .limit(150);

      const errQ = safeClient.from<ErrorLogRow>('dispatch_error_logs', (q) => {
        let query = q
          .select(
            'id,instance_name,channel_type,remote_jid,error_code,error_message,http_status,retry_count,occurred_at'
          )
          .order('occurred_at', { ascending: false })
          .limit(150);
        if (mode === 'official') query = query.in('channel_type', OFFICIAL_CHANNELS);
        if (mode === 'unofficial') query = query.in('channel_type', UNOFFICIAL_CHANNELS);
        if (search) {
          const safe = sanitizePostgrestFilter(search);
          query = query.or(
            `remote_jid.ilike.%${safe}%,error_code.ilike.%${safe}%,error_message.ilike.%${safe}%`
          );
        }
        return query;
      });

      const [sR, pR, eR] = await Promise.all([sendQ, pingQ, errQ]);
      return {
        sends: (sR.data ?? []) as SendLogRow[],
        pings: mode === 'unofficial' ? [] : ((pR.data ?? []) as WebhookPingRow[]),
        errors: (eR.data ?? []) as ErrorLogRow[],
      };
    },
    staleTime: 30_000,
  });

  return {
    sends: data?.sends ?? [],
    pings: data?.pings ?? [],
    errors: data?.errors ?? [],
    loading,
    refresh: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}
