import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { resolveContactRef, contactRefToString } from '../utils/contactRef';
import { queryExternalProxy } from '@/lib/externalProxy';
import { DEFAULT_INSTANCE } from '@/hooks/evolutionFetchers';
import type { ConversationWithMessages, ConversationContact } from './realtime/types';

/**
 * Resolves the selected conversation from the list or falls back to a fresh DB
 * lookup by contact ID, JID, or phone; returns null while loading.
 *
 * E02: ramifica a identidade do contato via `resolveContactRef` ANTES de
 * qualquer query ao banco:
 * - UUID → `contacts.id`
 * - JID  → `contacts.phone` (contato local sincronizado) e, se não achar,
 *           `evolution_contacts.remote_jid`. Com `useExternalDb`, ainda tenta
 *           o proxy `rpc_get_contact` e, por último, um contato sintético.
 *
 * Filtrar uma coluna `uuid` com um JID gera PostgREST 400 ("invalid input
 * syntax for type uuid") — a ramificação é obrigatória.
 */
export function useFallbackContact(
  selectedContactId: string | null,
  selectedConversation: ConversationWithMessages | null,
  useExternalDb = true
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

      // ── Strategy A: local Supabase lookup, ramificada por tipo ──────────
      let localResult: Record<string, unknown> | null = null;

      if (ref.kind === 'uuid') {
        // UUID → contacts.id
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', ref.uuid)
          .maybeSingle();
        if (error) {
          log.warn('[useFallbackContact] erro ao buscar contato por UUID', {
            uuid: ref.uuid,
            code: error.code,
            message: error.message,
          });
        } else if (data) {
          localResult = data as Record<string, unknown>;
        }
      } else {
        // JID → busca por phone (contatos locais sincronizados)
        if (ref.phone) {
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', ref.phone)
            .maybeSingle();
          if (error) {
            log.warn('[useFallbackContact] erro ao buscar contato por phone', {
              phone: ref.phone,
              code: error.code,
              message: error.message,
            });
          } else if (data) {
            localResult = data as Record<string, unknown>;
          }
        }
        // Se phone não encontrou, tenta por remote_jid em evolution_contacts
        if (!localResult) {
          const { data, error } = await supabase
            .from('evolution_contacts')
            .select('*')
            .eq('remote_jid', ref.remoteJid)
            .order('updated_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (error) {
            log.warn('[useFallbackContact] erro ao buscar evolution_contacts por JID', {
              remoteJid: ref.remoteJid,
              code: error.code,
              message: error.message,
            });
          } else if (data) {
            localResult = data as Record<string, unknown>;
          }
        }
      }

      // ── Strategy B: external proxy rpc_get_contact (useExternalDb) ──────
      // rpc_get_contact takes p_remote_jid (the full JID), not a phone number.
      // Groups (@g.us) and @lid contacts have phone=null but still have a valid remoteJid.
      if (!localResult && useExternalDb && ref.kind === 'jid') {
        try {
          const proxyResult = await queryExternalProxy<Record<string, unknown>>({
            action: 'rpc',
            rpc: 'rpc_get_contact',
            params: { p_remote_jid: ref.remoteJid, p_instance: DEFAULT_INSTANCE },
          });
          const first = proxyResult?.data?.[0];
          if (first) {
            const ext = first as Record<string, unknown>;
            localResult = {
              id: ref.remoteJid,
              name: (ext.name || ext.push_name || ref.phone || ref.remoteJid) as string,
              phone: ref.phone,
              remote_jid: ref.remoteJid,
              avatar_url: (ext.avatar_url || null) as string | null,
              company: (ext.company || null) as string | null,
              tags: ext.tags ?? null,
              instance_name: DEFAULT_INSTANCE,
            };
          }
        } catch (err) {
          log.warn('[useFallbackContact] external proxy indisponível', {
            remoteJid: ref.remoteJid,
            error: String(err),
          });
        }
      }

      // ── Strategy C: synthetic fallback (last resort, useExternalDb) ─────
      if (!localResult && useExternalDb) {
        // For groups/broadcast (phone === null), store null — not the JID string — to avoid
        // poisoning the phone field with a JID like "120363@g.us"
        const syntheticPhone = ref.kind === 'jid' ? ref.phone : null;
        localResult = {
          id: contactRefToString(ref),
          name: ref.kind === 'jid' ? ref.remoteJid.split('@')[0] : ref.raw,
          phone: syntheticPhone,
          remote_jid: ref.kind === 'jid' ? ref.remoteJid : null,
          avatar_url: null,
          company: null,
          tags: null,
          instance_name: DEFAULT_INSTANCE,
        };
      }

      if (cancelled) return;

      setSelectedContactFallback(localResult as ConversationContact | null);
    };
    void loadSelectedContact();
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedConversation, useExternalDb]);

  return useMemo<ConversationWithMessages | null>(() => {
    if (selectedConversation) return selectedConversation;
    if (!selectedContactFallback) return null;
    return { contact: selectedContactFallback, messages: [], unreadCount: 0, lastMessage: null, isArchived: Boolean(selectedContactFallback.deleted_at) };
  }, [selectedConversation, selectedContactFallback]);
}
