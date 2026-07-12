import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { getLogger } from '@/lib/logger';
import { conversationSlaRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';

const log = getLogger('SLANotifications');

interface SLABreachPayload {
  id: string;
  contact_id: string;
  first_response_breached: boolean;
  resolution_breached: boolean;
  first_message_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
}

export const useSLANotifications = () => {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const notifiedBreaches = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    log.debug('Setting up realtime subscription');

    const handleBreachNotification = async (
      type: 'first_response' | 'resolution',
      contactId: string
    ) => {
      // Fetch contact info
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', contactId)
        .maybeSingle();

      const title =
        type === 'first_response'
          ? '⚠️ SLA de Primeira Resposta Violado'
          : '🚨 SLA de Resolução Violado';

      const description = contact
        ? type === 'first_response'
          ? `O contato ${contact.name || contact.phone} não recebeu resposta no prazo.`
          : `O atendimento do contato ${contact.name || contact.phone} excedeu o tempo de resolução.`
        : type === 'first_response'
          ? 'Um contato não recebeu resposta dentro do prazo de SLA.'
          : 'Um atendimento excedeu o tempo de resolução de SLA.';

      // Show toast
      toast({
        title,
        description,
        variant: 'destructive',
      });

      // Play sound if enabled and not in quiet hours
      if (settings.soundEnabled && settings.slaBreachSound && !isQuietHours()) {
        playNotificationSound('sla_breach', settings.soundType, settings.soundVolume);
      }

      // Show browser notification if enabled
      if (settings.browserNotifications && settings.desktopAlerts) {
        showBrowserNotification(title, description, {
          tag: `sla-breach-${type}`,
        });
      }
    };

    const channel = supabase
      .channel('sla-breaches')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'zapp',
          table: 'conversation_sla',
        },
        async (payload) => {
          const parsedNew = safeParseEvent(conversationSlaRowSchema, payload.new);
          if (!parsedNew.ok) {
            log.warn('conversation_sla UPDATE payload rejeitado', parsedNew.error);
            return;
          }
          const newRecord = parsedNew.data as SLABreachPayload; // ignore-audit: narrows Supabase query result to local interface
          const oldRecord = (payload.old ?? {}) as Partial<SLABreachPayload>;

          log.debug('Received update', { newRecord, oldRecord });

          // Check for new first response breach
          if (
            newRecord.first_response_breached &&
            !oldRecord.first_response_breached &&
            newRecord.contact_id
          ) {
            const breachKey = `fr-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification('first_response', newRecord.contact_id);
            }
          }

          // Check for new resolution breach
          if (
            newRecord.resolution_breached &&
            !oldRecord.resolution_breached &&
            newRecord.contact_id
          ) {
            const breachKey = `res-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification('resolution', newRecord.contact_id);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp',
          table: 'conversation_sla',
        },
        async (payload) => {
          const parsedNew = safeParseEvent(conversationSlaRowSchema, payload.new);
          if (!parsedNew.ok) {
            log.warn('conversation_sla INSERT payload rejeitado', parsedNew.error);
            return;
          }
          const newRecord = parsedNew.data as SLABreachPayload; // ignore-audit: narrows Supabase query result to local interface

          log.debug('New SLA record', { newRecord });

          // Check if already breached on insert
          if (newRecord.first_response_breached && newRecord.contact_id) {
            const breachKey = `fr-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification('first_response', newRecord.contact_id);
            }
          }

          if (newRecord.resolution_breached && newRecord.contact_id) {
            const breachKey = `res-${newRecord.id}`;
            if (!notifiedBreaches.current.has(breachKey)) {
              notifiedBreaches.current.add(breachKey);
              await handleBreachNotification('resolution', newRecord.contact_id);
            }
          }
        }
      )
      .subscribe((status) => {
        log.debug('Subscription status', { status });
      });

    return () => {
      log.debug('Cleaning up subscription');
      supabase.removeChannel(channel);
    };
  }, [user, settings, isQuietHours]);
};
