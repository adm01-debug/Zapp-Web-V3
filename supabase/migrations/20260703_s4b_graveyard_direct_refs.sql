-- ============================================================
-- MIGRAÇÃO S4b: Funções de monitoring → graveyard.evolution_messages_v2 direto
-- Elimina dependência da view alias que podia ser derrubada
-- ============================================================

-- ARQUITETURA FINAL:
-- graveyard.evolution_messages_v2 → parent particionado real
-- evo.evolution_messages_v2 → VIEW alias (autocurado pelo backcompat fn)
-- Funções de monitoring → graveyard direto (robusto)

-- 1. fn_message_rate_5min — graveyard direto
CREATE OR REPLACE FUNCTION public.fn_message_rate_5min()
RETURNS TABLE(msgs_5min int, msgs_per_min numeric, last_msg_at timestamptz,
  age_seconds int, pipeline_health text, hour_brt int, is_business_hours boolean, generated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, graveyard
AS $$
DECLARE
  v_count int; v_last timestamptz; v_age int; v_hour int; v_business boolean; v_health text;
BEGIN
  SELECT count(*), max(created_at) INTO v_count, v_last
    FROM graveyard.evolution_messages_v2
    WHERE created_at > now() - interval '5 minutes';
  v_age := COALESCE(EXTRACT(EPOCH FROM (now() - v_last))::int, 999999);
  v_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_business := v_hour BETWEEN 8 AND 20;
  v_health := CASE
    WHEN v_count >= 5 THEN 'healthy'
    WHEN v_count BETWEEN 1 AND 4 THEN 'low_volume'
    WHEN v_count = 0 AND v_age > 600 AND v_business THEN 'critical_business_hours'
    WHEN v_count = 0 AND v_age > 600 AND NOT v_business THEN 'expected_silence_offhours'
    WHEN v_count = 0 AND v_age <= 600 THEN 'recent_quiet'
    ELSE 'unknown'
  END;
  RETURN QUERY SELECT v_count, ROUND(v_count::numeric/5,2), v_last, v_age, v_health, v_hour, v_business, now();
END;
$$;

-- 2. fn_ensure_evolution_backcompat_views — autocura a view alias
CREATE OR REPLACE FUNCTION evo.fn_ensure_evolution_backcompat_views()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = evo, graveyard, public
AS $$
DECLARE r record; v_count int := 0;
BEGIN
  PERFORM set_config('lock_timeout','3s', true);
  -- GARANTIR view alias evo.evolution_messages_v2 (CRITICO)
  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='evo' AND viewname='evolution_messages_v2') THEN
    EXECUTE 'CREATE VIEW evo.evolution_messages_v2 AS SELECT * FROM graveyard.evolution_messages_v2';
    v_count := v_count + 1;
  END IF;
  -- Views de backcompat em public para tabelas evo
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relname LIKE 'evolution_%' AND c.relkind IN ('r','p')
      AND NOT EXISTS (SELECT 1 FROM pg_class pv JOIN pg_namespace pn ON pn.oid=pv.relnamespace WHERE pn.nspname='public' AND pv.relname=c.relname)
    ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE VIEW public.%I AS SELECT * FROM evo.%I', r.relname, r.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', r.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.relname);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- 3. Recriar view alias agora
CREATE OR REPLACE VIEW evo.evolution_messages_v2 AS
  SELECT * FROM graveyard.evolution_messages_v2;

COMMENT ON VIEW evo.evolution_messages_v2 IS
'ALIAS VIEW autocurada por fn_ensure_evolution_backcompat_views.
Ponta final: graveyard.evolution_messages_v2 (parent real).
Funções de monitoramento usam graveyard diretamente (mais robusto).';
