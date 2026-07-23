import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeWhatsAppConnectionsQuery } from '@/integrations/supabase/safe-queries';
import { toast } from '@/hooks/use-toast';

interface WalletRule {
  id: string;
  name: string;
  agent_id: string;
  whatsapp_connection_id: string | null;
  priority: number;
  is_active: boolean;
  agent?: { name: string };
  connection?: { name: string; phone_number: string } | null;
}

interface Profile {
  id: string;
  name: string;
}
interface Connection {
  id: string;
  name: string;
  phone_number: string;
}

const WALLET_KEY = ['client-wallet'] as const;

/** Manages client wallet rules for agent and WhatsApp connection assignment by priority. */
export function useClientWallet() {
  const queryClient = useQueryClient();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    agent_id: '',
    whatsapp_connection_id: '',
    priority: 0,
  });

  const { data, isLoading: loading } = useQuery({
    queryKey: WALLET_KEY,
    queryFn: async () => {
      const { data: rulesData } = await supabase
        .from('client_wallet_rules')
        .select('*')
        .order('priority', { ascending: false });

      const rawRules = rulesData ?? [];
      const agentIds = [...new Set(rawRules.map((r) => r.agent_id))];
      const connectionIds = [
        ...new Set(rawRules.map((r) => r.whatsapp_connection_id).filter(Boolean)),
      ] as string[];

      const [{ data: agentsData }, connectionsResult, { data: allAgents }, allConnectionsResult] =
        await Promise.all([
          supabase.from('profiles').select('id, name').in('id', agentIds),
          connectionIds.length > 0
            ? safeWhatsAppConnectionsQuery(supabase).getByIds(connectionIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('profiles').select('id, name').order('name'),
          safeWhatsAppConnectionsQuery(supabase).getList(),
        ]);

      const rules: WalletRule[] = rawRules.map((rule) => ({
        ...rule,
        agent: agentsData?.find((a) => a.id === rule.agent_id),
        connection: connectionsResult.data?.find((c) => c.id === rule.whatsapp_connection_id),
      }));

      return {
        rules,
        agents: (allAgents ?? []) as Profile[],
        connections: (allConnectionsResult.data ?? []) as unknown as Connection[],
      };
    },
    staleTime: 30_000,
  });

  const rules = data?.rules ?? [];
  const agents = data?.agents ?? [];
  const connections = data?.connections ?? [];

  const handleAddRule = useCallback(async () => {
    if (!newRule.name || !newRule.agent_id) {
      toast({
        title: 'Erro',
        description: 'Preencha o nome e selecione um vendedor.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('client_wallet_rules').insert({
      name: newRule.name,
      agent_id: newRule.agent_id,
      whatsapp_connection_id: newRule.whatsapp_connection_id || null,
      priority: newRule.priority,
    });
    if (error) {
      toast({ title: 'Erro ao criar regra', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Regra criada!', description: 'A regra de carteira foi adicionada.' });
      setIsAddDialogOpen(false);
      setNewRule({ name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 });
      void queryClient.invalidateQueries({ queryKey: WALLET_KEY });
    }
  }, [newRule, queryClient]);

  const handleToggleActive = useCallback(
    async (id: string, isActive: boolean) => {
      const { error } = await supabase
        .from('client_wallet_rules')
        .update({ is_active: isActive })
        .eq('id', id);
      if (!error) void queryClient.invalidateQueries({ queryKey: WALLET_KEY });
    },
    [queryClient]
  );

  const handleDeleteRule = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('client_wallet_rules').delete().eq('id', id);
      if (!error) {
        toast({ title: 'Regra excluída', description: 'A regra foi removida com sucesso.' });
        void queryClient.invalidateQueries({ queryKey: WALLET_KEY });
      }
    },
    [queryClient]
  );

  return {
    rules,
    agents,
    connections,
    loading,
    isAddDialogOpen,
    setIsAddDialogOpen,
    newRule,
    setNewRule,
    handleAddRule,
    handleToggleActive,
    handleDeleteRule,
  };
}

/** Re-exported module members. */
export type { WalletRule, Profile, Connection };