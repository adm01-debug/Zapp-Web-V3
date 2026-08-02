import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import { whatsappConnectionService } from '../../services/whatsappConnectionService';
import { getLogger } from '@/lib/logger';
import { validatePhoneDetailed } from '@/lib/phoneUtils';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import { queryKeys } from '@/services/api/queryKeys';
import type { WhatsAppApiType, WhatsAppConnection } from '../types';

const log = getLogger('useConnectionsActions');

type NewConnectionForm = { name: string; phone_number: string; api_type: WhatsAppApiType };

/** Hook: use Connections Actions. */
export function useConnectionsActions(
  connections: WhatsAppConnection[],
  setConnections: Dispatch<SetStateAction<WhatsAppConnection[]>>,
  setIsCreating: Dispatch<SetStateAction<boolean>>,
  setIsAddDialogOpen: Dispatch<SetStateAction<boolean>>,
  setNewConnection: Dispatch<SetStateAction<NewConnectionForm>>,
  handleShowQrCode: (conn: WhatsAppConnection) => void | Promise<void>,
  disconnectInstance: (instance: string) => Promise<unknown>,
  deleteInstance: (instance: string) => Promise<unknown>,
  newConnection: NewConnectionForm
) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateConnectionsCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.talkx.waConnections() });
  }, [queryClient]);

  const handleAddConnection = useCallback(async () => {
    if (!newConnection.name) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }

    // F6-29: phone_number obrigatório e em formato brasileiro — phone vazio/inválido
    // quebra o match do useEvolutionAutoSync (cria duplicatas).
    const phoneValidation = validatePhoneDetailed(newConnection.phone_number);
    if (!phoneValidation.valid) {
      toast({
        title: 'Número de telefone inválido',
        description:
          phoneValidation.error ?? 'Informe um número brasileiro válido (ex.: 11 99999-9999).',
        variant: 'destructive',
      });
      return;
    }
    const normalizedPhone = phoneValidation.normalized ?? newConnection.phone_number.trim();

    setIsCreating(true);
    const isOfficial = newConnection.api_type === 'official';
    const instanceName = isOfficial
      ? `official_${Date.now().toString(36)}`
      : whatsappConnectionService.generateInstanceName(newConnection.name);

    try {
      const { data, error } = await safeClient.single<Record<string, unknown>>(
        'whatsapp_connections',
        (q) =>
          q
            .insert({
              name: newConnection.name,
              phone_number: normalizedPhone,
              instance_id: instanceName,
              instance_name: instanceName,
              status: 'disconnected',
              is_default: connections.length === 0,
              api_type: newConnection.api_type,
            })
            .select()
      );

      if (error) throw error;

      setConnections((prev) => [...prev, data as unknown as WhatsAppConnection]);

      toast({
        title: 'Conexão criada!',
        description: isOfficial
          ? 'Configure as credenciais da API oficial (Meta) nas configurações da conexão.'
          : 'Agora conecte escaneando o QR Code.',
      });
      setIsAddDialogOpen(false);
      setNewConnection({ name: '', phone_number: '', api_type: 'evolution' });
      invalidateConnectionsCaches();
      if (data && !isOfficial) void handleShowQrCode(data as unknown as WhatsAppConnection);
    } catch (error: unknown) {
      log.error('Error creating connection:', error);
      const msg = error instanceof Error ? error.message : String(error);
      toast({ title: 'Erro ao criar conexão', description: msg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  }, [
    newConnection,
    connections,
    setIsAddDialogOpen,
    setNewConnection,
    handleShowQrCode,
    toast,
    setIsCreating,
    setConnections,
    invalidateConnectionsCaches,
  ]);

  const handleSetDefault = useCallback(
    async (id: string) => {
      try {
        await safeClient.from('whatsapp_connections', (q) =>
          q.update({ is_default: false }).neq('id', id)
        );
        const { error } = await safeClient.from('whatsapp_connections', (q) =>
          q.update({ is_default: true }).eq('id', id)
        );
        if (error) throw error;
        setConnections((prev) => prev.map((c) => ({ ...c, is_default: c.id === id })));
        invalidateConnectionsCaches();
        toast({ title: 'Conexão padrão atualizada' });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        toast({ title: 'Erro ao definir padrão', description: msg, variant: 'destructive' });
      }
    },
    [setConnections, toast, invalidateConnectionsCaches]
  );

  const handleDelete = useCallback(
    async (connection: WhatsAppConnection) => {
      try {
        // Evolution roteia por nome de instância — o UUID (instance_id) gera 404.
        const evoName = evolutionInstanceName(connection);
        if (evoName) {
          try {
            await deleteInstance(evoName);
          } catch (error: unknown) {
            // F6-28: não engolir erro da Evolution — classificar e reagir.
            const status = (error as { apiStatus?: number }).apiStatus;
            if (status === 404) {
              // Instância já não existe na Evolution — pode seguir com o delete no banco.
              log.info(
                `Instância Evolution ${evoName} já não existe (404); seguindo com o delete no banco.`
              );
            } else if (
              status == null ||
              status >= 500 ||
              status === 408 ||
              status === 425 ||
              status === 429
            ) {
              // 5xx / timeout / falha de rede: erro retriável — NÃO deleta no banco;
              // marca a conexão para retry (flag em settings) e preserva o registro.
              const msg = error instanceof Error ? error.message : String(error);
              log.warn(
                `Falha retriável ao deletar instância Evolution ${evoName} (status ${status ?? 'timeout/network'}); marcando para retry.`,
                error
              );
              const { error: updateError } = await safeClient.from('whatsapp_connections', (q) =>
                q
                  .update({
                    settings: {
                      ...((
                        connection as WhatsAppConnection & {
                          settings?: Record<string, unknown>;
                        }
                      ).settings ?? {}),
                      delete_pending: true,
                      delete_pending_at: new Date().toISOString(),
                      delete_pending_error: msg,
                    },
                  })
                  .eq('id', connection.id)
              );
              if (updateError) {
                log.warn('Falha ao marcar conexão para retry de delete:', updateError);
              }
              toast({
                title: 'Remoção adiada',
                description:
                  'A instância ainda existe na Evolution API. A conexão foi mantida e a remoção será tentada novamente.',
                variant: 'destructive',
              });
              return;
            } else {
              // 4xx terminal (auth/perms): aborta o delete no banco e alerta o usuário.
              log.error(
                `Evolution rejeitou o delete da instância ${evoName} (status ${status}); abortando o delete no banco.`,
                error
              );
              throw error;
            }
          }
        }
        const { error } = await safeClient.from('whatsapp_connections', (q) =>
          q.delete().eq('id', connection.id)
        );
        if (error) throw error;
        setConnections((prev) => prev.filter((c) => c.id !== connection.id));
        invalidateConnectionsCaches();
        toast({ title: 'Conexão removida' });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        toast({ title: 'Erro ao deletar', description: msg, variant: 'destructive' });
      }
    },
    [setConnections, toast, deleteInstance, invalidateConnectionsCaches]
  );

  return {
    handleCreateConnection: handleAddConnection,
    handleDeleteConnection: handleDelete,
    handleSetDefault,
    handleAddConnection,
    handleDelete,
  };
}
