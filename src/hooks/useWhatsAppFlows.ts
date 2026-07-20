import { useState, useEffect, useCallback } from 'react';
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

export function useWhatsAppFlows() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFlows = useCallback(async (): Promise<void> => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_flows')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setFlows(
        data.map((f) => ({
          ...f,
          screens: (Array.isArray(f.screens) ? f.screens : []) as unknown as FlowScreen[],
        })) as WhatsAppFlow[],
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

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
    await fetchFlows();
    return true;
  };

  const deleteFlow = async (id: string): Promise<void> => {
    await supabase.from('whatsapp_flows').delete().eq('id', id);
    toast({ title: 'Flow removido' });
    await fetchFlows();
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
