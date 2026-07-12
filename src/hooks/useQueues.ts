// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient, safeFrom } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { dbFrom } from '@/integrations/datasource/db';
import { useMountedRef } from '@/hooks/useMountedRef';

export interface Queue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  max_wait_time_minutes: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  is_active: boolean;
  created_at: string;
  profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_active: boolean;
  };
}

export interface QueueWithMembers extends Queue {
  members: QueueMember[];
  waiting_count: number;
}

export function useQueues() {
  const [queues, setQueues] = useState<QueueWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const mountedRef = useMountedRef();

  const fetchQueues = async () => {
    try {
      setLoading(true);

      // Fetch queues
      const { data: queuesData, error: queuesError } = await safeFrom('queues')
        .select('*')
        .order('priority', { ascending: false });
      if (!mountedRef.current) return;

      if (queuesError) throw queuesError;

      // Fetch queue members with profiles
      const { data: membersData, error: membersError } = await safeClient.from<QueueMember>(
        'queue_members',
        (q) => q.select('*, profile:profiles(id, name, avatar_url, is_active)')
      );
      if (!mountedRef.current) return;

      if (membersError) throw membersError;

      // Fetch waiting counts per queue.
      // Fonte correta: queue_positions (fila de espera real). contacts.queue_id é
      // NULL::uuid hardcoded na view do repoint layer => a contagem antiga era
      // eternamente 0. Mesma fonte usada pelo rpc_queue_sla_panel v2.
      const { data: waitingData, error: waitingError } =
        await dbFrom('queue_positions').select('queue_id');
      if (!mountedRef.current) return;

      if (waitingError) throw waitingError;

      // Count waiting per queue
      const waitingCounts: Record<string, number> = {};
      (waitingData as { queue_id: string | null }[] | null)?.forEach((row) => {
        if (row.queue_id) {
          waitingCounts[row.queue_id] = (waitingCounts[row.queue_id] || 0) + 1;
        }
      });

      // Combine data
      const queuesWithMembers: QueueWithMembers[] = (queuesData || []).map((queue) => ({
        ...queue,
        members: (membersData || []).filter((m) => m.queue_id === queue.id) as QueueMember[],
        waiting_count: waitingCounts[queue.id] || 0,
      }));

      setQueues(queuesWithMembers);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      log.error('Error fetching queues:', err);
      setError(err as Error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const createQueue = async (queue: Partial<Queue>) => {
    try {
      const { data, error } = await safeFrom('queues')
        .insert({
          name: queue.name!,
          description: queue.description,
          color: queue.color || '#3B82F6',
          max_wait_time_minutes: queue.max_wait_time_minutes || 30,
          priority: queue.priority || 0,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Fila criada',
        description: `A fila "${queue.name}" foi criada com sucesso.`,
      });

      await fetchQueues();
      return data;
    } catch (err) {
      log.error('Error creating queue:', err);
      toast({
        title: 'Erro ao criar fila',
        description: 'Não foi possível criar a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const updateQueue = async (id: string, updates: Partial<Queue>) => {
    try {
      const { error } = await safeFrom('queues').update(updates).eq('id', id);

      if (error) throw error;

      toast({
        title: 'Fila atualizada',
        description: 'A fila foi atualizada com sucesso.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error updating queue:', err);
      toast({
        title: 'Erro ao atualizar fila',
        description: 'Não foi possível atualizar a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const deleteQueue = async (id: string) => {
    try {
      const { error } = await safeFrom('queues').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Fila excluída',
        description: 'A fila foi excluída com sucesso.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error deleting queue:', err);
      toast({
        title: 'Erro ao excluir fila',
        description: 'Não foi possível excluir a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const addMember = async (queueId: string, profileId: string) => {
    try {
      const { error } = await safeFrom('queue_members').insert({
        queue_id: queueId,
        profile_id: profileId,
      });

      if (error) throw error;

      toast({
        title: 'Membro adicionado',
        description: 'O atendente foi adicionado à fila.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error adding member:', err);
      toast({
        title: 'Erro ao adicionar membro',
        description: 'Não foi possível adicionar o atendente.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const removeMember = async (queueId: string, profileId: string) => {
    try {
      const { error } = await safeFrom('queue_members')
        .delete()
        .eq('queue_id', queueId)
        .eq('profile_id', profileId);

      if (error) throw error;

      toast({
        title: 'Membro removido',
        description: 'O atendente foi removido da fila.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error removing member:', err);
      toast({
        title: 'Erro ao remover membro',
        description: 'Não foi possível remover o atendente.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const assignContactToQueue = async (contactId: string, queueId: string | null) => {
    try {
      const { error } = await dbFrom('contacts')
        .update({ queue_id: queueId, assigned_to: null })
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: queueId ? 'Contato atribuído' : 'Contato removido da fila',
        description: queueId
          ? 'O contato foi atribuído à fila e será distribuído automaticamente.'
          : 'O contato foi removido da fila.',
      });
    } catch (err) {
      log.error('Error assigning contact:', err);
      toast({
        title: 'Erro ao atribuir contato',
        description: 'Não foi possível atribuir o contato à fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  useEffect(() => {
    void fetchQueues();

    // Subscribe to realtime changes — unique channel name per hook instance
    // to avoid "cannot add 'postgres_changes' callbacks after subscribe()" when
    // multiple consumers (e.g. ContactDetails + sidebar) mount in parallel.
    const channelName = `queues-changes:${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const queuesChannel = supabase
      .channel(channelName)
      // public.queues / public.queue_members são VIEWS (repoint layer) — o realtime
      // só emite WAL da tabela-base. Bases zapp.* estão na publicação supabase_realtime
      // com RLS SELECT p/ authenticated; o callback não lê payload, só refetcha.
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queues' }, fetchQueues)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_members' }, fetchQueues)
      .subscribe();

    return () => {
      supabase.removeChannel(queuesChannel);
    };
  }, []);

  return {
    queues,
    loading,
    error,
    createQueue,
    updateQueue,
    deleteQueue,
    addMember,
    removeMember,
    assignContactToQueue,
    refetch: fetchQueues,
  };
}
