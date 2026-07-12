import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import type { WhatsAppConnection, QrCodeDialogState } from '../types';

/**
 * Realtime das conexões WhatsApp.
 *
 * FIX 2026-07-02 (v2) — "cannot add `postgres_changes` callbacks … after `subscribe()`":
 * A v1 do fix (refs + deps estáveis) reduziu, mas NÃO eliminou o crash. Causa
 * remanescente: `supabase.channel(topic)` devolve a MESMA instância enquanto
 * existir um canal com aquele topic no client — e `removeChannel()` é
 * assíncrono. Em remounts rápidos (StrictMode, navegação, remount pelo
 * ErrorBoundary) o novo mount recebia o canal ANTIGO ainda inscrito e chamava
 * `.on('postgres_changes', …)` nele → exceção fatal → ErrorBoundary → remount
 * → loop.
 *
 * Correção definitiva: topic ÚNICO por mount (sufixo aleatório), de modo que
 * cada instância do hook sempre cria um canal novo. Mesmo padrão já usado em
 * `useQueues.ts` (queues-changes:<rand>).
 *
 * Mantido da v1: inscrever UMA única vez por mount e ler o estado volátil
 * (dialog de QR code, callback de anúncio) via refs dentro do handler.
 *
 * Nota DB: `public.whatsapp_connections` é TABELA (não view do repoint layer)
 * e está na publicação `supabase_realtime` — schema 'public' aqui está correto.
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
    // Topic único por mount — evita reutilizar instância de canal já inscrita
    // cujo teardown (removeChannel assíncrono) ainda não terminou.
    const channelName = `whatsapp-connections-changes:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_connections' },
        (payload) => {
          log.debug('Connection update:', payload);
          if (payload.eventType === 'UPDATE') {
            const newConn = payload.new as WhatsAppConnection;
            const oldConn = payload.old as Partial<WhatsAppConnection> | null;
            setConnections((prev) => prev.map((conn) => (conn.id === newConn.id ? newConn : conn)));

            if (newConn.status === 'connected' && oldConn?.status !== 'connected') {
              announceConnectedRef.current({ id: newConn.id, name: newConn.name });
            }

            const dialog = qrCodeDialogRef.current;
            if (dialog.open && dialog.connectionId === newConn.id) {
              if (newConn.status === 'connected') {
                setQrCodeDialog((prev) => ({
                  ...prev,
                  status: 'connected',
                  qrCode: null,
                  expiresAt: null,
                }));
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
            setConnections((prev) =>
              prev.filter((conn) => conn.id !== (payload.old as { id: string }).id)
            );
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
