import { useEffect } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Message } from '@/types/chat';

interface UseSLADeliveryProps {
  contactId: string;
  messages: Message[];
}

export function useSLADelivery({ contactId, messages }: UseSLADeliveryProps) {
  useEffect(() => {
    if (!contactId || !messages.length) return;

    const checkDeliveryDelay = async () => {
      const { data: ruleRows } = await safeClient.from('sla_delivery_rules', (q) =>
        q.select('*').eq('contact_id', contactId).eq('is_active', true).limit(1)
      );
      const customRule = (ruleRows?.[0] ?? null) as any;

      const WARNING_THRESHOLD =
        ((customRule?.warning_threshold_minutes as number) || 30) * 60 * 1000;
      const BREACH_THRESHOLD = ((customRule?.breach_threshold_minutes as number) || 60) * 60 * 1000;
      const customMsg = customRule?.custom_message as string | undefined;

      const isSimulating = localStorage.getItem('zappweb:sla-simulation') === 'true';
      if (isSimulating) {
        window.dispatchEvent(
          new CustomEvent('sla-delivery-alert', {
            detail: {
              contactId,
              status: 'warning',
              delay: 35 * 60 * 1000,
              message: 'SIMULAÇÃO: Esta é uma mensagem de teste.',
            },
          })
        );
      }

      const lastOutbound = [...messages]
        .reverse()
        .find((m) => m.sender === 'agent' && m.status === 'delivered');

      if (!lastOutbound) return;

      const deliveredAt = new Date(lastOutbound.updated_at || Date.now()).getTime();
      const delay = Date.now() - deliveredAt;

      if (delay >= BREACH_THRESHOLD) {
        window.dispatchEvent(
          new CustomEvent('sla-delivery-alert', {
            detail: { contactId, status: 'breached', delay, message: customMsg || undefined },
          })
        );
      } else if (delay >= WARNING_THRESHOLD) {
        window.dispatchEvent(
          new CustomEvent('sla-delivery-alert', {
            detail: { contactId, status: 'warning', delay, message: customMsg || undefined },
          })
        );
      }
    };

    const interval = setInterval(checkDeliveryDelay, 60000);
    checkDeliveryDelay();
    return () => clearInterval(interval);
  }, [contactId, messages]);
}
