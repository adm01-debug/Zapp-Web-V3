import { useState, useCallback, useEffect } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { log } from '@/lib/logger';
import { whatsappStatusService } from '../services/whatsappStatusService';
import type {
  WhatsAppStatusMessage,
  WhatsAppPresenceInfo,
} from '../data-access/whatsappStatusRepository';

export type { WhatsAppStatusMessage, WhatsAppPresenceInfo };

export interface WhatsAppStatusData {
  statusMessages: WhatsAppStatusMessage[];
  presence: WhatsAppPresenceInfo;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to fetch WhatsApp status (stories) and presence for a contact
 */
export function useWhatsAppStatus(phone: string | undefined): WhatsAppStatusData {
  const [statusMessages, setStatusMessages] = useState<WhatsAppStatusMessage[]>([]);
  const [presence, setPresence] = useState<WhatsAppPresenceInfo>({
    isOnline: false,
    lastSeen: null,
    loading: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useMountedRef();

  const fetchData = useCallback(async () => {
    if (!phone) return;

    setLoading(true);
    setError(null);

    try {
      const data = await whatsappStatusService.fetchStatusData(phone);

      if (!mountedRef.current) return;

      setStatusMessages(data.statusMessages);
      setPresence(data.presence);
    } catch (err) {
      log.error('WhatsApp status fetch error:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar status');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [phone]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    statusMessages,
    presence,
    loading,
    error,
    refresh: fetchData,
  };
}
