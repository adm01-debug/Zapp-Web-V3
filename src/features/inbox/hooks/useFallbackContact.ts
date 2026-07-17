import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isValidUUID } from '@/utils/uuid';
import type { ConversationWithMessages, ConversationContact } from './realtime/types';

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
      // FIX B1: the handshake may arrive as a UUID, JID (`num@s.whatsapp.net`)
      // or a bare phone number. Detect which to avoid passing a phone number
      // into the `id` (UUID) column — causes 400 from PostgREST.
      const raw: string = String(selectedContactId);
      const isJid = raw.includes('@');
      const isUuid = isValidUUID(raw);
      const phone: string | null = isJid
        ? raw.split('@')[0].replace(/\D/g, '')
        : !isUuid
          ? (raw as string).replace(/\D/g, '')
          : null;

      let query = supabase.from('contacts').select('*');
      query = phone && !isUuid ? query.eq('phone', phone) : query.eq('id', raw);

      const { data, error } = await query.maybeSingle();
      if (!cancelled && !error) setSelectedContactFallback(data || null);
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
