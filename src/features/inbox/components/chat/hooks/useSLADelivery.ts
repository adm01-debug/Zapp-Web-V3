// @ts-nocheck
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Message } from '@/types/chat';

interface UseSLADeliveryProps {
  contactId: string;
  messages: Message[];
}

export function useSLADelivery({ contactId, messages }: UseSLADeliveryProps) {
  useEffect(() => {
    if (!contactId || !messages.length) return;
    
    const checkDeliveryDelay = async () => {
      const { data: customRule } = await supabase
        .from('sla_delivery_rules')
        .select('*')
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .maybeSingle();

      const WARNING_THRESHOLD = (customRule?.warning_threshold_minutes || 30) * 60 * 1000;
      const BREACH_THRESHOLD = (customRule?.breach_threshold_minutes || 60) * 60 * 1000;
      const customMsg = customRule?.custom_message;
      
      const isSimulating = localStorage.getItem('zappweb:sla-simulation') === 'true';
      if (isSimulating) {
        window.dispatchEvent(new CustomEvent('sla-delivery-alert', { 
          detail: { contactId, status: 'warning', delay: 35 * 60 * 1000, message: 'SIMULAÇÃO: Esta é uma mensagem de teste.' } 
        }));
      }

      const lastOutbound = [...messages].reverse().find(m => 
        m.sender === 'agent' && 
        m.status === 'delivered'
      );
      
      if (!lastOutbound) return;
      
      const deliveredAt = new Date(lastOutbound.updated_at).getTime();
      const delay = Date.now() - deliveredAt;
      
      if (delay >= BREACH_THRESHOLD) {
        window.dispatchEvent(new CustomEvent('sla-delivery-alert', { 
          detail: { contactId, status: 'breached', delay, message: customMsg || undefined } 
        }));
      } else if (delay >= WARNING_THRESHOLD) {
        window.dispatchEvent(new CustomEvent('sla-delivery-alert', { 
          detail: { contactId, status: 'warning', delay, message: customMsg || undefined } 
        }));
      }
    };
    
    const interval = setInterval(checkDeliveryDelay, 60000);
    checkDeliveryDelay();
    return () => clearInterval(interval);
  }, [contactId, messages]);
}