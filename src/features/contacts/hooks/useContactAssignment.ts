import { useCallback } from 'react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactAssignment');
import { dbFrom } from '@/integrations/datasource/db';

/** Hook: use Contact Assignment. */
export function useContactAssignment(contactId: string) {
  const assignAgent = useCallback(async (agentId: string | null) => {
    try {
      const { error } = await dbFrom('contacts')
        .update({ assigned_to: agentId })
        .eq('id', contactId);

      if (error) throw error;
      toast.success(agentId ? 'Atendente atribuído' : 'Atendente removido');
    } catch (err) {
      log.error('Error assigning agent:', err);
      toast.error('Erro ao atribuir atendente');
    }
  }, [contactId]);

  const assignQueue = useCallback(async (queueId: string | null) => {
    try {
      const { error } = await dbFrom('contacts')
        .update({ queue_id: queueId })
        .eq('id', contactId);

      if (error) throw error;
      toast.success(queueId ? 'Fila atribuída' : 'Fila removida');
    } catch (err) {
      log.error('Error assigning queue:', err);
      toast.error('Erro ao atribuir fila');
    }
  }, [contactId]);

  return { assignAgent, assignQueue };
}
