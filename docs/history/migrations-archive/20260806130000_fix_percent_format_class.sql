-- AG-EX2-04: eliminar CLASSE de bug printf-style (especificador de ponto flutuante)
-- em format() de TODAS as funcoes do DB (falso-negativo estrutural em alertas).
--
-- Cobertura:
--   * 20260806125000 (sessao paralela): evo.fn_detect_spurious_closes,
--     evo.fn_peak_hours_sla_check — ja aplicada e registrada em schema_migrations.
--   * Esta migration: ops.fn_auto_update_backup_sentinel — o codigo ja estava
--     corrigido (round()::text, fix 20260805181000); restava apenas a LITERAL
--     do especificador invalido dentro de um COMENTARIO, que fazia o scan
--     pg_proc.prosrc LIKE '%.0f%' continuar acusando a funcao. Comentario
--     sanitizado abaixo (zero mudanca de comportamento).
--
-- Verificacao apos aplicar: SELECT ... WHERE p.prosrc LIKE '%.0f%' -> 0 linhas.

CREATE OR REPLACE FUNCTION ops.fn_auto_update_backup_sentinel()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_stale_hours numeric;
BEGIN
  SELECT EXTRACT(EPOCH FROM (now() - last_backup_at))/3600
  INTO v_stale_hours FROM ops.backup_sentinel;

  -- Se sentinel foi atualizado ha menos de 20h, nao precisa de acao
  IF COALESCE(v_stale_hours, 999) < 20 THEN
    RETURN jsonb_build_object('action','skipped','stale_hours', round(v_stale_hours::numeric,1));
  END IF;

  -- FIX: era format() com especificador printf-style de ponto flutuante, que o
  -- PostgreSQL nao suporta em format() — trocado por concat com round()
  INSERT INTO zapp.webhook_health_alerts(alert_type, severity, title, details)
  VALUES (
    'backup_sentinel_stale',
    CASE WHEN v_stale_hours > 48 THEN 'critical' ELSE 'high' END,
    'Sentinel de backup obsoleto ha ' || round(v_stale_hours)::text || ' horas',
    jsonb_build_object(
      'stale_hours', round(v_stale_hours::numeric,1),
      'action_required', 'Verificar container supabase-backup e chamar ops.fn_update_backup_sentinel()',
      'runbook', 'docs/RUNBOOK_EDGE_FN_SNAPSHOT.md'
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('action','alert_created','stale_hours', round(v_stale_hours::numeric,1));
END;
$function$;
