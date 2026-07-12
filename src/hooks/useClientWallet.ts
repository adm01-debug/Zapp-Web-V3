import { useState, useEffect, useCallback } from 'react';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

const log = getLogger('useClientWallet');

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

interface Profile { id: string; name: string; }
interface Connection { id: string; name: string; phone_number: string; }

export function useClientWallet() {
  const [rules, setRules] = useState<WalletRule[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from('client_wallet_rules').select('*').order('priority', { ascending: false });

      if (!rulesError && rulesData) {
        const agentIds = [...new Set(rulesData.map(r => r.agent_id))];
        const connectionIds = [...new Set(rulesData.map(r => r.whatsapp_connection_id).filter(Boolean))];

        const { data: agentsData } = await supabase.from('profiles').select('id, name').in('id', agentIds);
        const { data: connectionsData } = connectionIds.length > 0
          ? await supabase.from('whatsapp_connections').select('id, name, phone_number').in('id', connectionIds)
          : { data: [] };

        setRules(rulesData.map(rule => ({
          ...rule,
          agent: agentsData?.find(a => a.id === rule.agent_id),
          connection: connectionsData?.find(c => c.id === rule.whatsapp_connection_id),
        })));
      }

      const { data: allAgents } = await supabase.from('profiles').select('id, name').order('name');
      if (allAgents) setAgents(allAgents);

      const { data: allConnections } = await supabase.from('whatsapp_connections').select('id, name, phone_number').order('name');
      if (allConnections) setConnections(allConnections);
    } catch (err) {
      log.error('Failed to fetch client wallet data:', err);
      toast({ title: 'Erro', description: 'Falha ao carregar dados da carteira.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData().catch((err) => log.error('Failed to fetch client wallet on mount:', err)); }, [fetchData]);

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.agent_id) {
      toast({ title: 'Erro', description: 'Preencha o nome e selecione um vendedor.', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('client_wallet_rules').insert({
        name: newRule.name, agent_id: newRule.agent_id,
        whatsapp_connection_id: newRule.whatsapp_connection_id || null, priority: newRule.priority,
      });
      if (error) {
        toast({ title: 'Erro ao criar regra', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Regra criada!', description: 'A regra de carteira foi adicionada.' });
        setIsAddDialogOpen(false);
        setNewRule({ name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 });
        await fetchData();
      }
    } catch (err) {
      log.error('Failed to add wallet rule:', err);
      toast({ title: 'Erro', description: 'Falha ao criar regra.', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from('client_wallet_rules').update({ is_active: isActive }).eq('id', id);
      if (!error) setRules(rules.map(r => r.id === id ? { ...r, is_active: isActive } : r));
      else log.error('Failed to toggle wallet rule active:', error);
    } catch (err) {
      log.error('Failed to toggle wallet rule active:', err);
      toast({ title: 'Erro', description: 'Falha ao atualizar regra.', variant: 'destructive' });
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      const { error } = await supabase.from('client_wallet_rules').delete().eq('id', id);
      if (!error) {
        setRules(rules.filter(r => r.id !== id));
        toast({ title: 'Regra excluída', description: 'A regra foi removida com sucesso.' });
      } else {
        log.error('Failed to delete wallet rule:', error);
        toast({ title: 'Erro', description: 'Falha ao excluir regra.', variant: 'destructive' });
      }
    } catch (err) {
      log.error('Failed to delete wallet rule:', err);
      toast({ title: 'Erro', description: 'Falha ao excluir regra.', variant: 'destructive' });
    }
  };

  return {
    rules, agents, connections, loading,
    isAddDialogOpen, setIsAddDialogOpen,
    newRule, setNewRule,
    handleAddRule, handleToggleActive, handleDeleteRule,
  };
}

export type { WalletRule, Profile, Connection };
