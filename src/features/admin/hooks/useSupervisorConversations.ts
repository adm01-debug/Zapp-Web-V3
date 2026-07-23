/**
 * useSupervisorConversations
 *
 * Carrega conversas abertas para o painel do supervisor, calcula prioridade
 * e expõe mutations para redirecionar (trocar agente/fila).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  computePriority,
  sortByPriority,
  type PriorityInfo,
  type SupervisorConversationInput,
} from '../lib/supervisorPriority';

/** Supervisor Conversation Row interface definition. */
export interface SupervisorConversationRow extends SupervisorConversationInput {
  agentName: string | null;
  queueName: string | null;
  priority: PriorityInfo;
}

/** Agent Option interface definition. */
export interface AgentOption {
  id: string;
  name: string;
  role: string;
}

/** Queue Option interface definition. */
export interface QueueOption {
  id: string;
  name: string;
}

interface ContactsResp {
  id: string; name: string; phone: string;
  assigned_to: string | null; queue_id: string | null;
  ai_priority: string | null; risk_score: number | null;
  updated_at: string;
}

const SUPERVISOR_ROLES = ['agent', 'supervisor', 'admin', 'manager'];

/** use Supervisor Conversations function. */
export function useSupervisorConversations() {
  const [rows, setRows] = useState<SupervisorConversationRow[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [queues, setQueues] = useState<QueueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [contactsRes, profilesRes, queuesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, name, phone, assigned_to, queue_id, ai_priority, risk_score, updated_at')
          .order('updated_at', { ascending: false })
          .limit(200),
        (supabase.from('profiles') as unknown as {
          select: (c: string) => {
            eq: (c: string, v: unknown) => {
              in: (c: string, v: string[]) => Promise<{ data: AgentOption[] | null; error: unknown }>;
            };
          };
        })
          .select('id, name, role')
          .eq('is_active', true)
          .in('role', SUPERVISOR_ROLES),
        supabase.from('queues').select('id, name').limit(100),
      ]);

      if (contactsRes.error) throw contactsRes.error;

      const agentList = ((profilesRes.data ?? []) as unknown as AgentOption[]).filter(Boolean);
      const queueList = ((queuesRes.data ?? []) as unknown as QueueOption[]).filter(Boolean);
      const agentMap = new Map(agentList.map((a) => [a.id, a.name]));
      const queueMap = new Map(queueList.map((q) => [q.id, q.name]));

      const contacts = ((contactsRes.data ?? []) as unknown as ContactsResp[]);
      const now = new Date();
      const enriched = contacts.map<SupervisorConversationRow>((c) => ({
        ...c,
        agentName: c.assigned_to ? agentMap.get(c.assigned_to) ?? null : null,
        queueName: c.queue_id ? queueMap.get(c.queue_id) ?? null : null,
        priority: computePriority(c, now),
      }));

      setRows(sortByPriority(enriched));
      setAgents(agentList);
      setQueues(queueList);
      setRefreshedAt(new Date());
    } catch (err) {
      logger.error('[SupervisorCopilot] Falha ao carregar conversas', err);
      toast.error('Não foi possível carregar conversas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateContact = useCallback(async (contactId: string, patch: Record<string, unknown>) => {
    const q = supabase.from('contacts') as unknown as {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
    };
    return q.update(patch).eq('id', contactId);
  }, []);

  const reassignAgent = useCallback(async (contactId: string, agentId: string | null) => {
    try {
      const { error } = await updateContact(contactId, { assigned_to: agentId });
      if (error) throw error;
      toast.success(agentId ? 'Conversa redirecionada' : 'Conversa desatribuída');
      await load();
    } catch (err) {
      logger.error('[SupervisorCopilot] reassignAgent', err);
      toast.error('Erro ao redirecionar conversa');
    }
  }, [load, updateContact]);

  const moveQueue = useCallback(async (contactId: string, queueId: string | null) => {
    try {
      const { error } = await updateContact(contactId, { queue_id: queueId, assigned_to: null });
      if (error) throw error;
      toast.success('Conversa movida para nova fila');
      await load();
    } catch (err) {
      logger.error('[SupervisorCopilot] moveQueue', err);
      toast.error('Erro ao mover para fila');
    }
  }, [load, updateContact]);

  const summary = useMemo(() => {
    const s = { critical: 0, high: 0, medium: 0, normal: 0 };
    for (const r of rows) s[r.priority.level] += 1;
    return s;
  }, [rows]);

  return { rows, agents, queues, loading, refreshedAt, summary, reload: load, reassignAgent, moveQueue };
}
