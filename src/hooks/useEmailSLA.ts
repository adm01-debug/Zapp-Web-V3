// @ts-nocheck
import { useCallback, useEffect, useState } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { SLAStatus } from '@/types/gmail';

export type { SLAStatus };

export interface EmailSLARecord {
  thread_id: string;
  account_id: string;
  received_at: string;
  first_reply_at: string | null;
  frt_minutes: number | null;
  sla_status: SLAStatus;
  sla_threshold_minutes: number;
  warning_threshold_pct: number;
}

interface SLAConfig {
  threshold_minutes: number;
  warning_threshold_pct: number;
  business_hours_only: boolean;
  business_start_hour?: number;
  business_end_hour?: number;
}

const DEFAULT_SLA: SLAConfig = {
  threshold_minutes: 480,
  warning_threshold_pct: 80,
  business_hours_only: true,
  business_start_hour: 8,
  business_end_hour: 18,
};

function elapsedBusinessMinutes(from: Date, to: Date = new Date(), config?: SLAConfig): number {
  if (!config?.business_hours_only) {
    return Math.floor((to.getTime() - from.getTime()) / 60_000);
  }

  const start = config.business_start_hour ?? 8;
  const end = config.business_end_hour ?? 18;
  const minsPerDay = (end - start) * 60;

  let current = new Date(from);
  let elapsed = 0;

  while (current < to) {
    const dayOfWeek = current.getDay();
    const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const hour = current.getHours();

    if (isWorkday && hour >= start && hour < end) {
      const nextMinute = new Date(current.getTime() + 60_000);
      const effectiveTo = nextMinute < to ? nextMinute : to;
      elapsed += Math.floor((effectiveTo.getTime() - current.getTime()) / 60_000);
    }

    const nextCheck = new Date(current);
    if (!isWorkday || hour < start) {
      const targetDay = isWorkday
        ? current
        : (() => {
            const d = new Date(current);
            while (d.getDay() === 0 || d.getDay() === 6) {
              d.setDate(d.getDate() + 1);
            }
            return d;
          })();
      nextCheck.setFullYear(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate());
      nextCheck.setHours(start, 0, 0, 0);
      if (nextCheck <= current) nextCheck.setDate(nextCheck.getDate() + 1);
    } else if (hour >= end) {
      nextCheck.setDate(nextCheck.getDate() + 1);
      nextCheck.setHours(start, 0, 0, 0);
      while (nextCheck.getDay() === 0 || nextCheck.getDay() === 6) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }
    } else {
      const remaining = (end - nextCheck.getHours()) * 60 - nextCheck.getMinutes();
      const skipMins = Math.min(remaining, 60);
      nextCheck.setTime(current.getTime() + skipMins * 60_000);
    }

    if (nextCheck <= current) break;
    current = nextCheck;
    if (elapsed > minsPerDay * 30) break;
  }

  return elapsed;
}

function computeStatus(elapsed: number, config: SLAConfig): SLAStatus {
  if (elapsed >= config.threshold_minutes) return 'breached';
  if (elapsed >= config.threshold_minutes * (config.warning_threshold_pct / 100)) return 'warning';
  return 'ok';
}

/**
 * IDs de conta vindos do fallback GMAIL_MOCKS (ex.: 'mock-account-123') não
 * existem no banco e não são UUIDs válidos — consultar o PostgREST com eles
 * gera 400 (22P02) em loop. Nesses casos o SLA opera apenas em memória.
 */
const isMockId = (id?: string | null): boolean => !!id && id.startsWith('mock-');

export function useEmailSLA(accountId: string | null, config: Partial<SLAConfig> = {}) {
  const slaConfig: SLAConfig = { ...DEFAULT_SLA, ...config };
  const [records, setRecords] = useState<Record<string, EmailSLARecord>>({});

  const registerThread = useCallback(
    (threadId: string, receivedAt: string) => {
      const elapsed = elapsedBusinessMinutes(new Date(receivedAt), new Date(), slaConfig);

      setRecords((prev) => {
        if (prev[threadId]) return prev;
        return {
          ...prev,
          [threadId]: {
            thread_id: threadId,
            account_id: accountId ?? '',
            received_at: receivedAt,
            first_reply_at: null,
            frt_minutes: null,
            sla_status: computeStatus(elapsed, slaConfig),
            sla_threshold_minutes: slaConfig.threshold_minutes,
            warning_threshold_pct: slaConfig.warning_threshold_pct,
          },
        };
      });
    },
    [accountId, slaConfig]
  );

  const markReplied = useCallback(
    (threadId: string) => {
      setRecords((prev) => {
        const record = prev[threadId];
        if (!record || record.first_reply_at) return prev;

        const replyAt = new Date().toISOString();
        const frt = elapsedBusinessMinutes(new Date(record.received_at), new Date(), slaConfig);

        // Persistência só faz sentido para threads reais (UUIDs do banco).
        if (!isMockId(threadId)) {
          safeClient.from('email_threads', (q) =>
            q
              .update({
                first_reply_at: replyAt,
                frt_minutes: frt,
                sla_status: 'ok',
              })
              .eq('thread_id', threadId)
          );
        }

        return {
          ...prev,
          [threadId]: {
            ...record,
            first_reply_at: replyAt,
            frt_minutes: frt,
            sla_status: 'ok',
          },
        };
      });
    },
    [slaConfig]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRecords((prev) => {
        const updated = { ...prev };
        for (const [id, record] of Object.entries(updated)) {
          if (record.first_reply_at) continue;
          const elapsed = elapsedBusinessMinutes(
            new Date(record.received_at),
            new Date(),
            slaConfig
          );
          updated[id] = { ...record, sla_status: computeStatus(elapsed, slaConfig) };
        }
        return updated;
      });
    }, 60_000);

    return () => clearInterval(interval);
  }, [slaConfig]);

  useEffect(() => {
    if (!accountId || isMockId(accountId)) return;

    safeClient
      .from<any>('email_threads', (q) =>
        q
          .select('thread_id, last_message_at, unread_count')
          .eq('account_id', accountId)
          .gt('unread_count', 0)
          .order('last_message_at', { ascending: true })
          .limit(100)
      )
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.last_message_at) {
            registerThread(row.thread_id, row.last_message_at);
          }
        }
      });
  }, [accountId, registerThread]);

  const getStatus = useCallback(
    (threadId: string): SLAStatus | null => records[threadId]?.sla_status ?? null,
    [records]
  );

  const getRecord = useCallback(
    (threadId: string): EmailSLARecord | null => records[threadId] ?? null,
    [records]
  );

  const breachedCount = Object.values(records).filter((r) => r.sla_status === 'breached').length;
  const warningCount = Object.values(records).filter((r) => r.sla_status === 'warning').length;

  return {
    records,
    breachedCount,
    warningCount,
    registerThread,
    markReplied,
    getStatus,
    getRecord,
  };
}