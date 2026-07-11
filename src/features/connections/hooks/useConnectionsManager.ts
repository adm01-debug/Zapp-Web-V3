import { useEffect, useCallback, useRef } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { toast } from '@/hooks/use-toast';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { whatsappConnectionRepository } from '../data-access/whatsappConnectionRepository';
import { whatsappConnectionService } from '../services/whatsappConnectionService';
import { useConnectionsState } from './parts/useConnectionsState';
import { useConnectionsRealtime } from './parts/useConnectionsRealtime';
import { useConnectionsActions } from './parts/useConnectionsActions';
import { evolutionInstanceName } from '@/lib/evolutionInstance';

export type WhatsAppApiType = 'evolution' | 'official';

export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  /** Nome da instância na Evolution API — identificador usado nas rotas HTTP. */
  instance_name?: string | null;
  /** UUID interno da Evolution — NUNCA usar em rotas da API (gera 404/fantasma). */
  instance_id: string | null;
  status: string;
  qr_code: string | null;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
  api_type?: string;
  battery_level?: number | null;
  is_plugged?: boolean | null;
  retry_count?: number | null;
  max_retries?: number | null;
  health_status?: string | null;
  health_response_ms?: number | null;
  last_health_check?: string | null;
  health_reason?: string | null;
  owner_jid?: string | null;
}

export type QrTtlSource = 'detected' | 'default' | 'clamped';

export interface QrCodeDialogState {
  open: boolean;
  connectionId: string;
  connectionName: string;
  qrCode: string | null;
  status: 'loading' | 'pending' | 'connected' | 'error';
  errorMessage?: string;
  expiresAt: number | null;
  attemptId: string | null;
  ttlSeconds: number | null;
  ttlSource: QrTtlSource | null;
  rawPayload?: unknown;
}

const QR_STORAGE_KEY = 'zapp:qrDialog:v1';

export function useConnectionsManager() {
  const state = useConnectionsState();
  const {
    connections,
    setConnections,
    loading: _loading,
    setLoading,
    isAddDialogOpen: _isAddDialogOpen,
    setIsAddDialogOpen,
    qrCodeDialog,
    setQrCodeDialog,
    newConnection,
    setNewConnection,
    isCreating: _isCreating,
    setIsCreating,
    dialogGenRef,
    refreshInFlightRef,
    announceConnected,
    INITIAL_QR_STATE,
  } = state;

  const {
    isLoading: evolutionLoading,
    createInstance: _createInstance,
    getInstanceStatus: _getInstanceStatus,
    disconnectInstance,
    deleteInstance,
  } = useEvolutionApi();

  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const generateQr = useCallback(
    async (connection: WhatsAppConnection) => {
      if (!connection.instance_id) return;
      // Evolution roteia por nome de instância — passar o UUID (instance_id) gera 404.
      const evoName = evolutionInstanceName(connection);
      if (!evoName) {
        setQrCodeDialog((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: `A instância "${connection.name}" ainda não tem um nome sincronizado da Evolution. Tente novamente em alguns segundos.`,
        }));
        return;
      }
      const attemptId = await whatsappConnectionService.logQrAttempt(
        connection.id,
        evoName,
        connection.name
      );
      try {
        const result = await whatsappConnectionService.requestQrCode(evoName);
        const { ttlMs, source: ttlSource } = whatsappConnectionService.detectQrTtlMs(result);
        const expiresAt = Date.now() + ttlMs;

        // Evolution API pode retornar `base64` no nível raiz OU dentro de `qrcode.base64`.
        const rawBase64: string | undefined =
          (result as Record<string, unknown> & { qrcode?: { base64?: string } })?.qrcode?.base64 ||
          ((result as Record<string, unknown>)?.base64 as string) ||
          ((result as Record<string, unknown>)?.qr as string) ||
          ((result as Record<string, unknown>)?.qrcode as string);

        if (!rawBase64) {
          setQrCodeDialog((prev) => ({
            ...prev,
            status: 'error',
            rawPayload: result,
            errorMessage:
              'A API Evolution não retornou um QR Code. A instância pode já estar conectada — clique em “Atualizar” e verifique o status.',
          }));
          return;
        }

        setQrCodeDialog((prev) => ({
          ...prev,
          qrCode: rawBase64,
          status: 'pending',
          expiresAt,
          rawPayload: result,
          attemptId: (attemptId as { data?: { id?: string } } | null)?.data?.id ?? null,
          ttlSeconds: Math.round(ttlMs / 1000),
          ttlSource: ttlSource as QrTtlSource,
        }));
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        setQrCodeDialog((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: errMsg,
          rawPayload: error,
        }));
      }
    },
    [setQrCodeDialog]
  );

  const handleShowQrCode = useCallback(
    async (connection: WhatsAppConnection) => {
      if ((connection.api_type ?? 'evolution') === 'official') {
        toast({
          title: 'QR Code não disponível',
          description: 'Esta conexão usa WhatsApp Cloud API (oficial).',
          variant: 'destructive',
        });
        return;
      }
      if (!connection.instance_id) {
        toast({
          title: 'Aguardando sincronização',
          description: `A instância "${connection.name || connection.phone_number || 'WhatsApp'}" ainda não recebeu o ID da Evolution. Tente novamente em alguns segundos.`,
          variant: 'destructive',
        });
        return;
      }
      setQrCodeDialog({
        open: true,
        connectionId: connection.id,
        connectionName: connection.name,
        qrCode: connection.qr_code,
        status: connection.status === 'connected' ? 'connected' : 'loading',
        expiresAt: null,
        attemptId: null,
        ttlSeconds: null,
        ttlSource: null,
      });

      if (connection.status !== 'connected') {
        await generateQr(connection);
      }
    },
    [setQrCodeDialog, generateQr]
  );

  const actions = (
    useConnectionsActions as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof useConnectionsActions>
  )(
    connections,
    setConnections,
    setIsCreating,
    setIsAddDialogOpen,
    setNewConnection,
    handleShowQrCode,
    disconnectInstance,
    deleteInstance,
    newConnection
  );

  useConnectionsRealtime(setConnections, qrCodeDialog, setQrCodeDialog, announceConnected);

  useEffect(() => {
    try {
      if (!qrCodeDialog.open || qrCodeDialog.status === 'connected') {
        sessionStorage.removeItem(QR_STORAGE_KEY);
      } else {
        sessionStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrCodeDialog));
      }
    } catch (e) {
      // sessionStorage may be unavailable (private mode/quota) — non-fatal for the QR flow.
      log.warn('[useConnectionsManager] failed to persist QR dialog state', e);
    }
  }, [qrCodeDialog]);

  useEffect(() => {
    let cancelled = false;
    const fetchConnections = async () => {
      setLoading(true);
      const { data, error } = await whatsappConnectionRepository.fetchConnections();
      if (cancelled) return;
      if (!error && data) setConnections(data as unknown as WhatsAppConnection[]);
      setLoading(false);
    };
    void fetchConnections();
    return () => {
      cancelled = true;
    };
  }, [setConnections, setLoading]);

  const handleRefreshQrCode = async () => {
    if (refreshInFlightRef.current) return;
    const connection = connections.find((c) => c.id === qrCodeDialog.connectionId);
    if (!connection) return;
    refreshInFlightRef.current = true;
    setQrCodeDialog((prev) => ({ ...prev, status: 'loading' }));
    await generateQr(connection);
    refreshInFlightRef.current = false;
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id).catch((err) => {
      log.warn('[useConnectionsManager] clipboard write failed', err);
    });
    toast({ title: 'ID copiado!' });
  };

  const handleDisconnect = async (connection: WhatsAppConnection) => {
    if (!connection.instance_id) return;
    // Evolution roteia por nome de instância — passar o UUID (instance_id) gera 404
    // no endpoint de logout, revertendo o estado otimista com um erro confuso.
    const evoName = evolutionInstanceName(connection);
    if (!evoName) {
      toast({
        title: 'Aguardando sincronização',
        description: `A instância "${connection.name}" ainda não tem um nome sincronizado da Evolution. Tente novamente em alguns segundos.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      // 1. Log audit event before action — failure must NOT block the disconnect
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && externalSupabase) {
          await (
            externalSupabase as unknown as {
              rpc: (name: string, args: unknown) => Promise<unknown>;
            }
          ).rpc('fn_safe_audit_log', {
            p_entity_type: 'whatsapp_connection',
            p_entity_id: connection.id,
            p_action: 'disconnect',
            p_performed_by: user.email,
            p_details: { instance: evoName, source: 'manual_ui' },
          });
        }
      } catch (auditErr) {
        log.warn('Audit log failed — proceeding with disconnect', auditErr);
      }

      // 2. Update local state immediately for UX (Optimistic)
      setConnections((prev) =>
        prev.map((c) => (c.id === connection.id ? { ...c, status: 'disconnecting' } : c))
      );

      // 3. Call disconnect API
      const response = (await disconnectInstance(evoName)) as {
        success?: boolean;
        reason?: string;
      } | null;

      if (response && response.success === false) {
        throw new Error(response.reason || 'Falha na API Evolution ao desconectar');
      }

      // 4. Update local state and repository to final state
      setConnections((prev) =>
        prev.map((c) =>
          c.id === connection.id ? { ...c, status: 'disconnected', qr_code: null } : c
        )
      );

      await whatsappConnectionRepository.updateConnection(connection.id, {
        status: 'disconnected',
        qr_code: null,
      });

      toast({
        title: 'Sessão encerrada',
        description: `A instância "${connection.name}" foi desconectada com sucesso.`,
      });

      // 5. Guided Flow: Auto-open QR dialog with progress
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = setTimeout(() => {
        void handleShowQrCode({ ...connection, status: 'disconnected', qr_code: null });
      }, 500);
    } catch (error: unknown) {
      // 6. Error Recovery: Restore state if failed
      setConnections((prev) =>
        prev.map((c) => (c.id === connection.id ? { ...c, status: 'connected' } : c))
      );

      log.error('Error in handleDisconnect:', error);
      const errMsg =
        error instanceof Error
          ? error.message
          : 'Não foi possível encerrar a sessão. Tente novamente.';
      toast({
        title: 'Erro ao desconectar',
        description: errMsg,
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSetApiType = async (connection: WhatsAppConnection, api_type: WhatsAppApiType) => {
    const { error } = await whatsappConnectionRepository.updateConnection(connection.id, {
      api_type,
    });
    if (error) {
      toast({
        title: 'Erro ao atualizar',
        description: (error as { message?: string }).message ?? String(error),
        variant: 'destructive',
      });
      return;
    }
    setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, api_type } : c)));
  };

  const closeQrDialog = () => {
    dialogGenRef.current += 1;
    refreshInFlightRef.current = false;
    sessionStorage.removeItem(QR_STORAGE_KEY);
    setQrCodeDialog(INITIAL_QR_STATE);
  };

  return {
    ...state,
    evolutionLoading,
    ...actions,
    handleShowQrCode,
    handleRefreshQrCode,
    handleCopyId,
    handleDisconnect,
    handleSetApiType,
    handleReconnect: (c: WhatsAppConnection) => handleShowQrCode(c),
    closeQrDialog,
  };
}
