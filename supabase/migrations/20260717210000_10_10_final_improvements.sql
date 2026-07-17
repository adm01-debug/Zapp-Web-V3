-- ════════════════════════════════════════════════════════════════════════════
-- Migration: 20260717210000_10_10_final_improvements.sql
-- Meta: 10/10 — melhorias consolidadas da sessão 2026-07-17 (manhã + tarde)
-- Executadas em staging (supabase.atomicabr.com.br) antes desta migration.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── FIX-1: fn_rate_limit_check — p_window_minutes agora realmente usado ──
-- Bug histórico: usava date_trunc('minute',now()) — janela fixa de 1 min.
-- Fix: floor(epoch/(N*60))*N*60 garante alinhamento correto ao múltiplo de N.
-- Backward-compatible: N=1 (default) dá mesmo resultado.
CREATE OR REPLACE FUNCTION zapp.fn_rate_limit_check(
  p_identifier     text,
  p_rpc_name       text,
  p_max_calls      integer DEFAULT 60,
  p_window_minutes integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp'
AS $$
DECLARE
  v_count int;
  v_ws    timestamptz;
BEGIN
  v_ws := to_timestamp(
    floor(EXTRACT(epoch FROM now()) / (p_window_minutes * 60))
    * (p_window_minutes * 60)
  );
  INSERT INTO rpc_rate_limits (identifier, rpc_name, window_start, call_count)
  VALUES (p_identifier, p_rpc_name, v_ws, 1)
  ON CONFLICT (identifier, rpc_name, window_start)
    DO UPDATE SET call_count = rpc_rate_limits.call_count + 1
  RETURNING call_count INTO v_count;
  RETURN v_count <= p_max_calls;
END;
$$;

COMMENT ON FUNCTION zapp.fn_rate_limit_check(text,text,integer,integer) IS
'Rate limiter canonico (identifier, rpc_name, janela p_window_minutes min).
CORRIGIDO 2026-07-17: p_window_minutes agora usado via floor(epoch/(N*60))*N*60.
Para N=1 (default): backward-compatible.';

-- ─── FIX-2: Cron para bpm_check_breached_slas ─────────────────────────────
-- Função existia sem cron. Opera sobre zapp.bpm_sla_records (view pass-through
-- de bpm.bpm_sla_records). Segura com 0 linhas.
SELECT cron.schedule(
  'bpm-check-breached-slas',
  '*/5 * * * *',
  $$SELECT zapp.bpm_check_breached_slas();$$
) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='bpm-check-breached-slas');

-- ─── DOC-1: public._wal_slot_guard_events — deny-all intencional ──────────
COMMENT ON TABLE public._wal_slot_guard_events IS
'Auditoria de eventos do WAL slot guard cron.
RLS=true com ZERO policies = deny-all para authenticated/anon (INTENCIONAL).
Escrita exclusivamente por service_role via cron. Nunca expor via PostgREST.
Acesso: service_role / psql direto. Auditoria 2026-07-17: confirmado correto.';

-- ─── VERIFICAÇÃO FINAL ────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT prosrc LIKE '%floor(EXTRACT%' FROM pg_proc WHERE proname='fn_rate_limit_check'),
    'fn_rate_limit_check: floor(EXTRACT) nao encontrado — fix falhou';
  RAISE NOTICE 'OK: fn_rate_limit_check usa floor(EXTRACT)';

  ASSERT (SELECT count(*) > 0 FROM cron.job WHERE jobname='bpm-check-breached-slas'),
    'bpm-check-breached-slas: cron nao encontrado';
  RAISE NOTICE 'OK: bpm-check-breached-slas cron ativo';

  RAISE NOTICE '✅ 10/10 migration verificada';
END;
$$;
