-- Tabela de telemetria de fallback FATOR X
-- Persiste cada evento [evolution-fallback] emitido pela edge function evolution-api
-- Permite agregar contadores por ação/instância/janela de tempo no painel admin

CREATE TABLE IF NOT EXISTS public.evolution_fallback_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  action TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  instance TEXT,
  status INTEGER NOT NULL,
  reason TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'detected',
  fallback_target TEXT NOT NULL,
  primary_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_fallback_events_ts
  ON public.evolution_fallback_events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_fallback_events_action_ts
  ON public.evolution_fallback_events (action, ts DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_fallback_events_instance_ts
  ON public.evolution_fallback_events (instance, ts DESC);

ALTER TABLE public.evolution_fallback_events ENABLE ROW LEVEL SECURITY;

-- Apenas admin/supervisor podem ler. INSERT é exclusivo do service_role
-- (edge function evolution-api). Sem políticas de UPDATE/DELETE — eventos são imutáveis.
CREATE POLICY "Admin/supervisor can read fallback events"
  ON public.evolution_fallback_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- RPC agregadora consumida pelo card no painel admin
CREATE OR REPLACE FUNCTION public.rpc_evolution_fallback_stats(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hours integer;
  v_total bigint;
  v_total_7d bigint;
  v_total_1h bigint;
  v_last_event timestamptz;
  v_first_event timestamptz;
  v_by_action jsonb;
  v_by_reason jsonb;
  v_by_instance jsonb;
  v_recent jsonb;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_hours := GREATEST(1, LEAST(COALESCE(p_hours, 24), 720));

  SELECT COUNT(*), MIN(ts), MAX(ts)
    INTO v_total, v_first_event, v_last_event
    FROM public.evolution_fallback_events
   WHERE ts > now() - (v_hours || ' hours')::interval;

  SELECT COUNT(*) INTO v_total_7d
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '7 days';

  SELECT COUNT(*) INTO v_total_1h
    FROM public.evolution_fallback_events
   WHERE ts > now() - interval '1 hour';

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_action FROM (
    SELECT action, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY action
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_reason FROM (
    SELECT reason, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY reason
     ORDER BY COUNT(*) DESC
  ) t;

  SELECT COALESCE(jsonb_agg(t.*), '[]'::jsonb) INTO v_by_instance FROM (
    SELECT COALESCE(instance, '(sem instância)') AS instance, COUNT(*)::int AS count
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     GROUP BY instance
     ORDER BY COUNT(*) DESC
     LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(t.* ORDER BY t.ts DESC), '[]'::jsonb) INTO v_recent FROM (
    SELECT ts, action, instance, status, reason, mode, fallback_target, primary_ms
      FROM public.evolution_fallback_events
     WHERE ts > now() - (v_hours || ' hours')::interval
     ORDER BY ts DESC
     LIMIT 25
  ) t;

  RETURN jsonb_build_object(
    'window_hours', v_hours,
    'total', COALESCE(v_total, 0),
    'total_last_hour', COALESCE(v_total_1h, 0),
    'total_last_7d', COALESCE(v_total_7d, 0),
    'first_event_at', v_first_event,
    'last_event_at', v_last_event,
    'by_action', v_by_action,
    'by_reason', v_by_reason,
    'by_instance', v_by_instance,
    'recent', v_recent
  );
END;
$function$;

-- Limpeza após 30 dias (cron pode chamar isso)
CREATE OR REPLACE FUNCTION public.cleanup_evolution_fallback_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.evolution_fallback_events
   WHERE ts < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;