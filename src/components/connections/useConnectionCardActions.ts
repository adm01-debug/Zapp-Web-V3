import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import type { WhatsAppConnection } from '@/features/connections';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';

/** use Connection Card Actions component for the connections section. */
export function useConnectionCardActions(
  connection: WhatsAppConnection,
  onShowQrCode: (c: WhatsAppConnection) => void
) {
  const [recheckingHealth, setRecheckingHealth] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const { restartInstance, connectInstance } = useEvolutionApi();

  const handleReconnect = async () => {
    // Evolution API routes by instance NAME; using instance_id (UUID) causes 404
    // and the edge function's auto-create creates a ghost instance (incident wpp2 2026-07-04).
    const instanceName = evolutionInstanceName(connection);
    if (!instanceName) {
      toast({
        title: 'Conexão sem nome de instância',
        description: 'Cadastre o instance_name desta conexão antes de reconectar.',
        variant: 'destructive',
      });
      return;
    }
    setReconnecting(true);
    try {
      await restartInstance(instanceName);
      await new Promise((r) => setTimeout(r, 4000));
      const { data, error } = await supabase.functions.invoke('connection-health-check', {
        body: { instanceName },
      });
      if (error) throw error;
      const isStillClosed =
        data?.connections?.[0]?.socket_state === 'close' ||
        data?.connections?.[0]?.status === 'disconnected';
      if (isStillClosed) {
        toast({
          title: 'Ação automática',
          description: 'A instância ainda está desconectada. Gerando novo QR Code...',
        });
        await connectInstance(instanceName);
        onShowQrCode(connection);
      } else {
        toast({ title: 'Sucesso', description: 'Instância reconectada e operacional.' });
      }
    } catch (e: unknown) {
      toast({
        title: 'Erro ao reconectar',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setReconnecting(false);
    }
  };

  const handleRecheckNow = async () => {
    const instanceName = evolutionInstanceName(connection);
    if (!instanceName) return;
    setRecheckingHealth(true);
    try {
      const { error } = await supabase.functions.invoke('connection-health-check', {
        body: { instanceName },
      });
      if (error) throw error;
      toast({ title: 'Verificação concluída', description: 'O status foi atualizado.' });
    } catch (e: unknown) {
      toast({
        title: 'Falha na verificação',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setRecheckingHealth(false);
    }
  };

  return { handleReconnect, reconnecting, handleRecheckNow, recheckingHealth };
}
