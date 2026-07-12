// @ts-nocheck
import { useCallback } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import { whatsappConnectionService } from '../../services/whatsappConnectionService';
import { getLogger } from '@/lib/logger';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import type { WhatsAppConnection, WhatsAppApiType } from '../useConnectionsManager';

const log = getLogger('useConnectionsActions');

export interface NewConnectionForm {
  name: string;
  phone_number: string;
  api_type: WhatsAppApiType;
}

export function useConnectionsActions(
  connections: WhatsAppConnection[],
  setConnections: (updater: (prev: WhatsAppConnection[]) => WhatsAppConnection[]) => void,
  setIsCreating: (v: boolean) => void,
  setIsAddDialogOpen: (v: boolean) => void,
  setNewConnection: (v: NewConnectionForm) => void,
  handleShowQrCode: (conn: WhatsAppConnection) => void,
  disconnectInstance: (instance: string) => Promise<unknown>,
  deleteInstance: (instance: string) => Promise<unknown>,
  newConnection: NewConnectionForm
) {
  const { toast } = useToast();

  const handleAddConnection = useCallback(async () => {
    if (!newConnection.name) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    
    setIsCreating(true);
    const isOfficial = newConnection.api_type === 'official';
    const instanceName = isOfficial ? `official_${Date.now().toString(36)}` : whatsappConnectionService.generateInstanceName(newConnection.name);
    
    try {
      const { data, error } = await safeClient.single<Record<string, unknown>>('whatsapp_connections', q =>
        q.insert({
          name: newConnection.name,
          phone_number: newConnection.phone_number,
          instance_id: instanceName,
          instance_name: instanceName,
          status: 'disconnected',
          is_default: connections.length === 0,
          api_type: newConnection.api_type,
        }).select()
      );
      
      if (error) throw error;
      
      setConnections(prev => [...prev, data]);
      
      toast({
        title: 'Conexão criada!',
        description: isOfficial
          ? 'Configure as credenciais da API oficial (Meta) nas configurações da conexão.'
          : 'Agora conecte escaneando o QR Code.',
      });
      setIsAddDialogOpen(false);
      setNewConnection({ name: '', phone_number: '', api_type: 'evolution' });
      if (data && !isOfficial) handleShowQrCode(data);
    } catch (error) {
      log.error('Error creating connection:', error);
      toast({ title: 'Erro ao criar conexão', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  }, [newConnection, connections, setIsAddDialogOpen, setNewConnection, handleShowQrCode, toast, setIsCreating, setConnections]);

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await safeClient.from('whatsapp_connections', q => q.update({ is_default: false }).neq('id', id));
      const { error } = await safeClient.from('whatsapp_connections', q => q.update({ is_default: true }).eq('id', id));
      if (error) throw error;
      setConnections(prev => prev.map(c => ({ ...c, is_default: c.id === id })));
      toast({ title: 'Conexão padrão atualizada' });
    } catch (error) {
      toast({ title: 'Erro ao definir padrão', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }
  }, [setConnections, toast]);

  const handleDelete = useCallback(async (connection: WhatsAppConnection) => {
    try {
      // Evolution roteia por nome de instância — o UUID (instance_id) gera 404.
      const evoName = evolutionInstanceName(connection);
      if (evoName) {
        await deleteInstance(evoName).catch(e => log.warn('Failed to delete evolution instance:', e));
      }
      const { error } = await safeClient.from('whatsapp_connections', q => q.delete().eq('id', connection.id));
      if (error) throw error;
      setConnections(prev => prev.filter(c => c.id !== connection.id));
      toast({ title: 'Conexão removida' });
    } catch (error) {
      toast({ title: 'Erro ao deletar', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }
  }, [setConnections, toast, deleteInstance]);

  return {
    handleCreateConnection: handleAddConnection,
    handleDeleteConnection: handleDelete,
    handleSetDefault,
    handleAddConnection,
    handleDelete,
  };
}
