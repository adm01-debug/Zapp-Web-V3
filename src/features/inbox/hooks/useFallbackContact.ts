import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { resolveContactRef } from '@/features/inbox/utils/contactRef';
import type { ConversationWithMessages, ConversationContact } from './realtime/types';

/** Resolves the selected conversation from the list or falls back to a fresh DB lookup by contact ID, JID, or phone; returns null while loading. */
export function useFallbackContact(
  selectedContactId: string | null,
  selectedConversation: ConversationWithMessages | null
): ConversationWithMessages | null {
  const [selectedContactFallback, setSelectedContactFallback] =
    useState<ConversationContact | null>(null);

  useEffect(() => {
    if (!selectedContactId || selectedConversation) {
      setSelectedContactFallback(null);
      return;
    }

    let cancelled = false;
    const loadSelectedContact = async () => {
      const ref = resolveContactRef(selectedContactId);
      if (!ref) {
        setSelectedContactFallback(null);
        return;
      }

      let data: ConversationContact | null = null;
      let error: unknown = null;

      if (ref.kind === 'uuid') {
        const result = await supabase
          .from('contacts')
          .select('*')
          .eq('id', ref.uuid)
          .maybeSingle();
        data = result.data as ConversationContact | null;
        error = result.error;
      } else {
        const result = await supabase
          .from('evolution_contacts')
          .select('*')
          .eq('remote_jid', ref.remoteJid)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        data = result.data as ConversationContact | null;
        error = result.error;
      }

      if (cancelled) return;

      if (error) {
        log.warn('[useFallbackContact] falha ao carregar contato', {
          contactId: selectedContactId,
          kind: ref.kind,
          error,
        });
        setSelectedContactFallback(null);
        return;
      }

      setSelectedContactFallback(data);
    };
    void loadSelectedContact();
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedConversation]);

  return useMemo<ConversationWithMessages | null>(() => {
    if (selectedConversation) return selectedConversation;
    if (!selectedContactFallback) return null;
    return { contact: selectedContactFallback, messages: [], unreadCount: 0, lastMessage: null };
  }, [selectedConversation, selectedContactFallback]);
}
