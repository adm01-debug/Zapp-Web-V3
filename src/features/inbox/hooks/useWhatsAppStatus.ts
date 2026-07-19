import { useState, useCallback, useEffect, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { log } from '@/lib/logger';
import { whatsappStatusService } from '../services/whatsappStatusService';
import type {
  WhatsAppStatusMessage,
  WhatsAppPresenceInfo,
} from '../data-access/whatsappStatusRepository';

export type { WhatsAppStatusMessage, WhatsAppPresenceInfo };

/** Aggregate return value from useWhatsAppStatus containing story messages, presence info, loading/error state, and a manual refresh trigger. */
export interface WhatsAppStatusData {
  statusMessages: WhatsAppStatusMessage[];
  presence: WhatsAppPresenceInfo;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to fetch WhatsApp status (stories) and presence for a contact.
 * Properly aborts pending requests on unmount to prevent memory leaks.
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
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup: abort pending requests on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchData = useCallback(async () => {
    if (!phone) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (mountedRef.current) setLoading(true);
    if (mountedRef.current) setError(null);

    try {
      const data = await whatsappStatusService.fetchStatusData(phone);

      if (!mountedRef.current) return;

      setStatusMessages(data.statusMessages);
      setPresence(data.presence);
    } catch (err) {
      if (controller.signal.aborted) return;
      log.error('WhatsApp status fetch error:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar status');
      }
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [phone, mountedRef]);

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
