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
import { validatePhone } from '@/lib/phoneUtils';
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

  /** Clears React Query caches for all connection-related queries. */
  const invalidateConnectionsCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.connections.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.talkx.waConnections() });
  }, [queryClient]);

  /** Creates a new WhatsApp connection record and redirects to QR code flow for non-official connections. */
  const handleAddConnection = useCallback(async () => {
    if (!newConnection.name) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }

    // F6-15: auto-correct api_type when name signals Meta Cloud API.
    // "não oficial" / "nao oficial" must NOT trigger the correction.
    const nameSignalsCloudApi =
      /cloud api/i.test(newConnection.name) ||
      (/\boficial\b/i.test(newConnection.name) &&
        !/\b(?:não|nao)[-\s]+oficial\b/i.test(newConnection.name));
    const correctedApiType: WhatsAppApiType =
      nameSignalsCloudApi && newConnection.api_type !== 'official'
        ? 'official'
        : newConnection.api_type;
    if (nameSignalsCloudApi && newConnection.api_type !== 'official') {
      toast({
        title: 'Tipo corrigido automaticamente',
        description:
          'O nome indica Meta Cloud API (Oficial) — api_type foi ajustado para "official".',
      });
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

    // F6-15: nome/type divergentes — se o nome sugere Cloud API oficial, força
    // api_type='official' para o registro nunca nascer com nome enganoso.
    const resolvedApiType: WhatsAppApiType = /cloud\s*api|oficial|official/i.test(
      newConnection.name
    )
      ? 'official'
      : newConnection.api_type;

    setIsCreating(true);
    const isOfficial = resolvedApiType === 'official';
    // F6-02: o nome da instância deve ser o mesmo que `evolutionInstanceName`
    // resolve para roteamento (nome de exibição quando é um instance name válido,
    // senão o slug) — evita criar instância órfã divergente do roteamento (G4).
    const trimmedName = newConnection.name.trim();
    const INSTANCE_NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/;
    const instanceName = isOfficial
      ? `official_${Date.now().toString(36)}`
      : INSTANCE_NAME_RE.test(trimmedName)
        ? trimmedName
        : whatsappConnectionService.generateInstanceName(newConnection.name);

    try {
      // F6-02: criar a instância na Evolution API ANTES do INSERT. Falha aqui
      // aborta o fluxo — nenhum registro fantasma em whatsapp_connections.
      let evolutionInstanceNameResolved = instanceName;
      let evolutionInstanceUuid: string | null = null;
      if (!isOfficial) {
        const created = await whatsappConnectionService.createInstance(instanceName);
        const createdInstance = (
          created as { instance?: { instanceName?: string; instanceId?: string } } | null
        )?.instance;
        if (createdInstance?.instanceName) evolutionInstanceNameResolved = createdInstance.instanceName;
        if (createdInstance?.instanceId) evolutionInstanceUuid = createdInstance.instanceId;
      }

      const { data, error } = await safeClient.single<Record<string, unknown>>(
        'whatsapp_connections',
        (q) =>
          q
            .insert({
              name: newConnection.name,
              phone_number: normalizedPhone,
              instance_id: evolutionInstanceUuid ?? evolutionInstanceNameResolved,
              instance_name: evolutionInstanceNameResolved,
              status: 'disconnected',
              is_default: connections.length === 0,
              api_type: resolvedApiType,
            })
            .select()
      );

      if (error) throw error;

      setConnections((prev) => [...prev, data as unknown as WhatsAppConnection]);

      toast({
        title: 'Conexão criada!',
        description: isOfficial
          ? 'Configure as credenciais da API oficial (Meta) nas configurações da conexão.'
          : 'Agora conecte escaneando o QR Code ou usando o código de emparelhamento.',
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

  /** Sets a specific connection as the workspace default, clearing the flag on all others. */
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

  /** Removes a WhatsApp connection from the Evolution API and deletes its database record. */
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
            const errMsg = (error as { message?: string }).message ?? '';
            const isInstanceGone = status === 404 && errMsg.includes(evoName);
            if (isInstanceGone) {
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
