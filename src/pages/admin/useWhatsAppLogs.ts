import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import type { ModeFilter, SendLogRow, WebhookPingRow, ErrorLogRow } from './whatsappLogsHelpers';
import {
  OFFICIAL_PROVIDERS,
  UNOFFICIAL_PROVIDERS,
  OFFICIAL_CHANNELS,
  UNOFFICIAL_CHANNELS,
} from './whatsappLogsHelpers';

export function useWhatsAppLogs(mode: ModeFilter, search: string) {
  const [sends, setSends] = useState<SendLogRow[]>([]);
  const [pings, setPings] = useState<WebhookPingRow[]>([]);
  const [errors, setErrors] = useState<ErrorLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const sendQ = safeClient.from<SendLogRow>('provider_message_log', (q) => {
          let query = q
            .select(
              'id,provider,instance_name,direction,remote_jid,delivery_status,http_status,error_code,error_message,received_at,delivered_at'
            )
            .order('received_at', { ascending: false })
            .limit(150);
          if (mode === 'official') query = query.in('provider', OFFICIAL_PROVIDERS);
          if (mode === 'unofficial') query = query.in('provider', UNOFFICIAL_PROVIDERS);
          if (search)
            query = query.or(
              `remote_jid.ilike.%${search}%,error_code.ilike.%${search}%,error_message.ilike.%${search}%`
            );
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
          if (search)
            query = query.or(
              `remote_jid.ilike.%${search}%,error_code.ilike.%${search}%,error_message.ilike.%${search}%`
            );
          return query;
        });

        const [sR, pR, eR] = await Promise.all([sendQ, pingQ, errQ]);
        if (cancelled) return;
        setSends((sR.data ?? []) as SendLogRow[]);
        setPings(mode === 'unofficial' ? [] : ((pR.data ?? []) as WebhookPingRow[]));
        setErrors((eR.data ?? []) as ErrorLogRow[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [mode, search, refreshKey]);

  return { sends, pings, errors, loading, refresh: () => setRefreshKey((k) => k + 1) };
}
