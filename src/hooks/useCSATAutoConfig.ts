import { useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';

export function useCSATAutoConfig() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: connections = [] } = useQuery({
    queryKey: queryKeys.adminOps.whatsappConnectionsCsat(),
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_connections').select('id, name, status');
      return data || [];
    },
  });

  const { data: config } = useQuery({
    queryKey: queryKeys.adminOps.csatAutoConfig(),
    queryFn: async () => {
      const { data } = await supabase
        .from('csat_auto_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? false);
  const [delayMinutes, setDelayMinutes] = useState(config?.delay_minutes ?? 5);
  const [template, setTemplate] = useState(
    config?.message_template ??
      'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐\n\n1️⃣ Péssimo\n2️⃣ Ruim\n3️⃣ Regular\n4️⃣ Bom\n5️⃣ Excelente',
  );
  const [connectionId, setConnectionId] = useState(config?.whatsapp_connection_id ?? '');

  // Sync state when data loads
  useState(() => {
    if (config) {
      setIsEnabled(config.is_enabled ?? false);
      setDelayMinutes(config.delay_minutes ?? 5);
      setTemplate(config.message_template ?? '');
      setConnectionId(config.whatsapp_connection_id ?? '');
    }
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        is_enabled: isEnabled,
        delay_minutes: delayMinutes,
        message_template: template,
        whatsapp_connection_id: connectionId || null,
        updated_by: profile?.id || null,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await supabase
          .from('csat_auto_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('csat_auto_config').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminOps.csatAutoConfig() });
      toast({
        title: 'Configuração CSAT salva!',
        description: 'As pesquisas de satisfação serão enviadas automaticamente.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });

  return {
    connections,
    config,
    isEnabled,
    setIsEnabled,
    delayMinutes,
    setDelayMinutes,
    template,
    setTemplate,
    connectionId,
    setConnectionId,
    saveMutation,
  };
}
