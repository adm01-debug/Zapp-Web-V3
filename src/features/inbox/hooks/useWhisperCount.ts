import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

const log = getLogger('useWhisperCount');

export function useWhisperCount(
  selectedContactId: string | null,
  profileId: string | undefined
): number {
  const [whisperCount, setWhisperCount] = useState(0);

  useEffect(() => {
    if (!selectedContactId || !profileId) {
      setWhisperCount(0);
      return;
    }

    // whisper_messages.contact_id is a uuid column. When USE_EXTERNAL_DB=true,
    // selectedContactId may be a WhatsApp JID / phone number (e.g. "551146375517")
    // instead of a UUID. PostgREST returns 400 "invalid input syntax for type uuid"
    // when a non-UUID string is used as a filter on a uuid column.
    // Skip both the count query and the realtime subscription in that case.
    if (!isValidUUID(selectedContactId)) {
      log.debug(
        '[whisperCount] selectedContactId is not a UUID — skipping whisper query (likely a WhatsApp JID)',
        { selectedContactId }
      );
      setWhisperCount(0);
      return;
    }

    let cancelled = false;
    const fetchWhisperCount = async () => {
      const { count, error } = await supabase
        .from('whisper_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', selectedContactId)
        .eq('is_read', false);
      if (!cancelled && !error && count !== null) setWhisperCount(count);
    };
    void fetchWhisperCount();

    // Wave 2: whisper_messages is a VIEW in public schema — zapp.whisper_messages is the base table.
    // PostgreSQL views never emit WAL events, so Realtime subscriptions must target the base table.
    const channel = supabase
      .channel(`whisper-count-${selectedContactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whisper_messages',
          filter: `contact_id=eq.${selectedContactId}`,
        },
        () => {
          void fetchWhisperCount();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [selectedContactId, profileId]);

  return whisperCount;
}
