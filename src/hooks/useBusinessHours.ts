// @ts-nocheck
import { useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';

export interface BusinessHour {
  id?: string;
  whatsapp_connection_id: string;
  instance_name?: string;
  day_of_week: number;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
}

export interface AwayMessage {
  id?: string;
  whatsapp_connection_id: string;
  content: string;
  is_enabled: boolean;
}

const DEFAULT_HOURS: Omit<BusinessHour, 'whatsapp_connection_id'>[] = [
  { day_of_week: 0, is_enabled: false, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 1, is_enabled: true, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 2, is_enabled: true, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 3, is_enabled: true, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 4, is_enabled: true, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 5, is_enabled: true, start_time: '09:00', end_time: '18:00' },
  { day_of_week: 6, is_enabled: false, start_time: '09:00', end_time: '18:00' },
];

const DEFAULT_AWAY_MESSAGE: Omit<AwayMessage, 'whatsapp_connection_id'> = {
  content: 'Estamos fora do horário de atendimento. Retornaremos em breve!',
  is_enabled: true,
};

export function useBusinessHours(connectionId: string) {
  const queryClient = useQueryClient();

  // Fetch business hours
  const {
    data: businessHours,
    isLoading: loadingHours,
    refetch: refetchHours,
  } = useQuery({
    queryKey: ['business-hours', connectionId],
    queryFn: async () => {
      const { data, error } = await safeClient.from<BusinessHour>('business_hours', (q) =>
        q.select('*').eq('whatsapp_connection_id', connectionId).order('day_of_week')
      );

      if (error) throw error;

      // If no data, return defaults
      if (!data || data.length === 0) {
        return DEFAULT_HOURS.map((h) => ({ ...h, whatsapp_connection_id: connectionId }));
      }

      return data;
    },
    enabled: !!connectionId,
  });

  // Fetch away message
  const {
    data: awayMessage,
    isLoading: loadingAway,
    refetch: refetchAway,
  } = useQuery({
    queryKey: ['away-message', connectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('away_messages')
        .select('*')
        .eq('whatsapp_connection_id', connectionId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return { ...DEFAULT_AWAY_MESSAGE, whatsapp_connection_id: connectionId };
      }

      return data as AwayMessage;
    },
    enabled: !!connectionId,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({ hours, away }: { hours: BusinessHour[]; away: AwayMessage }) => {
      // Upsert business hours
      for (const hour of hours) {
        const { error } = await safeClient.from('business_hours', (q) =>
          q.upsert(
            {
              whatsapp_connection_id: connectionId,
              day_of_week: hour.day_of_week,
              is_enabled: hour.is_enabled,
              start_time: hour.start_time,
              end_time: hour.end_time,
            },
            { onConflict: 'whatsapp_connection_id,day_of_week' }
          )
        );
        if (error) throw error;
      }

      // Upsert away message
      const { error: awayError } = await supabase.from('away_messages').upsert(
        {
          whatsapp_connection_id: connectionId,
          content: away.content,
          is_enabled: away.is_enabled,
        },
        { onConflict: 'whatsapp_connection_id' }
      );

      if (awayError) throw awayError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-hours', connectionId] });
      queryClient.invalidateQueries({ queryKey: ['away-message', connectionId] });
      toast({
        title: 'Configurações salvas',
        description: 'Horário comercial atualizado com sucesso.',
      });
    },
    onError: (error) => {
      log.error('Error saving business hours:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    },
  });

  const saveSettings = useCallback(
    (hours: BusinessHour[], away: AwayMessage) => {
      return saveMutation.mutateAsync({ hours, away });
    },
    [saveMutation]
  );

  const stableBusinessHours = useMemo(() => businessHours || [], [businessHours]);
  const stableAwayMessage = useMemo(
    () => awayMessage || { ...DEFAULT_AWAY_MESSAGE, whatsapp_connection_id: connectionId },
    [awayMessage, connectionId]
  );

  return {
    businessHours: stableBusinessHours,
    awayMessage: stableAwayMessage,
    isLoading: loadingHours || loadingAway,
    isSaving: saveMutation.isPending,
    saveSettings,
    refetch: () => {
      refetchHours();
      refetchAway();
    },
  };
}