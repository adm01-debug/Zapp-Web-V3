// @ts-nocheck
/**
 * useHmacSelfTest — Wave 3 batch-3 (2026-07-06)
 * Camada de dados extraída de HmacSelfTestPage: invoke do self-test, auditoria
 * (hmac_selftest_audit) e sincronização de alertas (warroom_alerts).
 * Bônus da regen de types (PR #243): casts-workaround removidos — as tabelas
 * agora existem no types.ts gerado do banco real.
 */
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export type Phase =
  | 'config' | 'parse-body' | 'build-payload' | 'sign' | 'mutate'
  | 'request' | 'validate' | 'signature-presence' | 'temporal' | 'response';

export interface ScenarioReport {
  name: string;
  description: string;
  expected: 'accept' | 'reject';
  outcome: 'accept' | 'reject';
  passed: boolean;
  reason: string | null;
  failed_phase?: Phase | null;
  issuedAt: string;
  ageSeconds: number;
  nonce: string;
}

export interface SelfTestResult {
  ok: boolean;
  configured: boolean;
  request_id?: string;
  failed_phase?: Phase | null;
  secret_length?: number;
  duration_ms?: number;
  tolerance_seconds?: number;
  scenarios?: ScenarioReport[];
  message?: string;
  error?: string;
}

export function useHmacSelfTest(instance: string, includeNegative: boolean) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const logAudit = useCallback(async (payload: SelfTestResult, fallbackMs: number) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { error: insertError } = await safeClient.from('hmac_selftest_audit', q => q.insert({
        instance,
        ok: !!payload.ok,
        duration_ms: payload.duration_ms ?? fallbackMs,
        error: payload.error ?? null,
        message: payload.message ?? null,
        executed_by: uid,
      }));
      if (insertError) {
        log.warn('audit insert failed', insertError);
      }
    } catch (e) {
      log.warn('audit insert threw', e);
    }
  }, [instance]);

  const syncAlert = useCallback(async (payload: SelfTestResult) => {
    const source = `hmac-selftest:${instance}`;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data: existing, error: existingError } = await supabase
        .from('warroom_alerts')
        .select('id')
        .eq('source', source)
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(1);
      if (existingError) {
        log.warn('warroom_alerts lookup failed', existingError);
        return;
      }
      const activeId = existing?.[0]?.id ?? null;
      if (!payload.ok && !activeId) {
        const failed = payload.scenarios?.filter((s) => !s.passed) ?? [];
        const phasePrefix = payload.failed_phase ? `[fase: ${payload.failed_phase}] ` : '';
        const reqSuffix = payload.request_id ? ` (req=${payload.request_id.slice(0, 8)})` : '';
        const detail = failed.length > 0
          ? failed.map((s) => `${s.name}${s.failed_phase ? `@${s.failed_phase}` : ''}: ${s.reason ?? '—'}`).join(' | ')
          : (payload.error ?? payload.message ?? 'Falha no self-test HMAC');
        const { error: insertAlertError } = await supabase.from('warroom_alerts').insert({
          alert_type: 'critical',
          title: `HMAC self-test falhou (${instance})`,
          message: `${phasePrefix}${detail}${reqSuffix}`.slice(0, 500),
          source,
        });
        if (insertAlertError) log.warn('warroom_alerts insert failed', insertAlertError);
      } else if (payload.ok && activeId) {
        const { error: resolveError } = await safeClient.from('warroom_alerts', q =>
          q.update({
            resolved_at: new Date().toISOString(),
            resolved_reason: 'Auto-resolvido: HMAC self-test voltou a OK',
            dismissed_by: uid,
            is_read: true,
          }).eq('source', source).is('resolved_at', null),
        );
        if (resolveError) log.warn('warroom_alerts resolve failed', resolveError);
      }
    } catch (e) {
      log.warn('alert sync threw', e);
    }
  }, [instance]);

  const run = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke('webhook-hmac-selftest', {
        body: { instance, include_negative: includeNegative },
      });
      if (error) throw error;
      const r = data as SelfTestResult;
      setResult(r);
      setLastRunAt(new Date());
      if (r.ok) toast.success('HMAC OK — secret válido');
      else toast.error(r.error ?? 'Falha no auto-teste HMAC');
      await logAudit(r, Math.round(performance.now() - t0));
      await syncAlert(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado';
      const failure: SelfTestResult = { ok: false, configured: false, error: msg };
      setResult(failure);
      toast.error(msg);
      await logAudit(failure, Math.round(performance.now() - t0));
      await syncAlert(failure);
    } finally {
      setLoading(false);
    }
  }, [instance, includeNegative, logAudit, syncAlert]);

  return { loading, result, lastRunAt, run };
}
