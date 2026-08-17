import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

// NOTA (DB-as-source): zapp.message_reports é nova (migration 20260817170000,
// ainda não aplicada) — types.ts regenerado na rodada de aplicação.

export type ReportReason = 'spam' | 'inapropriado' | 'urgencia' | 'outro';

/**
 * useReportMessage — Reportar mensagem (Etapa 44 do plano 100 etapas).
 * Backend: zapp.message_reports (migration 20260817170000) — 1 report por agente
 * por mensagem (UNIQUE message_id+reporter_id); resolução só por supervisor.
 */
export function useReportMessage() {
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      log.warn('[useReportMessage] loadProfile failed', error);
      return;
    }
    if (data && mountedRef.current) setProfileId(data.id);
  }, []);

  const loadReports = useCallback(async (pid: string) => {
    const { data, error } = await supabase
      .from('message_reports' as never)
      .select('message_id')
      .eq('reporter_id', pid);
    if (error) {
      log.warn('[useReportMessage] load failed', error);
      return;
    }
    if (data && mountedRef.current) {
      setReportedIds(new Set(data.map((r: { message_id: string }) => r.message_id)));
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileId) void loadReports(profileId);
  }, [profileId, loadReports]);

  const report = useCallback(
    async (messageId: string, reason: ReportReason, details?: string) => {
      if (!isValidUUID(messageId)) {
        toast.error('Mensagem inválida');
        return;
      }
      if (!profileId) {
        toast.error('Perfil não carregado');
        return;
      }
      if (reason === 'outro' && !details?.trim()) {
        toast.error('Descreva o motivo do reporte');
        return;
      }

      const { error } = await supabase.from('message_reports' as never).insert({
        message_id: messageId,
        reporter_id: profileId,
        reason,
        details: details?.trim() || null,
      } as never);

      if (error) {
        // 23505 unique violation = já reportou
        const msg =
          typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
            ? 'Você já reportou esta mensagem'
            : 'Erro ao reportar mensagem';
        toast.error(msg);
        log.warn('[useReportMessage] report failed', error);
        return;
      }

      setReportedIds((prev) => new Set(prev).add(messageId));
      toast.success('Mensagem reportada — um supervisor vai revisar');
    },
    [profileId]
  );

  return { reportedIds, hasReported: (id: string) => reportedIds.has(id), report, loadReports };
}
