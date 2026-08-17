/**
 * NOTA (CAMPANHAS-09 — FIX 2026-08-17, Etapa 65):
 *  - RLS: policies INSERT/UPDATE criadas em 20260817240000_etapa65_scheduled_messages_rls.sql
 *    (padrão favorite_contacts, tenant-based) — o 403 silencioso em scheduleMutation
 *    e cancelMutation não ocorre mais; erros RLS residuais agora viram toast
 *    EXPLÍCITO com mensagem clara (isRlsDeniedError → rlsDeniedMessage).
 *  - Lista: erro do useQuery (ex.: 403) não fica mais silencioso — exposto via
 *    `isError`/`error` e toast único por erro RLS.
 *  - Dispatcher: zapp.fn_dispatch_scheduled_messages() + cron
 *    'scheduled-messages-dispatch' (20260817250000_etapa65_scheduled_dispatch_cron.sql).
 *  - status 'sending' adicionado à união (bookkeeping do claim atômico do dispatcher).
 */
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { queryKeys } from '@/services/api/queryKeys';
import { isValidUUID } from '@/utils/uuid';
import { isRlsDeniedError, rlsDeniedMessage } from '@/lib/errors/rlsError';

/** Scheduled Message interface definition. */
export interface ScheduledMessage {
  id: string;
  contact_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  scheduled_at: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  created_by: string | null;
  whatsapp_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Mensagem amigável para erro de agendamento; RLS vira toast real, sem silêncio. */
function scheduleErrorMessage(error: unknown): string {
  if (isRlsDeniedError(error)) {
    return `${rlsDeniedMessage('mensagens agendadas')} Verifique se o contato está visível para você.`;
  }
  if (error instanceof Error) return error.message;
  return 'Erro inesperado ao agendar mensagem.';
}

/** Manages scheduled WhatsApp messages with schedule, cancel, and list operations. */
export function useScheduledMessages(contactId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Guarda o último erro RLS já sinalizado por toast (evita toast repetido a
  // cada re-render/refetch enquanto o erro persistir).
  const lastRlsToastRef = useRef<string | null>(null);

  const {
    data: messages = [],
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.scheduledMessages.contact(contactId),
    // Sem contactId → listagem global (ScheduleCalendarView agenda por data, sem filtro de contato).
    // Com contactId → só busca se for UUID válido (evita queries inválidas no perfil de contato).
    enabled: !contactId || isValidUUID(contactId),
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('scheduled_messages')
        .select('*')
        .order('scheduled_at', { ascending: true });

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ScheduledMessage[]; // ignore-audit: narrows status from string to union
    },
  });

  // 403 silencioso na LISTAGEM (calendário vazio sem explicação): toast real.
  useEffect(() => {
    if (isError && isRlsDeniedError(queryError)) {
      const key = queryError instanceof Error ? queryError.message : String(queryError);
      if (lastRlsToastRef.current !== key) {
        lastRlsToastRef.current = key;
        toast({
          title: 'Não foi possível carregar os agendamentos',
          description: rlsDeniedMessage('mensagens agendadas'),
          variant: 'destructive',
        });
      }
    }
  }, [isError, queryError]);

  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      contactId: string;
      content: string;
      scheduledAt: Date;
      messageType?: string;
      mediaUrl?: string;
      connectionId?: string;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      if (data.scheduledAt <= new Date()) {
        throw new Error('A data de agendamento deve ser no futuro');
      }

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;

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
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (msgErr) throw msgErr;
      return msg;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledMessages.all() });
      toast({ title: 'Mensagem agendada com sucesso!' });
    },
    onError: (error: Error) => {
      // Toast REAL em 403 — nunca silenciar (CAMPANHAS-09).
      toast({
        title: 'Erro ao agendar mensagem',
        description: scheduleErrorMessage(error),
        variant: 'destructive',
      });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduledMessages.all() });
      toast({ title: 'Agendamento cancelado' });
    },
    onError: (e: Error) => {
      // Toast REAL em 403 — nunca silenciar (CAMPANHAS-09).
      toast({
        title: 'Erro ao cancelar',
        description: scheduleErrorMessage(e),
        variant: 'destructive',
      });
    },
  });

  return {
    messages,
    isLoading,
    isError,
    error: queryError,
    scheduleMessage: scheduleMutation.mutateAsync,
    cancelMessage: cancelMutation.mutateAsync,
    isScheduling: scheduleMutation.isPending,
  };
}
