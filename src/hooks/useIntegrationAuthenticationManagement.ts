// Consolidated Integration & Authentication Module (ETAPA 47)
// Consolidates: useEvolutionAutoSync, useEvolutionAutoReconnect, useMFA, useWebAuthn, useReauthentication, useGmailHealth, useGmailLabels
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';
import { normalizePhone, isSamePhone } from '@/lib/phoneUtils';
import { emailHealthService } from '@/services/email/emailHealthService';
import type { EmailHealthInfo } from '@/services/email/types';
import { emailMappers } from '@/utils/emailMappers';
import { useQueryClient } from '@tanstack/react-query';
import { eventBus } from '@/lib/eventBus';

interface PasskeyCredential {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  device_type: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface EmailLabel {
  id: string;
  account_id: string;
  name: string;
  label_id?: string;
  color?: string;
}

const INITIAL_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const MAX_CONSECUTIVE_RECONNECT_ATTEMPTS = 20;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_BASE_MS = 2 * 60_000;
const CIRCUIT_MAX_MS = 10 * 60_000;

export const SYSTEM_LABELS = [
  { id: 'INBOX', name: 'Inbox', icon: 'inbox', color: '#1a73e8' },
  { id: 'STARRED', name: 'Favoritos', icon: 'star', color: '#f29900' },
  { id: 'IMPORTANT', name: 'Importantes', icon: 'flag', color: '#e37400' },
  { id: 'SENT', name: 'Enviados', icon: 'send', color: '#34a853' },
  { id: 'DRAFTS', name: 'Rascunhos', icon: 'draft', color: '#9e9e9e' },
  { id: 'SPAM', name: 'Spam', icon: 'block', color: '#d93025' },
  { id: 'TRASH', name: 'Lixeira', icon: 'delete', color: '#777777' },
];

function extractHttpStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== 'object') return undefined;
  const e = err as Record<string, unknown>;
  if (typeof e['apiStatus'] === 'number') return e['apiStatus'];
  if (typeof e['status'] === 'number') return e['status'];
  const ctx = e['context'];
  if (ctx != null && typeof ctx === 'object') {
    const s = (ctx as Record<string, unknown>)['status'];
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/** Consolidated hook for integration authentication, MFA, WebAuthn, email health, and labels. */
export function useEvolutionAutoSyncManagement(onSynced?: () => void) {
  const ran = useRef(false);
  const { listInstances } = useEvolutionApi();

  const syncAll = async () => {
    try {
      const { data: existing, error } = await supabase
        .from('whatsapp_connections')
        .select('instance_id, phone_number');
      if (error) throw error;
      const knownIds = new Set((existing ?? []).map((c) => c.instance_id));
      const knownPhones = (existing ?? [])
        .map((c) => normalizePhone(c.phone_number ?? ''))
        .filter(Boolean);

      const evoResult = await listInstances();
      const instances: unknown[] = Array.isArray(evoResult)
        ? evoResult
        : ((evoResult as any)?.data ?? (evoResult as any)?.instances ?? []);

      if (!instances.length) return;

      const missing = instances.filter((inst) => {
        const i = inst as any;
        if (!i?.instance?.instanceName) return false;
        if (knownIds.has(i.instance.instanceName)) return false;
        const phone =
          i.instance?.number ||
          (typeof i.instance?.ownerJid === 'string'
            ? i.instance.ownerJid.replace('@s.whatsapp.net', '')
            : '') ||
          '';
        if (phone && knownPhones.some((kp) => isSamePhone(kp, phone))) return false;
        return true;
      });

      if (!missing.length) return;

      for (const inst of missing) {
        const i = inst as any;
        const instanceName = i.instance?.instanceName ?? '';
        const name = i.instance?.profileName || instanceName || 'Auto-synced';
        const phone =
          i.instance?.number ||
          (typeof i.instance?.ownerJid === 'string'
            ? i.instance.ownerJid.replace('@s.whatsapp.net', '')
            : '') ||
          '';

        await supabase.from('whatsapp_connections').insert({
          instance_id: instanceName,
          instance_name: instanceName,
          phone_number: phone,
          name,
          status: i.instance?.status || 'unknown',
          health_reason: null,
          auto_reconnect_enabled: false,
        });
      }

      if (onSynced) onSynced();
    } catch (err) {
      log.error('Error syncing Evolution instances:', err);
    }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void syncAll();
  }, []);

  return { syncAll };
}

export function useEvolutionAutoReconnectManagement(instanceName?: string) {
  const { restartInstance, getInstanceStatus, connectInstance } = useEvolutionApi();
  const queryClient = useQueryClient();
  const attemptMap = useRef<Record<string, number>>({});
  const lastAttemptTime = useRef<Record<string, number>>({});
  const [status, setStatus] = useState<string>('unknown');
  const [isReconnecting, _setIsReconnecting] = useState(false);
  const isReconnectingRef = useRef(false);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptCountRef = useRef(0);

  const performReconnect = useCallback(async () => {
    if (!instanceName || isReconnectingRef.current) return;
    isReconnectingRef.current = true;

    try {
      await connectInstance(instanceName);
      attemptMap.current[instanceName] = 0;
      reconnectAttemptCountRef.current = 0;
      backoffRef.current = INITIAL_BACKOFF_MS;
      setStatus('reconnecting');
    } catch (err) {
      log.error('Reconnection attempt failed:', err);
      reconnectAttemptCountRef.current++;
      if (reconnectAttemptCountRef.current >= MAX_CONSECUTIVE_RECONNECT_ATTEMPTS) {
        eventBus.emit('evolution:reconnection_failed', { instanceName });
      }
    } finally {
      isReconnectingRef.current = false;
    }
  }, [instanceName, connectInstance]);

  const scheduleReconnect = useCallback(
    (delayMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void performReconnect();
      }, delayMs);
    },
    [performReconnect]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, isReconnecting, performReconnect, scheduleReconnect };
}

export function useWebAuthnManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const mountedRef = useMountedRef();

  const fetchPasskeys = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('passkey_credentials')
      .select('id, credential_id, friendly_name, device_type, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      log.error('Failed to fetch passkeys:', error);
      return;
    }
    if (mountedRef.current) setPasskeys(data || []);
  }, [user, mountedRef]);

  useEffect(() => {
    void fetchPasskeys();
  }, [fetchPasskeys]);

  return { passkeys, loading, fetchPasskeys };
}

export function useEmailHealthManagement() {
  const [health, setHealth] = useState<EmailHealthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const mountedRef = useMountedRef();

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await emailHealthService.getHealthStatus();
      if (mountedRef.current) setHealth(data);
    } catch (err) {
      log.error('Email health load error', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [mountedRef]);

  const forceRevalidation = async () => {
    try {
      await emailHealthService.forceRevalidation();
      toast({
        title: 'Cache atualizado',
        description: 'A revalidação do schema foi forçada com sucesso.',
      });
      await loadHealth();
    } catch {
      toast({
        title: 'Erro na revalidação',
        description: 'Não foi possível forçar a revalidação.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  return { health, isLoading, refresh: loadHealth, forceRevalidation };
}

export function useGmailLabelsManagement(accountId: string | null) {
  const [labels, setLabels] = useState<EmailLabel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    if (!accountId) return;

    setIsLoading(true);
    setError(null);
    const { data, error: dbErr } = await safeClient.from('email_labels', (q) =>
      q.select('*').eq('account_id', accountId).order('name', { ascending: true })
    );

    if (dbErr) {
      log.warn('Email labels load error', (dbErr as any).message);
      setError(`Não foi possível carregar as pastas do Email.`);
    } else {
      setLabels(emailMappers.labels(Array.isArray(data) ? data : []));
    }
    setIsLoading(false);
  }, [accountId]);

  const syncLabels = useCallback(async () => {
    if (!accountId) return;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
        body: { action: 'syncLabels', accountId },
      });
      if (!fnErr && (data as any)?.success) {
        await loadLabels();
      }
    } catch {
      // ignore
    }
  }, [accountId, loadLabels]);

  const getLabelCount = useCallback(
    async (labelId: string): Promise<{ thread_count: number; unread_count: number }> => {
      if (!accountId) return { thread_count: 0, unread_count: 0 };

      const { data } = await safeClient.from<{ id: string; unread_count: number }>(
        'email_threads',
        (q) =>
          q.select('id, unread_count').eq('account_id', accountId).contains('label_ids', [labelId])
      );

      const threads = data ?? [];
      return {
        thread_count: threads.length,
        unread_count: threads.reduce((s, t) => s + (t.unread_count ?? 0), 0),
      };
    },
    [accountId]
  );

  useEffect(() => {
    void loadLabels();
  }, [loadLabels]);

  return { labels, isLoading, error, loadLabels, syncLabels, getLabelCount };
}
