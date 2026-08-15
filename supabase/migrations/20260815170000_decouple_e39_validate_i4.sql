-- =============================================================================
-- E39 — Validação I4 (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: confirmar que nenhuma função nos schemas zapp ou evo usa
-- net.http_post ou net.http_get diretamente em prosrc (invariante I4 = PASS).
-- Se houver violações, registra no log e gera WARNING (sem bloquear deploy).
-- =============================================================================

DO $$
DECLARE
  v_violations  jsonb;
  v_count       int;
  v_rec         record;
BEGIN
  -- Coleta funções com chamadas diretas a net.http_post ou net.http_get
  SELECT
    count(*),
    jsonb_agg(jsonb_build_object(
      'schema',    n.nspname,
      'function',  p.proname,
      'oid',       p.oid
    ))
  INTO v_count, v_violations
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('zapp', 'evo')
    AND (
      pg_get_functiondef(p.oid) ILIKE '%net.http_post%'
      OR pg_get_functiondef(p.oid) ILIKE '%net.http_get%'
    );

  IF v_count = 0 THEN
    RAISE NOTICE '[E39] I4 = PASS — zero violações net.http_* em schemas zapp/evo.';
  ELSE
    RAISE WARNING '[E39] I4 = FAIL — % função(ões) ainda usam net.http_* diretamente: %',
      v_count, v_violations;

    -- Exibe cada violação individualmente para facilitar diagnóstico
    FOR v_rec IN
      SELECT
        n.nspname AS schema_name,
        p.proname AS func_name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('zapp', 'evo')
        AND (
          pg_get_functiondef(p.oid) ILIKE '%net.http_post%'
          OR pg_get_functiondef(p.oid) ILIKE '%net.http_get%'
        )
      ORDER BY n.nspname, p.proname
    LOOP
      RAISE WARNING '[E39]   → %.%', v_rec.schema_name, v_rec.func_name;
    END LOOP;
  END IF;

  -- Registra resultado na tabela de alertas se ela existir
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'zapp' AND tablename = 'evolution_alerts'
  ) THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES (
      'decouple_validation',
      CASE WHEN v_count = 0 THEN 'info' ELSE 'critical' END,
      'E39 — Validação I4 net.http_*',
      CASE
        WHEN v_count = 0
        THEN 'I4 = PASS: zero funções em zapp/evo usam net.http_post/get direto.'
        ELSE format('I4 = FAIL: %s função(ões) ainda violam I4. Veja payload.', v_count)
      END,
      jsonb_build_object(
        'etapa',        'E39',
        'invariante',   'I4',
        'resultado',    CASE WHEN v_count = 0 THEN 'PASS' ELSE 'FAIL' END,
        'violacoes',    COALESCE(v_violations, '[]'::jsonb),
        'validado_em',  now()
      )
    );
  END IF;
END;
$$;
