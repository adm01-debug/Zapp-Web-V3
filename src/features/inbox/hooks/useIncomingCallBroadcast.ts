import { useState, useEffect, useCallback } from 'react';
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import type { IncomingCall } from '@/types/incomingCall';

const log = getLogger('IncomingCallBroadcast');

const DEFAULT_INSTANCE = 'wpp2';

interface BroadcastPayload {
  remote_jid?: string;
  is_video?: boolean;
  call_status?: string;
  agent_profile_id?: string | null;
  started_at?: string;
  wa_call_id?: string | null;
}

export function useIncomingCallBroadcast(instance: string = DEFAULT_INSTANCE) {
  const { profile } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const dismissCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  useEffect(() => {
    if (!isExternalConfigured || !externalSupabase || !profile?.id) return;
    const supabase = externalSupabase;

    const topic = `incoming-calls:${instance}`;
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'call_received' }, async ({ payload }) => {
        const p = (payload ?? {}) as BroadcastPayload;

        if (!p.remote_jid) {
          log.warn('Broadcast received without remote_jid', p);
          return;
        }

        // Defense against status@broadcast and *@broadcast jids
        if (/@broadcast$/i.test(p.remote_jid)) {
          return;
        }

        // Filter by agent (null = global broadcast also accepted)
        if (p.agent_profile_id && p.agent_profile_id !== profile.id) {
          return;
        }

        const phoneFallback = p.remote_jid.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '');

        let contactName = phoneFallback;
        let contactPhone = phoneFallback;
        let contactAvatar: string | null = null;
        let contactId: string | null = null;

        try {
          const { data, error } = await supabase.rpc('rpc_get_contact', {
            p_remote_jid: p.remote_jid,
            p_instance: instance,
          });

          if (error) {
            log.error('rpc_get_contact failed, using phone fallback', error);
          } else if (data) {
            type ContactLookup = {
              push_name?: string | null;
              name?: string | null;
              full_name?: string | null;
              phone?: string | null;
              profile_picture_url?: string | null;
              id?: string | null;
            };
            const row = (Array.isArray(data) ? data[0] : data) as ContactLookup | null;
            if (row) {
              contactName = row.push_name || row.name || row.full_name || phoneFallback;
              contactPhone = row.phone || phoneFallback;
              contactAvatar = row.profile_picture_url ?? null;
              contactId = row.id ?? null;
            }
          }
        } catch (err) {
          log.error('Unexpected error resolving contact', err);
        }

        setIncomingCall({
          id: p.wa_call_id || `bcast_${Date.now()}`,
          contact_id: contactId,
          contact_name: contactName,
          contact_phone: contactPhone,
          contact_avatar_url: contactAvatar,
          is_video: !!p.is_video,
          whatsapp_connection_id: null,
          started_at: p.started_at || new Date().toISOString(),
        });

        log.info(`Broadcast incoming ${p.is_video ? 'video' : 'audio'} call from ${contactName}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      void channel.unsubscribe();
      externalSupabase!.removeChannel(channel);
    };
  }, [profile?.id, instance]);

  return { incomingCall, dismissCall };
}
