import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { queryKeys } from '@/services/api/queryKeys';
import { Message } from '@/types/chat';
import { isValidUUID } from '@/utils/uuid';

interface UseSLADeliveryProps {
  contactId: string;
  messages: Message[];
}

interface SLARule {
  warning_threshold_minutes?: number | null;
  breach_threshold_minutes?: number | null;
  custom_message?: string | null;
  is_active?: boolean | null;
}

/**
 * Hook: useSLADelivery.
 *
 * BUG-2026-08-06: a regra de entrega lê o CACHE COMPARTILHADO com
 * SLADeliveryConfigSection (mesmo queryKey `queryKeys.sla.deliveryConfig`) —
 * antes cada tick do intervalo fazia um GET cru de `sla_delivery_rules`
 * (2-4x por contato). A checagem de `is_active` é feita client-side.
 */
export function useSLADelivery({ contactId, messages }: UseSLADeliveryProps) {
  const { data: customRule } = useQuery<SLARule | null>({
    queryKey: queryKeys.sla.deliveryConfig(contactId),
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data: ruleRows } = await safeClient.from('sla_delivery_rules', (q) =>
        q.select('*').eq('contact_id', contactId).limit(1)
      );
      return (ruleRows?.[0] ?? null) as SLARule | null;
    },
  });

  // Query canônica não filtra is_active (o painel de config precisa ver regras
  // inativas para edição) — a regra ativa é decidida aqui no consumidor.
  const activeRule = customRule && customRule.is_active ? customRule : null;

  useEffect(() => {
    if (!contactId || !isValidUUID(contactId) || !messages.length) return;

    const checkDeliveryDelay = () => {
      const WARNING_THRESHOLD =
        ((activeRule?.warning_threshold_minutes as number) || 30) * 60 * 1000;
      const BREACH_THRESHOLD =
        ((activeRule?.breach_threshold_minutes as number) || 60) * 60 * 1000;
      const customMsg = activeRule?.custom_message as string | undefined;

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
        return;
      }

      const lastOutbound = [...messages]
        .reverse()
        .find((m) => m.sender === 'agent' && m.status === 'delivered');

      if (!lastOutbound) return;

      const deliveredAt = new Date(
        lastOutbound.updated_at ?? lastOutbound.timestamp
      ).getTime();
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
  }, [contactId, messages, messages.length, activeRule]);
}
