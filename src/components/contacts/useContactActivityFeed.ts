/**
 * useContactActivityFeed.ts
 * Real-time activity feed for a contact.
 * Combines: conversations, messages, audit log, and CSAT events.
 * Uses Supabase Realtime to push live updates.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
const log = getLogger('useContactActivityFeed');

import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { sanitizeText } from '@/lib/sanitize';
import { formatPhoneForDisplay } from '@/lib/phoneUtils';

// ── Types ──────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'conversation_started'
  | 'conversation_closed'
  | 'message_sent'
  | 'message_received'
  | 'contact_created'
  | 'contact_updated'
  | 'contact_merged'
  | 'csat_submitted'
  | 'tag_added'
  | 'tag_removed'
  | 'note_added'
  | 'phone_added'
  | 'consent_granted'
  | 'consent_revoked';

export interface ActivityItem {
  id:          string;
  type:        ActivityType;
  label:       string;
  description: string | null;
  actor:       string | null;  // agent name or 'Sistema'
  channel:     string | null;
  timestamp:   string;
  metadata?:   Record<string, unknown>;
}

interface UseContactActivityFeedOptions {
  contactId:   string;
  limit?:      number;
  realtime?:   boolean;
}

// ── Activity label builders ────────────────────────────────────────────────

function buildActivityLabel(
  type: ActivityType,
  meta?: Record<string, unknown>
): string {
  const labels: Record<ActivityType, string> = {
    conversation_started: '💬 Nova conversa iniciada',
    conversation_closed:  '✅ Conversa encerrada',
    message_sent:         '📤 Mensagem enviada',
    message_received:     '📥 Mensagem recebida',
    contact_created:      '👤 Contato criado',
    contact_updated:      '✏️ Contato atualizado',
    contact_merged:       '🔀 Contato mesclado',
    csat_submitted:       '⭐ Avaliação CSAT enviada',
    tag_added:            `🏷️ Tag adicionada${meta?.tag ? ': ' + sanitizeText(meta.tag as string) : ''}`,
    tag_removed:          `🏷️ Tag removida${meta?.tag ? ': ' + sanitizeText(meta.tag as string) : ''}`,
    note_added:           '📝 Nota adicionada',
    phone_added:          `📱 Telefone adicionado${meta?.phone ? ': ' + formatPhoneForDisplay(meta.phone as string) : ''}`,
    consent_granted:      '✅ Consentimento LGPD concedido',
    consent_revoked:      '🚫 Consentimento LGPD revogado',
  };
  return labels[type] ?? type;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useContactActivityFeed({
  contactId,
  limit = 30,
  realtime = true,
}: UseContactActivityFeedOptions) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading,    setLoading]    = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const items: ActivityItem[] = [];

      // 1. Audit log (contact changes)
      const { data: auditData , error } = await (supabase
        .from('contact_audit_log' as any) as any)
        .select('id,action,changed_at,changed_by,new_values,profiles:changed_by(full_name)')
        .eq('contact_id', contactId)
        .order('changed_at', { ascending: false })
        .limit(limit);

      for (const entry of auditData ?? []) {
        const changerName = (entry.profiles as Record<string, unknown> | null)?.full_name as string | null;
        let type: ActivityType = 'contact_updated';

        if (entry.action === 'INSERT') type = 'contact_created';
        if ((entry.new_values as Record<string, unknown>)?.lgpd_opt_out_at) type = 'consent_revoked';
        if ((entry.new_values as Record<string, unknown>)?.lgpd_consent_at) type = 'consent_granted';

        items.push({
          id:          String(entry.id),
          type,
          label:       buildActivityLabel(type),
          description: null,
          actor:       changerName ? sanitizeText(changerName) : 'Sistema',
          channel:     null,
          timestamp:   String(entry.changed_at),
        });
      }

      // 2. Conversations
      const { data: convData , error: convDataErr } = await (supabase
        .from('conversations' as any) as any)
        .select('id,status,channel,created_at,closed_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      for (const conv of convData ?? []) {
        items.push({
          id:          `conv_start_${conv.id}`,
          type:        'conversation_started',
          label:       buildActivityLabel('conversation_started'),
          description: null,
          actor:       null,
          channel:     conv.channel ? sanitizeText(conv.channel) : null,
          timestamp:   String(conv.created_at),
        });

        if (conv.closed_at) {
          items.push({
            id:          `conv_close_${conv.id}`,
            type:        'conversation_closed',
            label:       buildActivityLabel('conversation_closed'),
            description: null,
            actor:       null,
            channel:     conv.channel ? sanitizeText(conv.channel) : null,
            timestamp:   String(conv.closed_at),
          });
        }
      }

      // Sort all items by timestamp descending
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setActivities(items.slice(0, limit));
    } catch (err) {
      log.error('Failed to load contact activity feed', err);
    } finally {
      setLoading(false);
    }
  }, [contactId, limit]);

  // Initial load
  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  // Realtime subscription on audit_log
  useEffect(() => {
    if (!realtime) return;

    channelRef.current = supabase
      .channel(`contact_activity_${contactId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'contact_audit_log',
          filter: `contact_id=eq.${contactId}`,
        },
        () => { fetchActivities(); }
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [contactId, realtime, fetchActivities]);

  return { activities, loading, refresh: fetchActivities };
}
