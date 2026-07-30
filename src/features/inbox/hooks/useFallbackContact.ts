import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { resolveContactRef } from '@/features/inbox/utils/contactRef';
import type { ConversationWithMessages, ConversationContact } from './realtime/types';

const log = getLogger('useFallbackContact');

/**
 * When `selectedContactId` is set but no matching conversation exists in the
 * loaded in-memory list, this hook attempts a direct DB lookup so the inbox
 * view can still display the selected contact.
 *
 * Two primary branches are tried, based on the value's format:
 *  - UUID  → `contacts.id` (application contact from the zapp schema)
 *  - JID   → `evolution_contacts.remote_jid` ordered by `updated_at DESC`
 *            (WhatsApp contact from the Evolution API view)
 *  - Phone → `contacts.phone` (bare number, last-resort fallback)
 *
 * Errors are logged with `log.warn` — never silenced.
 */
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
      try {
        const raw = String(selectedContactId);
        const ref = resolveContactRef(raw);

        let contactData: ConversationContact | null = null;

        if (!ref) {
          // null/undefined/empty — nothing to query
        } else if (ref.type === 'uuid') {
          // ── Branch 1: UUID → contacts.id ──────────────────────────
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', raw)
            .maybeSingle();

          if (error) {
            log.warn('Fallback contact query (UUID→contacts.id) failed', {
              selectedContactId: raw,
              error,
            });
          }
          if (data) {
            contactData = data as unknown as ConversationContact;
          }
        } else if (ref.type === 'jid') {
          // ── Branch 2: JID → evolution_contacts.remote_jid ──────────
          const { data, error } = await supabase
            .from('evolution_contacts')
            .select('*')
            .eq('remote_jid', raw)
            .order('updated_at', { ascending: false })
            .maybeSingle();

          if (error) {
            log.warn('Fallback contact query (JID→evolution_contacts.remote_jid) failed', {
              selectedContactId: raw,
              error,
            });
          }
          if (data) {
            contactData = mapEvoContactToConversationContact(data as Record<string, unknown>, raw);
          }
        }

        if (!cancelled) {
          setSelectedContactFallback(contactData);
        }
      } catch (err) {
        log.warn('Fallback contact lookup threw an exception', {
          selectedContactId,
          error: err,
        });
      }
    };

    void loadSelectedContact();
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedConversation]);

  return useMemo<ConversationWithMessages | null>(() => {
    if (selectedConversation) return selectedConversation;
    if (!selectedContactFallback) return null;
    return {
      contact: selectedContactFallback,
      messages: [],
      unreadCount: 0,
      lastMessage: null,
    };
  }, [selectedConversation, selectedContactFallback]);
}

/**
 * Maps an `evolution_contacts` raw row (from the zapp view that wraps
 * `evo.evolution_contacts`) to the `ConversationContact` shape expected
 * by the inbox.
 */
function mapEvoContactToConversationContact(
  row: Record<string, unknown>,
  remoteJid: string
): ConversationContact {
  const phoneNumber =
    (row.phone_number as string) || (remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid);

  return {
    id: remoteJid,
    name: (row.full_name as string) || (row.push_name as string) || remoteJid,
    surname: (row.last_name as string) || null,
    nickname: (row.push_name as string) || (row.nickname as string) || null,
    phone: phoneNumber,
    email: (row.email as string) || null,
    avatar_url: (row.profile_picture_url as string) || null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : null,
    company: (row.company as string) || null,
    job_title: (row.role_title as string) || null,
    assigned_to: (row.assigned_to as string) || null,
    queue_id: (row.queue_id as string) || null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
    whatsapp_connection_id: null,
    contact_type: 'whatsapp',
    group_category: null,
    ai_sentiment: null,
    channel_type: 'whatsapp',
    channel_connection_id: null,
  };
}
