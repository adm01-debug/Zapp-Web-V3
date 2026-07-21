// @ts-nocheck
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/schema';

export interface FlowScreen {
  id: string;
  title: string;
  layout: unknown[];
}

export interface WhatsAppFlow {
  id: string;
  name: string;
  description: string | null;
  flow_json: Json;
  screens: FlowScreen[];
  status: string;
  whatsapp_flow_id: string | null;
  created_at: string;
}

const FLOWS_KEY = ['whatsapp-flows'] as const;

export function useWhatsAppFlows() {
  const queryClient = useQueryClient();

  const { data: flows = [], isLoading: loading } = useQuery({
    queryKey: FLOWS_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_flows')
        .select('*')
        .order('created_at', { ascending: false });
      return (data ?? []).map((f) => ({
        ...f,
        screens: (Array.isArray(f.screens) ? f.screens : []) as unknown as FlowScreen[],
      })) as WhatsAppFlow[];
    },
    staleTime: 30_000,
  });

  const fetchFlows = useCallback(
    () => queryClient.invalidateQueries({ queryKey: FLOWS_KEY }),
    [queryClient]
  );

  const createFlow = async (
    name: string,
    description: string,
    defaultScreens: FlowScreen[],
  ): Promise<boolean> => {
    const { error } = await supabase.from('whatsapp_flows').insert({
      name,
      description: description || null,
      screens:
        defaultScreens as Json /* ignore-audit: local Screen[] type widened to Supabase Json column type */,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: 'Flow criado!' });
    await queryClient.invalidateQueries({ queryKey: FLOWS_KEY });
    return true;
  };

  const deleteFlow = async (id: string): Promise<void> => {
    await supabase.from('whatsapp_flows').delete().eq('id', id);
    toast({ title: 'Flow removido' });
    await queryClient.invalidateQueries({ queryKey: FLOWS_KEY });
  };

  const updateFlowScreens = async (flowId: string, screens: FlowScreen[]): Promise<void> => {
    await supabase
      .from('whatsapp_flows')
      .update({
        screens:
          screens as Json /* ignore-audit: local Screen[] type widened to Supabase Json column type */,
      })
      .eq('id', flowId);
  };

  return { flows, loading, fetchFlows, createFlow, deleteFlow, updateFlowScreens };
}