import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeSentimentAlerts() {
  useEffect(() => {
    const channel = supabase
      .channel('sentiment-alerts-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
          filter: 'action=eq.sentiment_alert',
        },
        () => {}
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return null;
}
