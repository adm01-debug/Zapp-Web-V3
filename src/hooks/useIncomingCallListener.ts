import { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useIncomingCallListener');
import type { IncomingCall } from '@/types/incomingCall';

export type { IncomingCall } from '@/types/incomingCall';

export function useIncomingCallListener() {
  const { user, profile } = useAuth();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const mountedRef = useMountedRef();

  const dismissCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('incoming-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp',
          table: 'calls',
          filter: `agent_id=eq.${profile.id}`,
        },
        async (payload) => {
          const call = payload.new as Record<string, unknown>;
          
          if (call.direction !== 'inbound' || call.status === 'ended') return;

          // Fetch contact info
          let contactName = 'Desconhecido';
          let contactPhone = '';

          if (call.contact_id) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name, phone')
              .eq('id', call.contact_id as string)
              .single();

            if (!mountedRef.current) return;

            if (contact) {
              contactName = contact.name || contact.phone;
              contactPhone = contact.phone;
            }
          }

          if (!mountedRef.current) return;

          const notes = (call.notes as string) || '';
          const isVideo = notes.toLowerCase().includes('vídeo');

          setIncomingCall({
            id: call.id as string,
            contact_id: call.contact_id as string | null,
            contact_name: contactName,
            contact_phone: contactPhone,
            is_video: isVideo,
            whatsapp_connection_id: call.whatsapp_connection_id as string | null,
            started_at: call.started_at as string,
          });

          log.info(`Incoming ${isVideo ? 'video' : 'audio'} call from ${contactName}`);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);


  return { incomingCall, dismissCall };
}
