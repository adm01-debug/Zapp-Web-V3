import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';

export interface ScheduledMessage {
  id: string;
  contact_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  whatsapp_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useScheduledMessages(contactId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['scheduled-messages', contactId],
    queryFn: async () => {
      let query = supabase
        .from('scheduled_messages')
        .select('*')
        .order('scheduled_at', { ascending: true })
        .order('id', { ascending: true });

      if (contactId) {
        // Contact-scoped: capped at 200 — a single contact rarely schedules more.
        query = query.eq('contact_id', contactId).limit(200);
      } else {
        // Calendar view: scope to a rolling window (-30 days … +12 months) to
        // avoid loading the full historical backlog, capped at 1 000 rows.
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - 30);
        const windowEnd = new Date();
        windowEnd.setFullYear(windowEnd.getFullYear() + 1);
        query = query
          .gte('scheduled_at', windowStart.toISOString())
          .lte('scheduled_at', windowEnd.toISOString())
          .limit(1_000);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledMessage[];
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      scheduledAt: Date;
      messageType?: string;
      mediaUrl?: string;
      connectionId?: string;
    }) => {
      // Guard: calendar view only shows -30 days … +12 months. Reject scheduling
      // beyond that horizon so messages never silently disappear from the calendar.
      const calendarHorizon = new Date();
      calendarHorizon.setFullYear(calendarHorizon.getFullYear() + 1);
      if (data.scheduledAt > calendarHorizon) {
        throw new Error('Não é possível agendar mensagens com mais de 12 meses de antecedência.');
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle();

      const { data: msg, error: msgErr } = await supabase
        .from('scheduled_messages')
        .insert({
          contact_id: data.contactId,
          content: data.content,
          scheduled_at: data.scheduledAt.toISOString(),
          message_type: data.messageType || 'text',
          media_url: data.mediaUrl || null,
          created_by: profile?.id || null,
          whatsapp_connection_id: data.connectionId || null,
        })
        .select()
        .single();

      if (msgErr) throw msgErr;
      return msg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Mensagem agendada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao agendar mensagem', description: error.message, variant: 'destructive' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Agendamento cancelado' });
    },
  });

  return {
    messages,
    isLoading,
    scheduleMessage: scheduleMutation.mutateAsync,
    cancelMessage: cancelMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
  };
}