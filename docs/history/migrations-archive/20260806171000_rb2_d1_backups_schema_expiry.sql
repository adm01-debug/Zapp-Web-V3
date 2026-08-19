-- Runbook-2 (05/08/2026): Schema _backups + expiração de backups obsoletos (item D-1)
-- ===========================================================================
-- Sync repo x DB: criado diretamente no banco pelos agentes do runbook-2 em
-- 05/08/2026 SEM cobertura versionada:
--   1. schema _backups (tabelas de backup arquivadas de operações de cutover)
--   2. _backups.backup_metadata — registro de tabelas de backup (id serial,
--      table_name, backup_date, row_count, size_bytes, created_at,
--      retention_until DEFAULT now()+30d; PK id + UNIQUE (table_name, backup_date))
--   3. ops.fn_expire_stale_backups(p_max_age_days int DEFAULT 90) SECURITY
--      DEFINER — dropa tabelas expiradas em _backups e limpa metadata órfã
--   4. cron job 'expire-stale-backups' (jobid 249, '0 4 * * *',
--      SELECT ops.fn_expire_stale_backups(90)) — verificado em cron.job
--
-- Corpo da função espelha pg_get_functiondef do banco canônico (byte-exact,
-- incluindo o SET search_path TO ''). Re-aplicação é no-op por construção:
-- CREATE SCHEMA/TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION e
-- cron.schedule (upsert por jobname, preserva o jobid existente).
-- ===========================================================================

CREATE SCHEMA IF NOT EXISTS _backups;

CREATE SEQUENCE IF NOT EXISTS _backups.backup_metadata_id_seq;

CREATE TABLE IF NOT EXISTS _backups.backup_metadata (
  id bigint NOT NULL DEFAULT nextval('_backups.backup_metadata_id_seq'::regclass),
  table_name text NOT NULL,
  backup_date date NOT NULL,
  row_count integer,
  size_bytes bigint,
  created_at timestamp NOT NULL DEFAULT now(),
  retention_until timestamp NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT backup_metadata_pkey PRIMARY KEY (id),
  CONSTRAINT backup_metadata_table_name_backup_date_key UNIQUE (table_name, backup_date)
);

CREATE OR REPLACE FUNCTION ops.fn_expire_stale_backups(p_max_age_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_dropped int := 0;
  v_skipped int := 0;
  v_rec record;
  v_tbl text;
  v_cutoff timestamptz := now() - make_interval(days := p_max_age_days);
  v_log jsonb := '[]';
BEGIN
  -- Politica: expira se retention_until venceu OU (sem retention_until e backup_date mais velho que p_max_age_days)
  FOR v_rec IN
    SELECT table_name, backup_date, retention_until
    FROM _backups.backup_metadata
    WHERE (retention_until IS NOT NULL AND retention_until < now())
       OR (retention_until IS NULL AND backup_date < v_cutoff::date)
    ORDER BY backup_date
  LOOP
    v_tbl := '_backups.' || quote_ident(v_rec.table_name);
    IF to_regclass(v_tbl) IS NULL THEN
      -- tabela ja nao existe: limpa metadata orfao
      DELETE FROM _backups.backup_metadata WHERE table_name = v_rec.table_name;
      v_log := v_log || jsonb_build_object('table', v_rec.table_name, 'action', 'metadata_cleanup');
    ELSE
      EXECUTE format('DROP TABLE %s', v_tbl);
      DELETE FROM _backups.backup_metadata WHERE table_name = v_rec.table_name;
      v_dropped := v_dropped + 1;
      v_log := v_log || jsonb_build_object('table', v_rec.table_name, 'action', 'dropped', 'backup_date', v_rec.backup_date);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('dropped', v_dropped, 'metadata_cleanup', v_skipped, 'checked_at', now(), 'log', v_log);
END $function$;

-- Job diário 04:00 UTC (upsert por nome — idempotente; jobid 249 preservado)
SELECT cron.schedule('expire-stale-backups', '0 4 * * *', $$SELECT ops.fn_expire_stale_backups(90)$$);
