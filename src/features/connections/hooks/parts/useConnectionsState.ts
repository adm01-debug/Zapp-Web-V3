import { useState, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import type { WhatsAppConnection, QrCodeDialogState, WhatsAppApiType } from '../types';

const INITIAL_QR_STATE: QrCodeDialogState = {
  open: false,
  connectionId: '',
  connectionName: '',
  qrCode: null,
  status: 'loading',
  expiresAt: null,
  attemptId: null,
  ttlSeconds: null,
  ttlSource: null,
  rawPayload: null,
};

const QR_STORAGE_KEY = 'zapp:qrDialog:v1';

function loadPersistedQr() {
  try {
    const raw = sessionStorage.getItem(QR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.status === 'pending' && parsed.expiresAt && parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(QR_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Hook: use Connections State. */
export function useConnectionsState() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [qrCodeDialog, setQrCodeDialog] = useState<QrCodeDialogState>(() => {
    const persisted = loadPersistedQr();
    if (!persisted) return INITIAL_QR_STATE;
    return {
      open: true,
      connectionId: persisted.connectionId,
      connectionName: persisted.connectionName,
      qrCode: persisted.qrCode,
      status: persisted.status,
      errorMessage: persisted.errorMessage,
      expiresAt: persisted.expiresAt,
      attemptId: persisted.attemptId,
      ttlSeconds: persisted.expiresAt
        ? Math.round((persisted.expiresAt - Date.now()) / 1000)
        : null,
      ttlSource: persisted.expiresAt ? 'detected' : null,
    };
  });
  const [newConnection, setNewConnection] = useState<{
    name: string;
    phone_number: string;
    api_type: WhatsAppApiType;
  }>({ name: '', phone_number: '', api_type: 'evolution' });
  const [isCreating, setIsCreating] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState<string | null>(null);

  const dialogGenRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const toastedConnectedRef = useRef<Set<string>>(new Set());

  const announceConnected = useCallback((conn: { id: string; name: string }) => {
    if (toastedConnectedRef.current.has(conn.id)) return;
    toastedConnectedRef.current.add(conn.id);
    toast({
      title: 'WhatsApp conectado!',
      description: `${conn.name} está online e pronto para enviar e receber mensagens.`,
    });
  }, []);

  return {
    connections,
    setConnections,
    loading,
    setLoading,
    isAddDialogOpen,
    setIsAddDialogOpen,
    qrCodeDialog,
    setQrCodeDialog,
    newConnection,
    setNewConnection,
    isCreating,
    setIsCreating,
    syncingHistory,
    setSyncingHistory,
    dialogGenRef,
    refreshInFlightRef,
    announceConnected,
    INITIAL_QR_STATE,
    QR_STORAGE_KEY,
  };
}
