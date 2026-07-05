-- Migration: RPC atomica para o rate-limiter do webhook (elimina race condition)
-- 2026-07-04
--
-- Contexto: o rate-limiter (supabase/functions/_shared/rate-limiter.ts) usava
-- select-then-upsert nao-atomico. Sob concorrencia, N requests liam o mesmo
-- event_count antes de qualquer gravar (lost updates). Teste empirico: 200 requests
-- concorrentes contavam apenas 165 (17.5% de perda), furando o limite.
--
-- Esta RPC faz o incremento atomicamente (INSERT ... ON CONFLICT DO UPDATE +1
-- RETURNING), serializado pelo row lock do Postgres. Teste: 200 concorrentes -> 200.

CREATE OR REPLACE FUNCTION public.increment_webhook_rate_limit(
  p_instance_id text,
  p_event_type text,
  p_window_start timestamptz,
  p_limit int
) RETURNS TABLE(current_count int, is_allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $fn$
DECLARE
  v_count int;
BEGIN
  INSERT INTO zapp.webhook_rate_limits(instance_id, event_type, window_start, event_count, created_at)
  VALUES (p_instance_id, p_event_type, p_window_start, 1, now())
  ON CONFLICT (instance_id, event_type, window_start)
  DO UPDATE SET event_count = zapp.webhook_rate_limits.event_count + 1
  RETURNING event_count INTO v_count;

  RETURN QUERY SELECT v_count, (v_count <= p_limit);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, int)
  TO service_role, anon, authenticated;
