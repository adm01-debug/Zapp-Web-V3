import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { WhatsAppConnection, QrCodeDialogState } from '../useConnectionsManager';

/**
 * Realtime das conexões WhatsApp (canal `whatsapp-connections-changes`).
 *
 * FIX 2026-07-02 — "cannot add `postgres_changes` callbacks … after `subscribe()`":
 * a versão anterior recriava o canal a cada mudança de `qrCodeDialog.open`,
 * `qrCodeDialog.connectionId` ou identidade de `announceConnected` (deps do
 * useEffect). Como `supabase.channel(topic)` devolve a MESMA instância enquanto
 * o `removeChannel()` (assíncrono) do cleanup anterior ainda não concluiu o
 * teardown, o render seguinte chamava `.on('postgres_changes', …)` num canal
 * já inscrito → exceção fatal capturada pelo ErrorBoundary.
 *
 * Padrão correto: inscrever UMA única vez por mount e ler o estado volátil
 * (dialog de QR code, callback de anúncio) via refs dentro do handler.
 */
export function useConnectionsRealtime(
  setConnections: React.Dispatch<React.SetStateAction<WhatsAppConnection[]>>,
  qrCodeDialog: QrCodeDialogState,
  setQrCodeDialog: React.Dispatch<React.SetStateAction<QrCodeDialogState>>,
  announceConnected: (conn: { id: string; name: string }) => void
) {
  const qrCodeDialogRef = useRef(qrCodeDialog);
  const announceConnectedRef = useRef(announceConnected);

  useEffect(() => {
    qrCodeDialogRef.current = qrCodeDialog;
  }, [qrCodeDialog]);

  useEffect(() => {
    announceConnectedRef.current = announceConnected;
  }, [announceConnected]);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-connections-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          log.debug('Connection update:', payload);
          if (payload.eventType === 'UPDATE') {
            const newConn = payload.new as WhatsAppConnection;
            const oldConn = payload.old as Partial<WhatsAppConnection> | null;
            setConnections((prev) =>
              prev.map((conn) => (conn.id === newConn.id ? newConn : conn))
            );

            if (newConn.status === 'connected' && oldConn?.status !== 'connected') {
              announceConnectedRef.current({ id: newConn.id, name: newConn.name });
            }

            const dialog = qrCodeDialogRef.current;
            if (dialog.open && dialog.connectionId === newConn.id) {
              if (newConn.status === 'connected') {
                setQrCodeDialog((prev) => ({ ...prev, status: 'connected', qrCode: null, expiresAt: null }));
              } else if (newConn.qr_code) {
                setQrCodeDialog((prev) => ({
                  ...prev,
                  qrCode: newConn.qr_code,
                  status: 'pending',
                  expiresAt: prev.expiresAt ?? Date.now() + 60_000,
                }));
              }
            }
          } else if (payload.eventType === 'INSERT') {
            setConnections((prev) => [payload.new as WhatsAppConnection, ...prev]);
          } else if (payload.eventType === 'DELETE') {
            setConnections((prev) => prev.filter((conn) => conn.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // setState do React tem identidade estável — este efeito roda 1x por mount.
  }, [setConnections, setQrCodeDialog]);
}
