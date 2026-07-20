import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import type { Json } from '@/integrations/supabase/schema';

export interface ChatbotL1Variables {
  confidence_threshold: number;
  welcome_message: string;
  transfer_message: string;
}

export function useChatbotL1Config() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: flow } = useQuery({
    queryKey: queryKeys.chatbot.l1Flow(),
    queryFn: async () => {
      const { data } = await supabase
        .from('chatbot_flows')
        .select('*')
        .eq('trigger_type', 'ai_l1')
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: kbCount = 0 } = useQuery({
    queryKey: queryKeys.adminOps.kbArticleCount(),
    queryFn: async () => {
      const { count } = await supabase
        .from('knowledge_base_articles')
        .select('id', { count: 'exact', head: true })
        .eq('is_published', true);
      return count || 0;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      name,
      isActive,
      variables,
    }: {
      name: string;
      isActive: boolean;
      variables: ChatbotL1Variables;
    }) => {
      if (flow?.id) {
        const { error } = await supabase
          .from('chatbot_flows')
          .update({
            name,
            is_active: isActive,
            variables: variables as Json,
            updated_at: new Date().toISOString(),
          })
          .eq('id', flow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chatbot_flows').insert({
          name,
          is_active: isActive,
          trigger_type: 'ai_l1',
          trigger_value: 'auto',
          variables: variables as Json,
          nodes: [],
          edges: [],
          created_by: profile?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chatbot.l1Flow() });
      queryClient.invalidateQueries({ queryKey: queryKeys.chatbotFlows.all() });
      toast({
        title: 'Chatbot IA salvo!',
        description: 'O assistente L1 foi configurado com sucesso.',
      });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  return { flow, kbCount, saveMutation };
}
